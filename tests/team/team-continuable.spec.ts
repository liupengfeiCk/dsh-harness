/**
 * Persistent team role continuation: a `persistent` role starts a durable
 * continuable child whose descriptor persists `{ team, role }`, and a cold
 * resume re-resolves the role from the team's LATEST definition — "reference
 * semantics" — re-injecting its current soul persona and body tree.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { mkdir as mkdirPromise, writeFile as writeFilePromise } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import type { Agent } from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import { mountAgentLoopTestDependencies } from '@deepseek-ai/dsh-agent-loop-testkit'
import AgentPresets from '@deepseek-ai/dsh-agent-presets'
import SubagentPresets from '../../src/preset/index.ts'
import Teams from '../../src/team/index.ts'
import { SessionId } from '@deepseek-ai/dsh-session'
import { LlmAdapter, type GenerateOptions, type StreamChunk } from '@deepseek-ai/dsh-llm'
import SandboxPolicyService from '@deepseek-ai/dsh-sandbox-policy'
import JsonlSessionPersistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import ApprovalService from '@deepseek-ai/dsh-user-approval'
import { textResponse } from '../in-process/mock-adapter.ts'
import HarnessSubagentRuntime from '../../src/in-process/service.ts'
import * as spawnPlugin from '../../src/in-process/spawn.ts'

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '../in-process/fixtures')
const ROOTS = [{ path: join(FIXTURES, 'presets'), trust: 'system' as const }]
// The fixture plugin used as an observable body tool; referenced by absolute
// path so a dynamically-created body composition can mount it.
const FIXTURE_TOOL = fileURLToPath(new URL('../in-process/fixtures/plugins/preset-tool.js', import.meta.url))

/**
 * Adapter whose every child turn waits on the NEXT caller-registered gate, so a
 * test can hold a fresh child's first turn open to read its composition before
 * it settles.
 */
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

/** Release one gated turn so the child can complete and settle. */
function release(gate: PromiseWithResolvers<undefined>): void {
  gate.resolve(undefined)
}

/** Write one body subagent whose composition mounts one observable tool. */
async function writeBody(root: string, id: string, tool: string): Promise<void> {
  const dir = join(root, id)
  await mkdirPromise(dir, { recursive: true })
  await writeFilePromise(join(dir, 'agent.cordis.yml'),
    `- id: tool\n  name: ${JSON.stringify(FIXTURE_TOOL)}\n  config:\n    tool: ${tool}\n`)
  await writeFilePromise(join(dir, 'subagent.yml'), 'enabled: true\n')
}

/** Write one team directory binding a role to a body/soul. */
async function writeTeam(root: string, id: string, body: string, prompt: string): Promise<void> {
  const dir = join(root, id)
  await mkdirPromise(dir, { recursive: true })
  await writeFilePromise(join(dir, 'team.yml'),
    `metadata:\n  name: ${id}\n  enabled: true\nroles:\n  - id: copywriter\n    body: ${body}\n    prompt: ${prompt}\n    memory: persistent\n`)
}

/** Wait until the child's Activation is gone, i.e. its handle finished disposal. */
async function waitNoActivation(ctx: Context, childId: SessionId): Promise<void> {
  await vi.waitFor(() => {
    expect(ctx.agents.get(childId)).toBeUndefined()
  }, { timeout: 15_000 })
}

describe('persistent team role continuation (harness service)', () => {
  let ctx: Context
  let parent: Agent
  let adapter: GatedAdapter
  let bodyRoot: string
  let teamRoot: string

  beforeAll(async () => {
    ctx = new Context()
    ctx.baseUrl = pathToFileURL(FIXTURES).href + '/'
    await ctx.plugin(Loader)
    ctx.loader.builtins.include = Include
    await mountAgentLoopTestDependencies(ctx)
    bodyRoot = mkdtempSync(join(tmpdir(), 'dsh-team-cont-body-'))
    teamRoot = mkdtempSync(join(tmpdir(), 'dsh-team-cont-team-'))
    await writeBody(bodyRoot, 'writer', 'writer_tool')
    await writeBody(bodyRoot, 'rewriter', 'rewriter_tool')
    await writeTeam(teamRoot, 'edit', 'writer', 'v1')
    const persistenceRoot = mkdtempSync(join(tmpdir(), 'dsh-team-cont-persist-'))
    await ctx.plugin(JsonlSessionPersistence, { root: persistenceRoot })
    await ctx.plugin(SandboxPolicyService, { mode: 'workspace-write', workspaceRoot: persistenceRoot })
    await ctx.plugin(ApprovalService)
    await ctx.plugin(AgentLoop, { agents: [] })
    await ctx.plugin(AgentPresets, { default: 'coding', roots: ROOTS, includeUserRoot: false })
    await ctx.plugin(SubagentPresets, { roots: [{ path: bodyRoot, trust: 'system' }], includeUserRoot: false })
    await ctx.plugin(Teams, { roots: [{ path: teamRoot, trust: 'system' }], includeUserRoot: false })
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

  it('persists the durable team/role identity and cold-resumes against the latest team definition', async () => {
    // First residency epoch: start a persistent-role child carrying the body
    // (writer → writer_tool) and the team/role identity.
    const gate = Promise.withResolvers<undefined>()
    adapter.gates.push(gate)
    const started = await ctx.subagents.startContinuable({
      provider: 'spawn',
      label: 'role task',
      request: {
        prompt: [{ type: 'text' as const, text: 'role task' }],
        parent,
        subagent: 'writer',
        persona: 'v1',
        team: 'edit',
        role: 'copywriter',
      },
      signal: new AbortController().signal,
    })
    const first = ctx.agents.get(started.childId)
    expect(first).toBeDefined()
    // The created child is composed from the role's initial body.
    expect(ctx.tools.schemas(first as Agent).map(s => s.name)).toContain('writer_tool')
    release(gate)
    await waitNoActivation(ctx, started.childId)

    // The descriptor persists the team/role identity and the body/soul it was
    // created with.
    const loaded = await ctx.sessionPersistence.load(started.childId)
    const descriptor = loaded.events.find(event => event.type === 'subagent/descriptor')
    expect(descriptor?.data).toMatchObject({
      mode: 'continuable',
      subagent: 'writer',
      persona: 'v1',
      team: 'edit',
      role: 'copywriter',
    })

    // Edit the team file: the role now binds a DIFFERENT body/soul. A cold
    // resume must re-resolve the role's LATEST definition ("reference
    // semantics") and re-inject it, rather than keeping the persisted writer.
    await writeTeam(teamRoot, 'edit', 'rewriter', 'v2')
    const gate2 = Promise.withResolvers<undefined>()
    adapter.gates.push(gate2)
    const resumedMessage = await ctx.subagents.followup(parent, started.childId, [
      { type: 'text' as const, text: 'continue' },
    ], {
      source: { kind: 'user' },
      signal: new AbortController().signal,
    })
    expect(resumedMessage).toBeDefined()
    const resumed = ctx.agents.get(started.childId)
    expect(resumed).toBeDefined()
    // The resumed child's BODY reflects the updated team definition: it now
    // mounts `rewriter_tool` (the new body) instead of the persisted `writer_tool`.
    const toolNames = ctx.tools.schemas(resumed as Agent).map(s => s.name)
    expect(toolNames).toContain('rewriter_tool')
    expect(toolNames).not.toContain('writer_tool')
    release(gate2)
    await waitNoActivation(ctx, started.childId)
  })

  afterAll(async () => {
    await ctx.fiber.dispose()
    rmSync(bodyRoot, { recursive: true, force: true })
    rmSync(teamRoot, { recursive: true, force: true })
  })
})
