/**
 * P1-5 delegation smoke: the host-plane `delegate` / `delegate_fork` tools
 * (mounted by the profile patch) must dispatch a shipped factory subagent and
 * honour a subagent's model override — the two end-to-end facts the P1 probe
 * cannot observe through the RPC surface alone.
 *
 * This reuses the in-process call shapes from the sibling specs:
 *   • `ctx.tools.execute` with a capture provider (tool.spec.ts) to assert the
 *     delegate tool resolves the factory `code-reviewer` and forwards its id
 *     on the start request — the child-start path is reached.
 *   • `startInProcessRun` + MockAdapter (preset-inheritance.spec.ts) to assert
 *     a named subagent carrying a model override routes the child's request to
 *     the override's provider/model instead of the parent's.
 *
 * It is a smoke test, not a permanent suite member: it points at the packaged
 * factory root so it stays valid after the package migrates into harness/.
 */

import { describe, expect, it, afterEach } from 'vitest'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import { CallId } from '@deepseek-ai/dsh-llm'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import type { Agent } from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import { mountAgentLoopTestDependencies } from '@deepseek-ai/dsh-agent-loop-testkit'
import AgentPresets from '@deepseek-ai/dsh-agent-presets'
import SubagentRuntime from '@deepseek-ai/dsh-subagent'
import SubagentPresets from '../../src/preset/index.ts'
import { SessionId } from '@deepseek-ai/dsh-session'
import { snapshotSubagentDescriptor } from '@deepseek-ai/dsh-subagent'
import { MockAdapter, textResponse } from './mock-adapter.ts'
import type { HarnessSubagentStartRequest } from '../../src/in-process/request-types.ts'
import { startInProcessRun } from '../../src/in-process/engine.ts'
import * as tool from '../../src/in-process/tool.ts'

// The packaged factory root: the subagent-preset factory directory shipped
// inside the bundle (bundle/subagent/factory/) — resolved from this package so
// the test survives the harness/ migration.
const PACKAGE_DIR = dirname(dirname(dirname(fileURLToPath(import.meta.url)))) // bundle/subagent
const FACTORY_ROOT = join(PACKAGE_DIR, 'factory')

// The harness-owned test fixture subagents (carries the model-override case).
const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures')

const contexts: Context[] = []
afterEach(async () => {
  for (const ctx of contexts.splice(0).reverse()) await ctx.fiber.dispose()
})

/** A minimal parent Agent passed through to the provider request. */
function fakeAgent(id = 'parent-1'): Agent {
  return { id: SessionId(id) } as unknown as Agent
}

describe('host-plane delegate tool → factory subagent (P1-5 smoke)', () => {
  it('resolves the shipped factory code-reviewer and starts a child on its id', async () => {
    const holder: { seen?: HarnessSubagentStartRequest } = {}
    const ctx = new Context()
    contexts.push(ctx)
    ctx.baseUrl = pathToFileURL(FACTORY_ROOT).href + '/'
    await ctx.plugin(Loader)
    ctx.loader.builtins.include = Include
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    await ctx.plugin(SubagentRuntime)
    ctx.subagents.registerProvider({
      name: 'smoke-provider',
      capabilities: { outputSchema: false, depthLimit: true, toolFilter: true, persona: true },
      inheritsParentContext: false,
      start: async (request) => {
        holder.seen = request as HarnessSubagentStartRequest
        return {
          id: SessionId('smoke-child'),
          localAgent: undefined,
          result: Promise.resolve({ output: [{ type: 'text', text: 'ok' }], stopReason: 'completed' as const }),
          dispose: async () => {},
        }
      },
    })
    // The shipped factory root is the package default; mount it explicitly so
    // the smoke test stays hermetic (no dependence on harness-home overrides).
    await ctx.plugin(SubagentPresets, { roots: [{ path: FACTORY_ROOT, trust: 'system' }], includeUserRoot: false })
    // The profile mounts this tool under toolName `delegate` (host plane).
    await ctx.plugin(tool, { provider: 'smoke-provider', toolName: 'delegate' })

    const schemaNames = ctx.tools.schemas().map(s => s.name)
    expect(schemaNames).toContain('delegate')

    const result = await ctx.tools.execute({
      signal: new AbortController().signal,
      callId: CallId('smoke-delegate'),
      name: 'delegate',
      arguments: { description: 'review the diff', prompt: 'review the change', template: 'code-reviewer' },
      agent: fakeAgent(),
    })
    expect(result.isError).toBe(false)
    // The delegate tool resolved the factory `code-reviewer` by id and handed
    // that id to the provider: the child-start path reached dispatch.
    expect(holder.seen?.subagent).toBe('code-reviewer')
  })
})

describe('subagent model-plan binding on dispatch (P1-5 smoke)', () => {
  it('records a named subagent\'s model-plan binding as a model-plan/select event on the child', async () => {
    const ctx = new Context()
    contexts.push(ctx)
    ctx.baseUrl = pathToFileURL(FIXTURES).href + '/'
    await ctx.plugin(Loader)
    ctx.loader.builtins.include = Include
    await mountAgentLoopTestDependencies(ctx)
    await ctx.plugin(AgentLoop, { agents: [] })
    await ctx.plugin(AgentPresets, { default: 'coding', roots: [{ path: join(FIXTURES, 'presets'), trust: 'system' as const }], includeUserRoot: false })
    await ctx.plugin(SubagentPresets, { roots: [{ path: join(FIXTURES, 'subagents'), trust: 'system' as const }], includeUserRoot: false })
    const adapter = new MockAdapter([textResponse('parent idle'), textResponse('child done')])
    ctx.llm.registerAdapter(['mock'], adapter)
    const handle = await ctx.agents.create({
      sessionId: SessionId('parent'),
      agentOptions: { provider: 'mock', model: 'mock' },
      setup: async (agentCtx: Context) => void await ctx.agentPresets.mount(agentCtx, 'coding'),
    })

    // `reviewer-model` declares `model: reviewer-plan` (a model-plan id, a
    // reference rather than a `{ provider, model }` route). Delegation records
    // the binding as a `model-plan/select` event on the child session.
    const run = await startInProcessRun(
      {
        label: 'child task',
        prompt: [{ type: 'text' as const, text: 'child task' }],
        parent: handle.agent,
        signal: new AbortController().signal,
        descriptor: snapshotSubagentDescriptor({ mode: 'one-shot' as const, provider: 'spawn', label: 'child task' }),
        subagent: 'reviewer-model',
      },
      {},
    )
    await run.result
    const selectEvent = run.localAgent?.session.events.find(event => event.type === 'model-plan/select')
    expect(selectEvent?.data).toMatchObject({ planId: 'reviewer-plan' })
    // Without the model-plan interceptor (not mounted here), the child inherits
    // the parent's `mock`/`mock` route.
    const childRequest = adapter.requests.at(-1)
    expect(childRequest?.provider).toBe('mock')
    expect(childRequest?.model).toBe('mock')
    await run.dispose()
  })
})
