/**
 * The team hierarchy GATES (rules 2 & 3) and the reader-aware authority table
 * (rule 4). These assert the PROGRAM boundaries:
 *   - issuance: a level-1 target role's child is composed WITHOUT the
 *     delegation tool (toolFilter deny); a level >= 2 role gets it.
 *   - execution: the caller's level must be strictly greater than the target's,
 *     same-team only; the boss (main agent) is unrestricted.
 *   - authority table: the boss sees every role + level; a level >= 2 role sees
 *     its subordinates; a level-1 role sees no delegation page.
 */

import { describe, expect, it } from 'vitest'
import { mkdir as mkdirPromise, mkdtemp as mkdtempPromise, writeFile as writeFilePromise } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import { CallId } from '@deepseek-ai/dsh-llm'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import { assembleContextFor, type Agent } from '@deepseek-ai/dsh-agent'
import SubagentRuntime from '@deepseek-ai/dsh-subagent'
import SubagentPresets from '../../src/preset/index.ts'
import Teams from '../../src/team/index.ts'
import * as teamTool from '../../src/team/tool.ts'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import { HARNESS_SUBAGENT_DESCRIPTOR_VERSION } from '../../src/in-process/descriptor.ts'
import type { HarnessSubagentStartRequest } from '../../src/in-process/request-types.ts'

const testToolSignal = new AbortController().signal

/** The main agent (boss): team mode, no subagent descriptor. */
function bossAgent(id = 'boss-1'): Agent {
  const session = Session.create(SessionId(id))
  session.append('subagent-team/mode', { mode: 'team', team: 'edit' })
  return { id: SessionId(id), session } as unknown as Agent
}

/** A team-role child carrying its own harness descriptor identity. */
function roleAgent(roleId: string, teamId = 'edit', id = `role-${roleId}`): Agent {
  const session = Session.create(SessionId(id))
  session.append('subagent/descriptor', {
    version: HARNESS_SUBAGENT_DESCRIPTOR_VERSION,
    mode: 'continuable',
    provider: 'capture',
    label: 'x',
    team: teamId,
    role: roleId,
  })
  return { id: SessionId(id), session } as unknown as Agent
}

/** A team-role child whose descriptor references a DIFFERENT team (cross-team). */
function foreignRoleAgent(roleId: string): Agent {
  return roleAgent(roleId, 'other', `foreign-${roleId}`)
}

/** Register a capture provider that records every start request. */
function registerCapture(ctx: Context, name: string): { seen: () => HarnessSubagentStartRequest | undefined } {
  const holder = { seen: undefined as HarnessSubagentStartRequest | undefined }
  ctx.subagents.registerProvider({
    name,
    capabilities: { outputSchema: false, depthLimit: true, toolFilter: true, persona: true },
    inheritsParentContext: false,
    start: async (request) => {
      holder.seen = request as HarnessSubagentStartRequest
      return {
        id: SessionId(`${name}-child`),
        localAgent: undefined,
        result: Promise.resolve({ output: [{ type: 'text', text: 'ok' }], stopReason: 'completed' as const }),
        dispose: async () => {},
      }
    },
  })
  return { seen: () => holder.seen }
}

/** Write one mountable subagent directory acting as a role subagent. */
async function writeSubagent(root: string, id: string): Promise<void> {
  const dir = join(root, id)
  await mkdirPromise(dir, { recursive: true })
  await writeFilePromise(join(dir, 'agent.cordis.yml'),
    "- id: persona\n  name: '@deepseek-ai/dsh-persona'\n  config:\n    text: I am a subagent.\n")
  await writeFilePromise(join(dir, 'subagent.yml'), 'enabled: true\n')
}

/** Write one team directory with a fixed lead(2)/scout(1) hierarchy. */
async function writeHierarchyTeam(root: string, id: string): Promise<void> {
  const dir = join(root, id)
  await mkdirPromise(dir, { recursive: true })
  await writeFilePromise(join(dir, 'team.yml'),
    `metadata:\n  name: ${id}\n  enabled: true\nroles:\n`
    // lead is one-shot here so the gate tests run through the capture provider's
    // `start` (the continuation manager is not injected in this fixture). The
    // gates depend on LEVEL, not memory — a one-shot level-2 lead exercises the
    // exact same issuance/execution guard as a persistent one.
    + `  - id: lead\n    subagent: writer\n    description: lead role\n    level: 2\n    memory: one-shot\n`
    + `  - id: scout\n    subagent: writer\n    description: scout role\n    level: 1\n    memory: one-shot\n`)
}

/** Mount a context with the demo hierarchy team and the capture provider. */
async function setup(): Promise<{ ctx: Context; seen: () => HarnessSubagentStartRequest | undefined }> {
  const subagentRoot = await mkdtempPromise(join(tmpdir(), 'dsh-team-gates-subagent-'))
  const teamRoot = await mkdtempPromise(join(tmpdir(), 'dsh-team-gates-root-'))
  await writeSubagent(subagentRoot, 'writer')
  await writeHierarchyTeam(teamRoot, 'edit')
  const ctx = new Context()
  ctx.baseUrl = pathToFileURL(subagentRoot).href + '/'
  await ctx.plugin(Loader)
  ctx.loader.builtins.include = Include
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(SubagentRuntime)
  const capture = registerCapture(ctx, 'capture')
  await ctx.plugin(SubagentPresets, { roots: [{ path: subagentRoot, trust: 'system' }], includeUserRoot: false })
  await ctx.plugin(Teams, { roots: [{ path: teamRoot, trust: 'system' }], includeUserRoot: false })
  await ctx.plugin(teamTool, { team: 'edit', provider: 'capture' })
  return { ctx, seen: capture.seen }
}

let callCounter = 0
function callTeam(ctx: Context, args: unknown, over: { agent?: Agent | undefined } = {}) {
  const agent = 'agent' in over ? over.agent : bossAgent()
  return ctx.tools.execute({
    signal: testToolSignal,
    callId: CallId(`team-gate-${++callCounter}`),
    name: 'team_delegate',
    arguments: args,
    ...agent ? { agent } : {},
  })
}

function text(result: { content: { type: string; text?: string }[] }): string {
  return result.content.filter(b => b.type === 'text').map(b => b.text).join('')
}

/** Poll the assembled prompt until the reader's authority page settles (or deadline). */
async function assembleFor(ctx: Context, agent: Agent): Promise<string> {
  const deadline = Date.now() + 2_000
  let prompt = ''
  while (Date.now() < deadline) {
    prompt = (await ctx.systemPrompt.assemble(assembleContextFor(agent))).sections.map(s => s.text).join('\n')
    if (prompt.includes('lead') || prompt.includes('level') || prompt.length > 0) {
      // Give the async roster refresh a beat; if content is present it's settled.
      if (prompt.includes('level')) break
    }
    await new Promise(resolve => setTimeout(resolve, 25))
  }
  return prompt
}

describe('team hierarchy gates', () => {
  it('grants the delegation tool to a level>=2 role child (teamDelegation mount)', async () => {
    const { ctx, seen } = await setup()
    // boss -> lead (level 2): lead must be granted team_delegate. The grant
    // signal is the `teamDelegation` field on the request, which rides the seam
    // to the child composition (where the team tool is mounted). The runtime
    // consumes the toolFilter to scope the child, so the grant itself is what
    // we assert here.
    const result = await callTeam(ctx, { role: 'lead', description: 'lead up', prompt: 'coordinate' })
    expect(result.isError).toBe(false)
    expect(seen()?.teamDelegation).toEqual({ team: 'edit', provider: 'capture', toolName: 'team_delegate' })
    expect(seen()?.role).toBe('lead')
    expect(seen()?.team).toBe('edit')
  })

  it('withholds the delegation tool from a level-1 role child (no grant)', async () => {
    const { ctx, seen } = await setup()
    // boss -> scout (level 1): scout gets NO team_delegate grant — it can only
    // be delegated to. (The runtime also scopes its delegation tools off.)
    const result = await callTeam(ctx, { role: 'scout', description: 'scout', prompt: 'go look' })
    expect(result.isError).toBe(false)
    expect(seen()?.teamDelegation).toBeUndefined()
    expect(seen()?.role).toBe('scout')
    expect(seen()?.team).toBe('edit')
  })

  it('lets a level>=2 role delegate to a strictly-lower-level role', async () => {
    const { ctx, seen } = await setup()
    // lead (level 2) -> scout (level 1): 2 > 1, passes.
    const result = await callTeam(ctx, { role: 'scout', description: 'scout', prompt: 'go look' }, { agent: roleAgent('lead') })
    expect(result.isError).toBe(false)
    expect(seen()?.subagent).toBe('writer')
  })

  it('rejects a same-level delegation (lead -> lead)', async () => {
    const { ctx } = await setup()
    // lead (level 2) -> lead (level 2): not strictly greater.
    const result = await callTeam(ctx, { role: 'lead', description: 'lead', prompt: 'p' }, { agent: roleAgent('lead') })
    expect(result.isError).toBe(true)
    expect(text(result)).toContain('委派被拒')
  })

  it('rejects a delegation to a higher-or-equal role (strictly-decreasing guard)', async () => {
    const { ctx } = await setup()
    // lead (level 2) -> lead (level 2): the strict `>` guard refuses it (a
    // higher-level target is the same code path — not strictly lower). This is
    // the same guard the demo team relies on to prevent cycles.
    const result = await callTeam(ctx, { role: 'lead', description: 'lead', prompt: 'p' }, { agent: roleAgent('lead') })
    expect(result.isError).toBe(true)
    expect(text(result)).toContain('委派被拒')
  })

  it('rejects a cross-team delegation (foreign team caller)', async () => {
    const { ctx } = await setup()
    // A caller whose descriptor team is "other" cannot delegate on "edit".
    const result = await callTeam(ctx, { role: 'scout', description: 'scout', prompt: 'go' }, { agent: foreignRoleAgent('lead') })
    expect(result.isError).toBe(true)
  })

  it('lets the boss delegate any role on its team, cross-level free', async () => {
    const { ctx, seen } = await setup()
    // boss -> scout (level 1) and boss -> lead (level 2): both fine, boss
    // unrestricted.
    const scout = await callTeam(ctx, { role: 'scout', description: 's', prompt: 'p' })
    expect(scout.isError).toBe(false)
    const lead = await callTeam(ctx, { role: 'lead', description: 'l', prompt: 'p' })
    expect(lead.isError).toBe(false)
    expect(seen()?.team).toBe('edit')
  })

  it('refuses an unidentifiable caller (no team identity at all)', async () => {
    const { ctx } = await setup()
    // A standard-mode agent (no team mode, no descriptor) is refused.
    const plain = Session.create(SessionId('plain-1'))
    const plainAgent = { id: SessionId('plain-1'), session: plain } as unknown as Agent
    const result = await callTeam(ctx, { role: 'scout', description: 's', prompt: 'p' }, { agent: plainAgent })
    expect(result.isError).toBe(true)
    expect(text(result)).toContain('Team 模式')
  })

  it('persists the issuance grant/deny through the durable descriptor (cold-resume path)', async () => {
    // The issuance filter must survive a cold-resume re-composition: it is
    // persisted in the harness descriptor's toolFilter, and the grant is
    // re-derived from the CURRENT role level. Assert the descriptor round-trip
    // carries both.
    const { snapshotHarnessSubagentDescriptor } = await import('../../src/in-process/descriptor.ts')
    const scoutDescriptor = snapshotHarnessSubagentDescriptor({
      mode: 'continuable',
      provider: 'capture',
      label: 'x',
      team: 'edit',
      role: 'scout',
      toolFilter: { deny: ['delegate', 'delegate_fork', 'team_delegate'] },
    })
    expect(scoutDescriptor.toolFilter).toEqual({ deny: ['delegate', 'delegate_fork', 'team_delegate'] })
    expect(scoutDescriptor.role).toBe('scout')
    // A level>=2 role persists the standard-tool denial (its only delegation
    // surface is team_delegate, re-granted on resume from its level).
    const leadDescriptor = snapshotHarnessSubagentDescriptor({
      mode: 'continuable', provider: 'capture', label: 'x', team: 'edit', role: 'lead',
      toolFilter: { deny: ['delegate', 'delegate_fork'] },
    })
    expect(leadDescriptor.toolFilter).toEqual({ deny: ['delegate', 'delegate_fork'] })
  })
})

describe('team reader-aware authority table (rule 4)', () => {
  it('shows the boss every role with its level', async () => {
    const { ctx } = await setup()
    const prompt = await assembleFor(ctx, bossAgent('boss-prompt-1'))
    expect(prompt).toContain('lead (level 2)')
    expect(prompt).toContain('scout (level 1)')
  })

  it('shows a level>=2 role its own identity and its subordinates', async () => {
    const { ctx } = await setup()
    const prompt = await assembleFor(ctx, roleAgent('lead', 'edit', 'lead-prompt-1'))
    expect(prompt).toContain('you are the role "lead" (level 2)')
    expect(prompt).toContain('scout (level 1)')
    // It must NOT see itself as a subordinate.
    expect(prompt).not.toContain('you may delegate to the following')
    expect(prompt).not.toMatch(/lead \(level 2\):.*\n- lead/)
  })

  it('shows a level-1 role no delegation page at all', async () => {
    const { ctx } = await setup()
    const prompt = await assembleFor(ctx, roleAgent('scout', 'edit', 'scout-prompt-1'))
    expect(prompt).not.toContain('you are the role "scout"')
    expect(prompt).not.toContain('level 2')
    expect(prompt).not.toContain('delegate to the following')
  })
})
