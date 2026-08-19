/**
 * Cold-resume / fresh-start team-role warm roster: a team-role child's FIRST
 * request must render the authority table, so a persistent role's request
 * prefix stays byte-stable across a cold resume. The `teams` service must be
 * composed before the child's creation window applies the team tool —
 * otherwise the apply's async `refreshRoleCatalogue` kick returns early (the
 * tool keeps its last-known-good, which for a fresh scope is empty) and the
 * authority table toggles in only after the first request has rendered.
 *
 * `waitForTeamCatalogue` closes that window: it holds the materialization until
 * the `teams` service is composed (bounded, fail-soft), so the child's own kick
 * lands before its first request.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { mkdir as mkdirPromise, mkdtemp as mkdtempPromise, writeFile as writeFilePromise } from 'node:fs/promises'
import { rmSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import { mountAgentLoopTestDependencies } from '@deepseek-ai/dsh-agent-loop-testkit'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import type { Agent } from '@deepseek-ai/dsh-agent'
import AgentPresets from '@deepseek-ai/dsh-agent-presets'
import SubagentPresets from '../../src/preset/index.ts'
import Teams from '../../src/team/index.ts'
import { SessionId } from '@deepseek-ai/dsh-session'
import { LlmAdapter, type GenerateOptions, type StreamChunk } from '@deepseek-ai/dsh-llm'
import SandboxPolicyService from '@deepseek-ai/dsh-sandbox-policy'
import JsonlSessionPersistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import ApprovalService from '@deepseek-ai/dsh-user-approval'
import { textResponse } from './mock-adapter.ts'
import HarnessSubagentRuntime from '../../src/in-process/service.ts'
import * as spawnPlugin from '../../src/in-process/spawn.ts'
import { awaitTeamRoster, waitForTeamCatalogue } from '../../src/in-process/engine.ts'

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures')
const ROOTS = [{ path: join(FIXTURES, 'presets'), trust: 'system' as const }]
// The fixture plugin used as a mountable subagent tool, resolved by absolute
// path so a dynamically-created subagent directory can mount it.
const FIXTURE_TOOL = fileURLToPath(new URL('../in-process/fixtures/plugins/preset-tool.js', import.meta.url))

/** Adapter whose every child turn waits on the NEXT caller-registered gate. */
class GatedAdapter extends LlmAdapter {
  readonly gates: PromiseWithResolvers<undefined>[] = []

  async * stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    const gate = this.gates.shift()
    if (gate) await gate.promise
    for (const chunk of textResponse('child done')) {
      if (options.signal?.aborted) throw new Error('aborted')
      yield chunk
    }
  }
}

/** Write one mountable subagent directory acting as a role subagent. */
async function writeSubagent(root: string, id: string, tool: string): Promise<void> {
  const dir = join(root, id)
  await mkdirPromise(dir, { recursive: true })
  await writeFilePromise(join(dir, 'agent.cordis.yml'),
    `- id: tool\n  name: ${JSON.stringify(FIXTURE_TOOL)}\n  config:\n    tool: ${tool}\n`)
  await writeFilePromise(join(dir, 'subagent.yml'), 'enabled: true\n')
}

/** Write one team with a persistent role (level defaults to 1). */
async function writeTeam(root: string, id: string, subagent: string): Promise<void> {
  const dir = join(root, id)
  await mkdirPromise(dir, { recursive: true })
  await writeFilePromise(join(dir, 'team.yml'),
    `metadata:\n  name: ${id}\n  enabled: true\nroles:\n`
    + `  - id: copywriter\n    subagent: ${subagent}\n    prompt: v1\n    memory: persistent\n`)
}

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms))

describe('waitForTeamCatalogue (warm roster ordering)', () => {
  it('holds while the teams service is absent and resolves once it is composed', async () => {
    const ctx = new Context()
    const teamRoot = await mkdtempPromise(join(tmpdir(), 'dsh-warm-helper-team-'))
    try {
      await writeTeam(teamRoot, 'edit', 'writer')
      // No `teams` service yet: the wait must HOLD, not resolve immediately.
      const pending = waitForTeamCatalogue(ctx, new AbortController().signal, 500)
      await expect(Promise.race([pending.then(() => 'resolved'), sleep(40).then(() => 'still-waiting')]))
        .resolves.toBe('still-waiting')
      // Compose teams "late": the pending wait must now resolve with the service.
      await ctx.plugin(Teams, { roots: [{ path: teamRoot, trust: 'system' }], includeUserRoot: false })
      await expect(pending).resolves.toBeDefined()
      expect(ctx.get('teams')).toBeDefined()
    } finally {
      await ctx.fiber.dispose()
      rmSync(teamRoot, { recursive: true, force: true })
    }
  })

  it('returns immediately when the teams service is already composed', async () => {
    const ctx = new Context()
    const teamRoot = await mkdtempPromise(join(tmpdir(), 'dsh-warm-helper-team-'))
    try {
      await writeTeam(teamRoot, 'edit', 'writer')
      await ctx.plugin(Teams, { roots: [{ path: teamRoot, trust: 'system' }], includeUserRoot: false })
      const started = Date.now()
      await waitForTeamCatalogue(ctx, new AbortController().signal, 500)
      // No polling delay: an already-composed service is hit on the first probe.
      expect(Date.now() - started).toBeLessThan(50)
    } finally {
      await ctx.fiber.dispose()
      rmSync(teamRoot, { recursive: true, force: true })
    }
  })

  it('fails soft (returns) when the teams service never appears', async () => {
    const ctx = new Context()
    try {
      const started = Date.now()
      await waitForTeamCatalogue(ctx, new AbortController().signal, 40)
      expect(Date.now() - started).toBeGreaterThanOrEqual(40)
      expect(ctx.get('teams')).toBeUndefined()
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('settles a fresh roster fill via awaitTeamRoster (issues the same underlying read)', async () => {
    const ctx = new Context()
    const teamRoot = await mkdtempPromise(join(tmpdir(), 'dsh-warm-roster-team-'))
    try {
      await writeTeam(teamRoot, 'edit', 'writer')
      await ctx.plugin(Teams, { roots: [{ path: teamRoot, trust: 'system' }], includeUserRoot: false })
      // Simulate a freshly-applied tool: the roster closure is not observable,
      // but awaiting one `teams.list()` issued after the apply's own kick (the
      // same underlying discovery) deterministically lets the fill settle, so
      // the subsequent call sees the freshly-read rows.
      await awaitTeamRoster(ctx, new AbortController().signal)
      const rows = await ctx.get('teams')!.list()
      const edit = rows.find(t => t.id === 'edit')
      expect(edit).toBeDefined()
      expect(edit!.roles.map(r => r.id)).toContain('copywriter')
    } finally {
      await ctx.fiber.dispose()
      rmSync(teamRoot, { recursive: true, force: true })
    }
  })

  it('awaitTeamRoster fails soft when the teams service is absent', async () => {
    const ctx = new Context()
    try {
      await expect(awaitTeamRoster(ctx, new AbortController().signal)).resolves.toBeUndefined()
    } finally {
      await ctx.fiber.dispose()
    }
  })
})

describe('cold resume waits for the teams service before materializing a team role', () => {
  let ctx: Context
  let parent: Agent
  let adapter: GatedAdapter
  let subagentRoot: string
  let teamRoot: string
  let teamsPlugin: ReturnType<Context['plugin']> | undefined

  const mountTeams = async (): Promise<void> => {
    teamsPlugin = await ctx.plugin(Teams, { roots: [{ path: teamRoot, trust: 'system' }], includeUserRoot: false })
  }

  beforeAll(async () => {
    ctx = new Context()
    ctx.baseUrl = pathToFileURL(FIXTURES).href + '/'
    await ctx.plugin(Loader)
    ctx.loader.builtins.include = Include
    await mountAgentLoopTestDependencies(ctx)
    subagentRoot = mkdtempSync(join(tmpdir(), 'dsh-warm-subagent-'))
    teamRoot = mkdtempSync(join(tmpdir(), 'dsh-warm-team-'))
    await writeSubagent(subagentRoot, 'writer', 'writer_tool')
    await writeTeam(teamRoot, 'edit', 'writer')
    const persistenceRoot = mkdtempSync(join(tmpdir(), 'dsh-warm-persist-'))
    await ctx.plugin(JsonlSessionPersistence, { root: persistenceRoot })
    await ctx.plugin(SandboxPolicyService, { mode: 'workspace-write', workspaceRoot: persistenceRoot })
    await ctx.plugin(ApprovalService)
    await ctx.plugin(AgentLoop, { agents: [] })
    await ctx.plugin(AgentPresets, { default: 'coding', roots: ROOTS, includeUserRoot: false })
    await ctx.plugin(SubagentPresets, { roots: [{ path: subagentRoot, trust: 'system' }], includeUserRoot: false })
    await mountTeams()
    await ctx.plugin(HarnessSubagentRuntime)
    await ctx.plugin(spawnPlugin, { providerName: 'spawn' })
    adapter = new GatedAdapter()
    ctx.llm.registerAdapter(['mock'], adapter)
    const handle = await ctx.agents.create({
      sessionId: SessionId('parent'),
      agentOptions: { provider: 'mock', model: 'mock' },
      setup: async (agentCtx: Context) => void await ctx.agentPresets.mount(agentCtx, 'coding'),
    })
    parent = handle.agent
  })

  const startPersistentRole = async (): Promise<SessionId> => {
    const gate = Promise.withResolvers<undefined>()
    adapter.gates.push(gate)
    const started = await ctx.subagents.startContinuable({
      provider: 'spawn',
      label: 'role task',
      request: {
        prompt: [{ type: 'text' as const, text: 'role task' }],
        parent,
        subagent: 'writer',
        team: 'edit',
        role: 'copywriter',
      },
      signal: new AbortController().signal,
    })
    release(gate)
    await waitNoActivation(ctx, started.childId)
    return started.childId
  }

  it('resumes only after the teams service is composed (materialization ordering)', async () => {
    const childId = await startPersistentRole()
    // Make the `teams` service absent right before the cold resume: the wait
    // must hold the materialization until it is composed again.
    await teamsPlugin?.dispose()
    expect(ctx.get('teams')).toBeUndefined()

    const gate2 = Promise.withResolvers<undefined>()
    adapter.gates.push(gate2)
    const followup = ctx.subagents.followup(parent, childId, [
      { type: 'text' as const, text: 'continue' },
    ], {
      source: { kind: 'user' },
      signal: new AbortController().signal,
    })

    // The child must NOT be resumed while `teams` is absent (the wait holds):
    // `waitForTeamCatalogue` gates the materialization before `agents.resume()`.
    await sleep(60)
    expect(ctx.agents.get(childId)).toBeUndefined()

    // Compose `teams` late: the held materialization now proceeds to resume.
    await mountTeams()
    const resumedMessage = await followup
    expect(resumedMessage).toBeDefined()
    const resumed = ctx.agents.get(childId)
    expect(resumed).toBeDefined()

    release(gate2)
    await waitNoActivation(ctx, childId)
  })

  afterAll(async () => {
    await ctx.fiber.dispose()
    rmSync(subagentRoot, { recursive: true, force: true })
    rmSync(teamRoot, { recursive: true, force: true })
  })
})

/** Release one gated turn so the child can complete and settle. */
function release(gate: PromiseWithResolvers<undefined>): void {
  gate.resolve(undefined)
}

/** Wait until the child's Activation is gone, i.e. its handle finished disposal. */
async function waitNoActivation(ctx: Context, childId: SessionId): Promise<void> {
  await vi.waitFor(() => {
    expect(ctx.agents.get(childId)).toBeUndefined()
  }, { timeout: 15_000 })
}
