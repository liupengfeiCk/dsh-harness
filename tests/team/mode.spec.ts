/**
 * Session-level team mode: the `subagent-team/mode` event fold, the derived
 * tool-visibility restriction, the delegation tools' cross-mode execution
 * gates, the catalog-section switching, and the `/team-preset` modeSelect /
 * modeRead endpoints.
 */

import { describe, expect, it, vi } from 'vitest'
import { mkdir as mkdirPromise, mkdtemp as mkdtempPromise, writeFile as writeFilePromise } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import { CallId } from '@deepseek-ai/dsh-llm'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime, { defineTool } from '@deepseek-ai/dsh-tools'
import { assembleContextFor, type Agent } from '@deepseek-ai/dsh-agent'
import SubagentRuntime from '@deepseek-ai/dsh-subagent'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import { createScope, type Scope } from '@deepseek-ai/dsh-scope'
import SubagentPresets from '../../src/preset/index.ts'
import Teams, { type TeamModeState } from '../../src/team/index.ts'
import * as teamTool from '../../src/team/tool.ts'
import * as inProcessTool from '../../src/in-process/tool.ts'
import {
  currentTeamMode, modeLocked, applyModeRestrictions, TEAM_TOOL, STANDARD_TOOLS,
} from '../../src/team/mode.ts'
import * as mock from '../in-process/scripted-provider.ts'
import { dispatchTeamPreset } from '../../src/team/wire/index.ts'

const testToolSignal = new AbortController().signal

/** A session that runs the team delegation surface. */
function teamSession(id = 'team-1', team = 'edit'): Session {
  const session = Session.create(SessionId(id))
  session.append('subagent-team/mode', { mode: 'team', team })
  return session
}

/** A session that runs the standard delegation surface (or none). */
function standardSession(id = 'std-1'): Session {
  return Session.create(SessionId(id))
}

/** A fake Agent carrying a session (and optionally a scoped ctx). */
function fakeAgent(session: Session, ctx?: Context): Agent {
  return { id: session.id, session, ...ctx === undefined ? {} : { ctx } } as unknown as Agent
}

describe('currentTeamMode fold', () => {
  it('defaults to standard with no recorded mode', () => {
    const session = standardSession()
    expect(currentTeamMode(session.events)).toEqual({ mode: 'standard' })
  })

  it('folds the last recorded mode, newest winning', () => {
    const session = Session.create(SessionId('s'))
    session.append('subagent-team/mode', { mode: 'team', team: 'edit' })
    session.append('subagent-team/mode', { mode: 'standard' })
    session.append('subagent-team/mode', { mode: 'team', team: 'review' })
    expect(currentTeamMode(session.events)).toEqual({ mode: 'team', team: 'review' })
  })

  it('carries the team id only in team mode', () => {
    const session = Session.create(SessionId('s'))
    session.append('subagent-team/mode', { mode: 'team', team: 'edit' })
    expect(currentTeamMode(session.events)).toEqual({ mode: 'team', team: 'edit' })
  })

  it('ignores unrelated events', () => {
    const session = Session.create(SessionId('s'))
    session.append('turn/start', {})
    expect(currentTeamMode(session.events)).toEqual({ mode: 'standard' })
  })
})

describe('modeLocked', () => {
  it('is unlocked while no turn has run', () => {
    expect(modeLocked(teamSession().events)).toBe(false)
  })

  it('locks once a turn has run', () => {
    const session = Session.create(SessionId('s'))
    session.append('subagent-team/mode', { mode: 'team', team: 'edit' })
    session.append('turn/start', {})
    expect(modeLocked(session.events)).toBe(true)
  })
})

describe('applyModeRestrictions (tool visibility)', () => {
  async function setupTools() {
    const ctx = new Context()
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    for (const name of ['delegate', 'delegate_fork', TEAM_TOOL]) {
      ctx.tools.register(defineTool({
        name,
        description: `stub ${name}`,
        parameters: { prompt: { type: 'string', required: true, description: 'p' } },
        output: {
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: { kind: { type: 'string', const: 'ok' } },
          },
        },
        execute: async () => ({ kind: 'ok' as const }),
      }))
    }
    return ctx
  }

  /** Mint an agent scope with the services the tool runtime needs injected. */
  async function mintAgentScope(ctx: Context, id = 'a'): Promise<{ scope: Scope; agent: Agent }> {
    const agent = { id: SessionId(id) } as Agent
    let scope!: Scope
    await ctx.plugin(Object.assign((inner: Context) => { scope = createScope(inner, agent) },
      { inject: ['tools', 'systemPrompt'] }))
    return { scope, agent }
  }

  it('hides the standard tools and keeps team_delegate in team mode', async () => {
    const ctx = await setupTools()
    const { scope, agent } = await mintAgentScope(ctx)
    const disposers = applyModeRestrictions(ctx, fakeAgent(teamSession(), scope.ctx), { mode: 'team', team: 'edit' })
    try {
      for (const name of STANDARD_TOOLS) expect(ctx.tools.get(name, agent)).toBeUndefined()
      expect(ctx.tools.get(TEAM_TOOL, agent)).toBeDefined()
      expect(ctx.tools.schemas(agent).map(s => s.name).sort()).toEqual([TEAM_TOOL])
    } finally {
      for (const dispose of disposers) dispose()
    }
  })

  it('hides team_delegate and keeps the standard tools in standard mode', async () => {
    const ctx = await setupTools()
    const { scope, agent } = await mintAgentScope(ctx)
    const disposers = applyModeRestrictions(ctx, fakeAgent(standardSession(), scope.ctx), { mode: 'standard' })
    try {
      expect(ctx.tools.get(TEAM_TOOL, agent)).toBeUndefined()
      for (const name of STANDARD_TOOLS) expect(ctx.tools.get(name, agent)).toBeDefined()
    } finally {
      for (const dispose of disposers) dispose()
    }
  })

  it('skips names the deployment does not register', async () => {
    const ctx = new Context()
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    // Only team_delegate is registered — no standard rows.
    ctx.tools.register(defineTool({
      name: TEAM_TOOL,
      description: 'stub',
      parameters: { prompt: { type: 'string', required: true, description: 'p' } },
      output: { schema: { type: 'object', additionalProperties: false, properties: {} } },
      execute: async () => ({}),
    }))
    const { scope, agent } = await mintAgentScope(ctx)
    const disposers = applyModeRestrictions(ctx, fakeAgent(standardSession(), scope.ctx), { mode: 'standard' })
    try {
      expect(ctx.tools.get(TEAM_TOOL, agent)).toBeUndefined()
    } finally {
      for (const dispose of disposers) dispose()
    }
  })
})

describe('cross-mode execution gates', () => {
  async function setup() {
    const subagentRoot = await mkdtempPromise(join(tmpdir(), 'dsh-mode-subagent-'))
    const teamRoot = await mkdtempPromise(join(tmpdir(), 'dsh-mode-team-'))
    await writeSubagent(subagentRoot, 'writer')
    await writeTeam(teamRoot, 'edit')
    const ctx = new Context()
    ctx.baseUrl = pathToFileURL(subagentRoot).href + '/'
    await ctx.plugin(Loader)
    ctx.loader.builtins.include = Include
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    await ctx.plugin(SubagentRuntime)
    await mock.mountScriptedProvider(ctx, { name: 'capture', reply: 'ok' })
    await ctx.plugin(SubagentPresets, { roots: [{ path: subagentRoot, trust: 'system' }], includeUserRoot: false })
    await ctx.plugin(Teams, { roots: [{ path: teamRoot, trust: 'system' }], includeUserRoot: false })
    await ctx.plugin(inProcessTool, { provider: 'capture', toolName: 'delegate' })
    await ctx.plugin(teamTool, { team: 'edit', provider: 'capture', toolName: TEAM_TOOL })
    return ctx
  }

  function call(ctx: Context, name: string, args: unknown, agent: Agent) {
    return ctx.tools.execute({
      signal: testToolSignal,
      callId: CallId(`mode-${name}-${Math.random()}`),
      name,
      arguments: args,
      agent,
    })
  }

  function text(result: { content: { type: string; text?: string }[] }): string {
    return result.content.filter(b => b.type === 'text').map(b => b.text).join('')
  }

  it('refuses delegate in a team-mode session and team_delegate in standard', async () => {
    const ctx = await setup()
    const delegateArgs = { description: 'd', prompt: 'p' }
    const teamArgs = { role: 'copywriter', description: 'd', prompt: 'p' }

    // Team-mode session: delegate is refused, team_delegate runs.
    const teamAgent = fakeAgent(teamSession())
    const teamDelegateResult = await call(ctx, TEAM_TOOL, teamArgs, teamAgent)
    expect(teamDelegateResult.isError).toBe(false)
    const delegateInTeam = await call(ctx, 'delegate', delegateArgs, teamAgent)
    expect(delegateInTeam.isError).toBe(true)
    expect(text(delegateInTeam)).toContain('Team 模式')

    // Standard-mode session: team_delegate is refused, delegate runs.
    const stdAgent = fakeAgent(standardSession())
    const delegateResult = await call(ctx, 'delegate', delegateArgs, stdAgent)
    expect(delegateResult.isError).toBe(false)
    const teamInStd = await call(ctx, TEAM_TOOL, teamArgs, stdAgent)
    expect(teamInStd.isError).toBe(true)
    expect(text(teamInStd)).toContain('Team 模式')
  })
})

describe('catalog sections switch with the mode', () => {
  async function setup() {
    const subagentRoot = await mkdtempPromise(join(tmpdir(), 'dsh-mode-cat-subagent-'))
    const teamRoot = await mkdtempPromise(join(tmpdir(), 'dsh-mode-cat-team-'))
    await writeSubagent(subagentRoot, 'writer')
    await writeTeam(teamRoot, 'edit')
    const ctx = new Context()
    ctx.baseUrl = pathToFileURL(subagentRoot).href + '/'
    await ctx.plugin(Loader)
    ctx.loader.builtins.include = Include
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    await ctx.plugin(SubagentRuntime)
    await mock.mountScriptedProvider(ctx, { name: 'capture', reply: 'ok' })
    await ctx.plugin(SubagentPresets, { roots: [{ path: subagentRoot, trust: 'system' }], includeUserRoot: false })
    await ctx.plugin(Teams, { roots: [{ path: teamRoot, trust: 'system' }], includeUserRoot: false })
    await ctx.plugin(inProcessTool, { provider: 'capture', toolName: 'delegate' })
    await ctx.plugin(teamTool, { team: 'edit', provider: 'capture', toolName: TEAM_TOOL })
    return ctx
  }

  async function waitForCatalogue(ctx: Context, agent: Agent): Promise<string> {
    const deadline = Date.now() + 2_000
    let prompt = ''
    while (Date.now() < deadline) {
      prompt = (await ctx.systemPrompt.assemble(assembleContextFor(agent))).sections.map(s => s.text).join('\n')
      if (prompt.includes('copywriter')) break
      await new Promise(resolve => setTimeout(resolve, 25))
    }
    return prompt
  }

  it('shows the team role catalogue in team mode and hides the subagent list', async () => {
    const ctx = await setup()
    const prompt = await waitForCatalogue(ctx, fakeAgent(teamSession('cat-team', 'edit')))
    expect(prompt).toContain('copywriter')
    expect(prompt).not.toContain('Available subagents')
  })

  it('hides the team role catalogue in standard mode', async () => {
    const ctx = await setup()
    const prompt = (await ctx.systemPrompt.assemble(assembleContextFor(fakeAgent(standardSession('cat-std')))))
      .sections.map(s => s.text).join('\n')
    expect(prompt).not.toContain('copywriter')
  })
})

describe('team-preset wire mode endpoints', () => {
  const signal = (): AbortSignal => new AbortController().signal

  it('modeRead reports the current mode', async () => {
    const teams = { readMode: async () => ({ mode: 'team' as const, team: 'edit' }) } as unknown as Teams
    const result = await dispatchTeamPreset(teams, undefined, 'modeRead', { sessionId: 's1' }, signal())
    expect(result).toEqual({ ok: true, value: { mode: 'team', team: 'edit' } })
  })

  it('modeSelect delegates to the service and echoes the folded state', async () => {
    const selectMode = vi.fn(async () => {})
    const readMode = vi.fn(async () => ({ mode: 'team' as const, team: 'edit' }))
    const teams = { selectMode, readMode } as unknown as Teams
    const result = await dispatchTeamPreset(
      teams, undefined, 'modeSelect', { sessionId: 's1', mode: 'team', team: 'edit' }, signal())
    expect(result).toEqual({ ok: true, value: { mode: 'team', team: 'edit' } })
    expect(selectMode).toHaveBeenCalledExactlyOnceWith('s1', 'team', 'edit')
  })

  it('rejects a team selection without a team id as bad-request', async () => {
    const teams = { selectMode: vi.fn(), readMode: vi.fn() } as unknown as Teams
    const result = await dispatchTeamPreset(
      teams, undefined, 'modeSelect', { sessionId: 's1', mode: 'team' }, signal())
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('bad-request')
  })

  it('answers an unknown team with the not-found code', async () => {
    const teams = {
      selectMode: async () => { throw new (await import('../../src/team/types.ts')).UnknownTeamError('nope', []) },
      readMode: async () => ({ mode: 'standard' as const }),
    } as unknown as Teams
    const result = await dispatchTeamPreset(
      teams, undefined, 'modeSelect', { sessionId: 's1', mode: 'team', team: 'nope' }, signal())
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('team-preset-not-found')
  })

  it('maps a started-session refusal onto the locked code', async () => {
    const teams = {
      selectMode: async () => { throw new Error('team-presets: session "s1" has already started; its delegation mode is fixed') },
      readMode: async () => ({ mode: 'standard' as const }),
    } as unknown as Teams
    const result = await dispatchTeamPreset(
      teams, undefined, 'modeSelect', { sessionId: 's1', mode: 'team', team: 'edit' }, signal())
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('team-mode-locked')
  })
})

/** Write one mountable subagent directory acting as a role subagent. */
async function writeSubagent(root: string, id: string): Promise<void> {
  const dir = join(root, id)
  await mkdirPromise(dir, { recursive: true })
  await writeFilePromise(join(dir, 'agent.cordis.yml'),
    "- id: persona\n  name: '@deepseek-ai/dsh-persona'\n  config:\n    text: I am a subagent.\n")
  await writeFilePromise(join(dir, 'subagent.yml'), 'enabled: true\n')
}

/** Write one team directory. */
async function writeTeam(root: string, id: string): Promise<void> {
  const dir = join(root, id)
  await mkdirPromise(dir, { recursive: true })
  await writeFilePromise(join(dir, 'team.yml'),
    `metadata:\n  name: ${id}\n  enabled: true\nroles:\n  - id: copywriter\n    subagent: writer\n    description: copywriter role\n    prompt: You are a copywriter.\n`)
}
