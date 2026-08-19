/**
 * The team delegation tool: model-facing `team_delegate` over `ctx.subagents`,
 * resolving a role on a bound team into a subagent (subagent id) + prompt
 * (persona) and starting a child composed from both. These assert the tool
 * boundary on the team code path: one-shot role dispatch, the role catalogue
 * prompt section, and the disabled-team exclusion.
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
import type { HarnessSubagentStartRequest } from '../../src/in-process/request-types.ts'

const testToolSignal = new AbortController().signal

/**
 * A minimal parent Agent whose session runs the team delegation surface: the
 * team tool refuses a standard-mode session, so every fixture agent must carry
 * a recorded `subagent-team/mode` team event.
 */
function fakeAgent(id = 'parent-1'): Agent {
  const session = Session.create(SessionId(id))
  session.append('subagent-team/mode', { mode: 'team', team: 'edit' })
  return { id: SessionId(id), session } as unknown as Agent
}

/** Register a capture provider that records every start request. */
function registerCapture(
  ctx: Context,
  name: string,
): { seen: () => HarnessSubagentStartRequest | undefined } {
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

/** Write one team directory. */
async function writeTeam(root: string, id: string, roles: string, enabled = true): Promise<void> {
  const dir = join(root, id)
  await mkdirPromise(dir, { recursive: true })
  await writeFilePromise(join(dir, 'team.yml'),
    `metadata:\n  name: ${id}\n  enabled: ${String(enabled)}\nroles:\n${roles}\n`)
}

function roleYaml(id: string, subagent: string, extra = ''): string {
  return `  - id: ${id}\n    subagent: ${subagent}\n    description: ${id} role\n${extra}`
}

/** Mount a context with loader, registries, a capture provider, and the team tool. */
async function setup(
  toolConfig: Partial<teamTool.Config>,
): Promise<{ ctx: Context; seen: () => HarnessSubagentStartRequest | undefined }> {
  const subagentRoot = await mkdtempPromise(join(tmpdir(), 'dsh-team-tool-subagent-'))
  const teamRoot = await mkdtempPromise(join(tmpdir(), 'dsh-team-tool-root-'))
  await writeSubagent(subagentRoot, 'writer')
  await writeTeam(teamRoot, 'edit', roleYaml('copywriter', 'writer', '    prompt: You are a copywriter.\n'))
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
  await ctx.plugin(teamTool, { team: 'edit', provider: 'capture', ...toolConfig })
  return { ctx, seen: capture.seen }
}

let callCounter = 0
function callTeam(ctx: Context, args: unknown, over: { agent?: Agent | undefined } = {}) {
  const agent = 'agent' in over ? over.agent : fakeAgent()
  return ctx.tools.execute({
    signal: testToolSignal,
    callId: CallId(`team-call-${++callCounter}`),
    name: 'team_delegate',
    arguments: args,
    ...agent ? { agent } : {},
  })
}

function text(result: { content: { type: string; text?: string }[] }): string {
  return result.content.filter(b => b.type === 'text').map(b => b.text).join('')
}

describe('dsh-subagent-bundle/team/tool', () => {
  it('registers a `team_delegate` tool exposing role/prompt/description to the model', async () => {
    const { ctx } = await setup({})
    const schema = ctx.tools.schemas().find(s => s.name === 'team_delegate')
    expect(schema).toBeDefined()
    const props = (schema!.parameters as { properties?: Record<string, unknown> }).properties ?? {}
    expect(Object.keys(props).sort()).toEqual(['description', 'prompt', 'role', 'run_in_background'])
  })

  it('resolves a one-shot role and forwards subagent + prompt (persona) to the engine', async () => {
    const { ctx, seen } = await setup({})
    const result = await callTeam(ctx, { role: 'copywriter', description: 'write copy', prompt: 'write me copy' })
    expect(result.isError).toBe(false)
    // The request composes the child from BOTH the role's subagent and its
    // prompt (persona) — this is exactly what the engine's setupChildComposition
    // receives on the child's creation window.
    expect(seen()?.subagent).toBe('writer')
    expect(seen()?.persona).toBe('You are a copywriter.')
    expect(text(result)).toBe('ok')
  })

  it('omits run_in_background entirely when the instance disables it', async () => {
    const { ctx } = await setup({ enableRunInBackground: false })
    const schema = ctx.tools.schemas().find(s => s.name === 'team_delegate')
    const props = (schema!.parameters as { properties?: Record<string, unknown> }).properties ?? {}
    expect(Object.keys(props).sort()).toEqual(['description', 'prompt', 'role'])
  })

  it('fails loud when the named role does not exist', async () => {
    const { ctx } = await setup({})
    const result = await callTeam(ctx, { role: 'nope', description: 'd', prompt: 'p' })
    expect(result.isError).toBe(true)
    expect(text(result)).toContain('has no role')
  })

  it('fails loud when the named role\'s bound subagent is missing', async () => {
    const subagentRoot = await mkdtempPromise(join(tmpdir(), 'dsh-team-tool-subagent2-'))
    const teamRoot = await mkdtempPromise(join(tmpdir(), 'dsh-team-tool-root2-'))
    await writeTeam(teamRoot, 'edit', roleYaml('ghostwriter', 'ghost'))
    const ctx = new Context()
    ctx.baseUrl = pathToFileURL(subagentRoot).href + '/'
    await ctx.plugin(Loader)
    ctx.loader.builtins.include = Include
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    await ctx.plugin(SubagentRuntime)
    registerCapture(ctx, 'capture')
    await ctx.plugin(SubagentPresets, { roots: [{ path: subagentRoot, trust: 'system' }], includeUserRoot: false })
    await ctx.plugin(Teams, { roots: [{ path: teamRoot, trust: 'system' }], includeUserRoot: false })
    await ctx.plugin(teamTool, { team: 'edit', provider: 'capture' })
    const result = await callTeam(ctx, { role: 'ghostwriter', description: 'd', prompt: 'p' })
    expect(result.isError).toBe(true)
    expect(text(result)).toContain('not found')
  })

  it('lists the bound team\'s roles in the system prompt', async () => {
    const { ctx } = await setup({})
    const teamAgent = fakeAgent('team-prompt-1')
    const deadline = Date.now() + 2_000
    let prompt = ''
    while (Date.now() < deadline) {
      prompt = (await ctx.systemPrompt.assemble(assembleContextFor(teamAgent))).sections.map(s => s.text).join('\n')
      if (prompt.includes('copywriter')) break
      await new Promise(resolve => setTimeout(resolve, 25))
    }
    expect(prompt).toContain('copywriter')
    expect(prompt).toContain('copywriter role')
    // The bare subagent roster must NOT leak into the model's view — the main
    // agent sees only the team's role catalogue, never the raw subagent list.
    expect(prompt).not.toContain('- writer:')
    expect(prompt).not.toContain('Available subagents')
  })

  it('does not list a disabled team\'s roles in the system prompt', async () => {
    const subagentRoot = await mkdtempPromise(join(tmpdir(), 'dsh-team-tool-subagent3-'))
    const teamRoot = await mkdtempPromise(join(tmpdir(), 'dsh-team-tool-root3-'))
    await writeSubagent(subagentRoot, 'writer')
    // A disabled team: its role catalogue must not appear to the model.
    await writeTeam(teamRoot, 'edit', roleYaml('copywriter', 'writer'), false)
    const ctx = new Context()
    ctx.baseUrl = pathToFileURL(subagentRoot).href + '/'
    await ctx.plugin(Loader)
    ctx.loader.builtins.include = Include
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    await ctx.plugin(SubagentRuntime)
    registerCapture(ctx, 'capture')
    await ctx.plugin(SubagentPresets, { roots: [{ path: subagentRoot, trust: 'system' }], includeUserRoot: false })
    await ctx.plugin(Teams, { roots: [{ path: teamRoot, trust: 'system' }], includeUserRoot: false })
    await ctx.plugin(teamTool, { team: 'edit', provider: 'capture' })
    // Wait for the catalogue refresh, then assert the role never appears.
    const deadline = Date.now() + 500
    while (Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 25))
    }
    const prompt = (await ctx.systemPrompt.assemble(assembleContextFor(fakeAgent('team-disabled-1'))))
      .sections.map(s => s.text).join('\n')
    expect(prompt).not.toContain('copywriter')
  })

  it('refreshes the role catalogue when the team registry activates AFTER the tool', async () => {
    // Real deployments race the loader rows: `team/tool` must not require the
    // `teams` service to be present at apply time. Mount the tool BEFORE the
    // registry so `ctx.get('teams')` is undefined at apply — the catalogue must
    // still settle once the registry provides later.
    const subagentRoot = await mkdtempPromise(join(tmpdir(), 'dsh-team-tool-subagent4-'))
    const teamRoot = await mkdtempPromise(join(tmpdir(), 'dsh-team-tool-root4-'))
    await writeSubagent(subagentRoot, 'writer')
    await writeTeam(teamRoot, 'edit', roleYaml('copywriter', 'writer', '    prompt: You are a copywriter.\n'))
    const ctx = new Context()
    ctx.baseUrl = pathToFileURL(subagentRoot).href + '/'
    await ctx.plugin(Loader)
    ctx.loader.builtins.include = Include
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    await ctx.plugin(SubagentRuntime)
    registerCapture(ctx, 'capture')
    await ctx.plugin(SubagentPresets, { roots: [{ path: subagentRoot, trust: 'system' }], includeUserRoot: false })
    // Tool first: at apply, `ctx.get('teams')` is undefined.
    await ctx.plugin(teamTool, { team: 'edit', provider: 'capture' })
    const teamAgent = fakeAgent('team-late-1')
    const before = (await ctx.systemPrompt.assemble(assembleContextFor(teamAgent)))
      .sections.map(s => s.text).join('\n')
    expect(before).not.toContain('copywriter')
    // Now the registry provides; the catalogue must settle without a delegate call.
    await ctx.plugin(Teams, { roots: [{ path: teamRoot, trust: 'system' }], includeUserRoot: false })
    const deadline = Date.now() + 2_000
    let after = before
    while (Date.now() < deadline) {
      after = (await ctx.systemPrompt.assemble(assembleContextFor(teamAgent)))
        .sections.map(s => s.text).join('\n')
      if (after.includes('copywriter')) break
      await new Promise(resolve => setTimeout(resolve, 25))
    }
    expect(after).toContain('copywriter')
    expect(after).toContain('copywriter role')
  })

  it('keeps the role catalogue stable when the team registry transiently drops', async () => {
    // The catalogue must be MONOTONIC once settled: a transient registry
    // absence (loader race, hot re-mount) must not blank the prompt section and
    // toggle the 292-byte authority table in/out across requests, which would
    // break the LLM prefix cache. Previously `teams === undefined` cleared the
    // roster synchronously, so a request assembled in that window lost the
    // section; now the last-known-good catalogue is preserved until a genuine
    // re-read replaces it.
    const subagentRoot = await mkdtempPromise(join(tmpdir(), 'dsh-team-tool-subagent5-'))
    const teamRoot = await mkdtempPromise(join(tmpdir(), 'dsh-team-tool-root5-'))
    await writeSubagent(subagentRoot, 'writer')
    await writeTeam(teamRoot, 'edit', roleYaml('copywriter', 'writer', '    prompt: You are a copywriter.\n'))
    const ctx = new Context()
    ctx.baseUrl = pathToFileURL(subagentRoot).href + '/'
    await ctx.plugin(Loader)
    ctx.loader.builtins.include = Include
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    await ctx.plugin(SubagentRuntime)
    registerCapture(ctx, 'capture')
    await ctx.plugin(SubagentPresets, { roots: [{ path: subagentRoot, trust: 'system' }], includeUserRoot: false })
    // Capture the teams handle so we can dispose it mid-session to simulate a
    // transient service absence.
    const teamsHandle = await ctx.plugin(Teams, { roots: [{ path: teamRoot, trust: 'system' }], includeUserRoot: false })
    await ctx.plugin(teamTool, { team: 'edit', provider: 'capture' })
    const teamAgent = fakeAgent('team-stable-1')
    // Let the catalogue settle first.
    const deadline = Date.now() + 2_000
    let settled = ''
    while (Date.now() < deadline) {
      settled = (await ctx.systemPrompt.assemble(assembleContextFor(teamAgent)))
        .sections.map(s => s.text).join('\n')
      if (settled.includes('copywriter')) break
      await new Promise(resolve => setTimeout(resolve, 25))
    }
    expect(settled).toContain('copywriter')
    // Drop the registry: the refresh triggered on dispose sees `teams ===
    // undefined` and must keep the last-good catalogue, not blank it.
    await teamsHandle.dispose()
    const dropped = (await ctx.systemPrompt.assemble(assembleContextFor(teamAgent)))
      .sections.map(s => s.text).join('\n')
    expect(dropped).toContain('copywriter')
    expect(dropped).toContain('copywriter role')
    // Re-provide the registry; the catalogue refreshes from a genuine re-read.
    await ctx.plugin(Teams, { roots: [{ path: teamRoot, trust: 'system' }], includeUserRoot: false })
    const deadline2 = Date.now() + 2_000
    let restored = dropped
    while (Date.now() < deadline2) {
      restored = (await ctx.systemPrompt.assemble(assembleContextFor(teamAgent)))
        .sections.map(s => s.text).join('\n')
      if (restored.includes('copywriter')) break
      await new Promise(resolve => setTimeout(resolve, 25))
    }
    expect(restored).toContain('copywriter')
  })
})
