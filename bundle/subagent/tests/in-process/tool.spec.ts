/**
 * The harness-owned delegation tool: model-facing `subagent` over
 * `ctx.subagents`, carrying the `template` parameter, the subagent resolution
 * gate, and the catalogue prompt section. These assert the tool plugin boundary
 * on the replacement code path.
 */

import { describe, expect, it } from 'vitest'
import { mkdir as mkdirPromise, mkdtemp as mkdtempPromise, writeFile as writeFilePromise } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join as joinPath } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import { CallId } from '@deepseek-ai/dsh-llm'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import type { Agent } from '@deepseek-ai/dsh-agent'
import SubagentRuntime from '@deepseek-ai/dsh-subagent'
import SubagentPresets from '../../src/preset/index.ts'
import { SessionId } from '@deepseek-ai/dsh-session'
import type { HarnessSubagentStartRequest } from '../../src/in-process/request-types.ts'
import * as mock from './scripted-provider.ts'
import * as tool from '../../src/in-process/tool.ts'

const testToolSignal = new AbortController().signal

/** A minimal parent Agent passed through to the provider request. */
function fakeAgent(id = 'parent-1'): Agent {
  return { id: SessionId(id) } as unknown as Agent
}

async function setup(toolConfig: tool.Config, mockConfig: Partial<mock.Config> = {}) {
  const ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(SubagentRuntime)
  await mock.mountScriptedProvider(ctx, { name: 'mock', ...mockConfig })
  await ctx.plugin(tool, toolConfig)
  return ctx
}

let callCounter = 0
function callSubagent(ctx: Context, args: unknown, over: { agent?: Agent | undefined; signal?: AbortSignal } = {}) {
  const agent = 'agent' in over ? over.agent : fakeAgent()
  return ctx.tools.execute({
    signal: testToolSignal,
    callId: CallId(`call-${++callCounter}`),
    name: 'subagent',
    arguments: args,
    ...agent ? { agent } : {},
    ...over.signal ? { signal: over.signal } : {},
  })
}

function text(result: { content: { type: string; text?: string }[] }): string {
  return result.content.filter(b => b.type === 'text').map(b => b.text).join('')
}

describe('dsh-subagent-in-process/tool', () => {
  it('registers a `subagent` tool that delegates to the configured provider and returns its output', async () => {
    const ctx = await setup({ provider: 'mock' }, { reply: 'child says hi' })
    const result = await callSubagent(ctx, { description: 'do a thing', prompt: 'go research X' })
    expect(result.isError).toBe(false)
    if (result.isError) throw new Error('expected subagent success')
    expect(result.value).toEqual({
      kind: 'foreground',
      runId: 'scripted-subagent:mock:parent-1',
      output: [{ type: 'text', text: 'child says hi' }],
    })
    expect(text(result)).toBe('child says hi')
  })

  it('exposes description + prompt + run_in_background + template to the model', async () => {
    const ctx = await setup({ provider: 'mock' })
    const schema = ctx.tools.schemas().find(s => s.name === 'subagent')
    expect(schema).toBeDefined()
    const props = (schema!.parameters as { properties?: Record<string, unknown> }).properties ?? {}
    expect(Object.keys(props).sort()).toEqual(['description', 'prompt', 'run_in_background', 'template'])
  })

  it('omits run_in_background entirely when the instance disables it', async () => {
    const ctx = await setup({ provider: 'mock', enableRunInBackground: false })
    const schema = ctx.tools.schemas().find(s => s.name === 'subagent')
    const props = (schema!.parameters as { properties?: Record<string, unknown> }).properties ?? {}
    expect(Object.keys(props).sort()).toEqual(['description', 'prompt', 'template'])
  })

  it('registers under a configurable toolName so multiple providers can coexist', async () => {
    const ctx = new Context()
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    await ctx.plugin(SubagentRuntime)
    await mock.mountScriptedProvider(ctx, { name: 'spawn', reply: 'from spawn' })
    await mock.mountScriptedProvider(ctx, { name: 'fork', reply: 'from fork' })
    await ctx.plugin(tool, { provider: 'spawn', toolName: 'subagent' })
    await ctx.plugin(tool, { provider: 'fork', toolName: 'subagent_fork' })

    const names = ctx.tools.schemas().map(s => s.name).filter(n => n.startsWith('subagent')).sort()
    expect(names).toEqual(['subagent', 'subagent_fork'])

    const viaSpawn = await ctx.tools.execute({ signal: testToolSignal, callId: CallId('c-spawn'), name: 'subagent', arguments: { description: 'd', prompt: 'p' }, agent: fakeAgent() })
    const viaFork = await ctx.tools.execute({ signal: testToolSignal, callId: CallId('c-fork'), name: 'subagent_fork', arguments: { description: 'd', prompt: 'p' }, agent: fakeAgent() })
    expect(text(viaSpawn)).toBe('from spawn')
    expect(text(viaFork)).toBe('from fork')
  })

  it('fails loud when invoked without a calling agent', async () => {
    const ctx = await setup({ provider: 'mock' })
    const result = await callSubagent(ctx, { description: 'd', prompt: 'p' }, { agent: undefined })
    expect(result.isError).toBe(true)
    expect(text(result)).toContain('requires a calling agent')
  })

  describe('sub-agent presets (template)', () => {
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
          // The harness tool carries the optional `subagent` id on the runtime
          // object across the official `ctx.subagents` seam.
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

    /** Write one subagent directory holding an `agent.cordis.yml` plugin tree, enabled. */
    async function writePreset(root: string, id: string, enabled = true): Promise<void> {
      const dir = joinPath(root, id)
      await mkdirPromise(dir, { recursive: true })
      await writeFilePromise(joinPath(dir, 'agent.cordis.yml'),
        "- id: persona\n  name: '@deepseek-ai/dsh-persona'\n  config:\n    text: You are a reviewer.\n")
      await writeFilePromise(joinPath(dir, 'subagent.yml'), `enabled: ${String(enabled)}\n`)
    }

    async function setupPreset(
      toolConfig: Omit<tool.Config, 'provider'> = {},
    ): Promise<{ ctx: Context; seen: () => HarnessSubagentStartRequest | undefined }> {
      const root = await mkdtempPromise(joinPath(tmpdir(), 'dsh-tool-preset-'))
      await writePreset(root, 'reviewer')
      const ctx = new Context()
      ctx.baseUrl = pathToFileURL(root).href + '/'
      await ctx.plugin(Loader)
      ctx.loader.builtins.include = Include
      await ctx.plugin(SystemPrompt)
      await ctx.plugin(ToolRuntime)
      await ctx.plugin(SubagentRuntime)
      const capture = registerCapture(ctx, 'preset-provider')
      await ctx.plugin(SubagentPresets, { roots: [{ path: root, trust: 'system' }], includeUserRoot: false })
      await ctx.plugin(tool, { provider: 'preset-provider', ...toolConfig })
      return { ctx, seen: capture.seen }
    }

    it('exposes the template parameter to the model', async () => {
      const { ctx } = await setupPreset()
      const schema = ctx.tools.schemas().find(s => s.name === 'subagent')
      const props = (schema!.parameters as { properties?: Record<string, unknown> }).properties ?? {}
      expect(props.template).toBeDefined()
    })

    it('resolves a subagent and forwards its id in the start request', async () => {
      const { ctx, seen } = await setupPreset({ persona: 'instance persona', toolFilter: { deny: ['subagent'] } })

      await callSubagent(ctx, { description: 'd', prompt: 'p', template: 'reviewer' })
      // The child creation window mounts the subagent's tree; the tool forwards
      // its id rather than merging persona/toolFilter against the instance's.
      expect(seen()?.subagent).toBe('reviewer')
      expect(seen()?.persona).toBeUndefined()
      expect(seen()?.toolFilter).toBeUndefined()
    })

    it('falls back to the instance persona/toolFilter when no subagent is named', async () => {
      const { ctx, seen } = await setupPreset({ persona: 'instance persona', toolFilter: { deny: ['subagent'] } })
      await callSubagent(ctx, { description: 'd', prompt: 'p' })
      expect(seen()?.subagent).toBeUndefined()
      expect(seen()?.persona).toBe('instance persona')
      expect(seen()?.toolFilter).toEqual({ deny: ['subagent'] })
    })

    it('fails loud when the named subagent does not exist', async () => {
      const { ctx } = await setupPreset()
      const result = await callSubagent(ctx, { description: 'd', prompt: 'p', template: 'nope' })
      expect(result.isError).toBe(true)
      expect(text(result)).toContain('"nope" not found')
    })

    it('fails loud when a named subagent is disabled', async () => {
      const root = await mkdtempPromise(joinPath(tmpdir(), 'dsh-tool-preset-disabled-'))
      await writePreset(root, 'reviewer', false)
      const ctx = new Context()
      ctx.baseUrl = pathToFileURL(root).href + '/'
      await ctx.plugin(Loader)
      ctx.loader.builtins.include = Include
      await ctx.plugin(SystemPrompt)
      await ctx.plugin(ToolRuntime)
      await ctx.plugin(SubagentRuntime)
      registerCapture(ctx, 'p')
      await ctx.plugin(SubagentPresets, { roots: [{ path: root, trust: 'system' }], includeUserRoot: false })
      await ctx.plugin(tool, { provider: 'p' })

      const result = await callSubagent(ctx, { description: 'd', prompt: 'p', template: 'reviewer' })
      expect(result.isError).toBe(true)
      expect(text(result)).toContain('disabled')
    })

    it('fails loud when no subagent registry is loaded', async () => {
      const ctx = new Context()
      await ctx.plugin(SystemPrompt)
      await ctx.plugin(ToolRuntime)
      await ctx.plugin(SubagentRuntime)
      registerCapture(ctx, 'p')
      await ctx.plugin(tool, { provider: 'p' })

      const result = await callSubagent(ctx, { description: 'd', prompt: 'p', template: 'reviewer' })
      expect(result.isError).toBe(true)
      expect(text(result)).toContain('no subagent registry is loaded')
    })

    it('lists non-broken subagents in the system prompt', async () => {
      const root = await mkdtempPromise(joinPath(tmpdir(), 'dsh-tool-preset-prompt-'))
      await writePreset(root, 'reviewer')
      const ctx = new Context()
      ctx.baseUrl = pathToFileURL(root).href + '/'
      await ctx.plugin(Loader)
      ctx.loader.builtins.include = Include
      await ctx.plugin(SystemPrompt)
      await ctx.plugin(ToolRuntime)
      await ctx.plugin(SubagentRuntime)
      registerCapture(ctx, 'p')
      await ctx.plugin(SubagentPresets, { roots: [{ path: root, trust: 'system' }], includeUserRoot: false })
      await ctx.plugin(tool, { provider: 'p' })

      // The catalogue refresh is asynchronous; poll the assembled prompt until
      // the preset appears instead of trusting a fixed sleep under load.
      const deadline = Date.now() + 2_000
      let prompt = ''
      while (Date.now() < deadline) {
        prompt = (await ctx.systemPrompt.assemble()).sections.map(s => s.text).join('\n')
        if (prompt.includes('reviewer')) break
        await new Promise(resolve => setTimeout(resolve, 25))
      }
      expect(prompt).toContain('reviewer')
    })
  })
})
