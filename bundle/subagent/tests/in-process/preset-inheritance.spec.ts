/**
 * Composition inheritance: a child runs on the preset its parent runs on.
 *
 * With every model-facing row on the agent plane, the tool registry's global
 * layer is empty, so a child that joins no preset reaches the model with no
 * tools at all. These assert the model-visible result — the schemas in the
 * child's own request — rather than the join that produces it.
 *
 * This is the harness-owned copy of the official driver's inheritance spec,
 * driven through OUR engine (`startInProcessRun`) so the inheritance switch and
 * subagent model override are verified on the replacement code path.
 */

import { afterEach, describe, expect, it } from 'vitest'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import type { Agent } from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import { mountAgentLoopTestDependencies } from '@deepseek-ai/dsh-agent-loop-testkit'
import AgentPresets from '@deepseek-ai/dsh-agent-presets'
import SubagentPresets from '../../src/preset/index.ts'
import { SessionId } from '@deepseek-ai/dsh-session'
import { snapshotSubagentDescriptor } from '@deepseek-ai/dsh-subagent'
import { MockAdapter, textResponse } from './mock-adapter.ts'
import { startInProcessRun } from '../../src/in-process/engine.ts'

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures')
const ROOTS = [{ path: join(FIXTURES, 'presets'), trust: 'system' as const }]
const SUBAGENT_ROOTS = [{ path: join(FIXTURES, 'subagents'), trust: 'system' as const }]

const contexts: Context[] = []

afterEach(async () => {
  for (const ctx of contexts.splice(0).reverse()) await ctx.fiber.dispose()
})

/** A host composition carrying no model-facing rows, plus the preset roster. */
async function setupPresetHost(): Promise<{ ctx: Context; adapter: MockAdapter; parent: Agent }> {
  const ctx = new Context()
  contexts.push(ctx)
  ctx.baseUrl = pathToFileURL(FIXTURES).href + '/'
  await ctx.plugin(Loader)
  ctx.loader.builtins.include = Include
  await mountAgentLoopTestDependencies(ctx)
  await ctx.plugin(AgentLoop, { agents: [] })
  await ctx.plugin(AgentPresets, { default: 'coding', roots: ROOTS, includeUserRoot: false })
  await ctx.plugin(SubagentPresets, { roots: SUBAGENT_ROOTS, includeUserRoot: false })
  const adapter = new MockAdapter([textResponse('parent idle'), textResponse('child done')])
  ctx.llm.registerAdapter(['mock'], adapter)
  const handle = await ctx.agents.create({
    sessionId: SessionId('parent'),
    agentOptions: { provider: 'mock', model: 'mock' },
    setup: async (agentCtx: Context) => void await ctx.agentPresets.mount(agentCtx, 'coding'),
  })
  return { ctx, adapter, parent: handle.agent }
}

/** The one-shot spawn request shape both in-process providers build. */
function spawnRequest(parent: Agent) {
  return {
    label: 'child task',
    prompt: [{ type: 'text' as const, text: 'child task' }],
    parent,
    signal: new AbortController().signal,
    descriptor: snapshotSubagentDescriptor({
      mode: 'one-shot' as const,
      provider: 'spawn',
      label: 'child task',
    }),
  }
}

describe('a child agent composed in-process (harness engine)', () => {
  it('reaches the model with its parent\'s preset tools', async () => {
    const { ctx, adapter, parent } = await setupPresetHost()

    const run = await startInProcessRun(spawnRequest(parent), {})
    await run.result

    const childRequest = adapter.requests.at(-1)
    expect(childRequest?.tools?.map(tool => tool.name)).toEqual(['preset_only'])
    expect(ctx.tools.schemas(run.localAgent).map(schema => schema.name)).toEqual(['preset_only'])
    await run.dispose()
  })

  it('carries its parent\'s prompt sections', async () => {
    const { parent } = await setupPresetHost()

    const run = await startInProcessRun(spawnRequest(parent), {})
    await run.result

    expect(run.localAgent?.session.events.some(event =>
      event.type === 'request/header'
      && JSON.stringify(event.data).includes('section for preset_only'))).toBe(true)
    await run.dispose()
  })

  it('records the composition it ran under on the child header', async () => {
    const { parent } = await setupPresetHost()

    const run = await startInProcessRun(spawnRequest(parent), {})
    await run.result

    // Without this the child's own history reads back under the deployment
    // default, which is a different tool set than the one it actually used.
    expect(run.localAgent?.session.header.agentPreset).toBe('coding')
    await run.dispose()
  })

  it('honours a tool filter over the preset tools it inherited', async () => {
    const { ctx, parent } = await setupPresetHost()

    const run = await startInProcessRun(
      { ...spawnRequest(parent), toolFilter: { deny: ['preset_only'] } },
      {},
    )
    await run.result

    // The capability filter is the only thing bounding a delegated child, and
    // every tool it can name now arrives from the preset rather than the host.
    expect(ctx.tools.schemas(run.localAgent).map(schema => schema.name)).toEqual([])
    await run.dispose()
  })

  it('follows a parent that switched preset while blank', async () => {
    const { ctx, parent } = await setupPresetHost()
    // A DIFFERENT preset, so the assertion below distinguishes reading the
    // parent's live scope chain from reading its creation header — re-linking
    // to the same id would pass either way.
    await ctx.agentPresets.recompose(parent.ctx, 'reviewing')

    const run = await startInProcessRun(spawnRequest(parent), {})
    await run.result

    expect(ctx.tools.schemas(run.localAgent).map(schema => schema.name)).toEqual(['reviewing_only'])
    expect(run.localAgent?.session.header.agentPreset).toBe('reviewing')
    await run.dispose()
  })

  it('mounts a named subagent tree on top of the parent it inherits', async () => {
    const { ctx, parent } = await setupPresetHost()

    // A `subagent` on the request mounts the subagent's plugin tree onto the
    // child's OWN scope. `inherit-on` opts in to inheriting the parent's
    // preset, so the child sees BOTH the tools it inherits from the parent's
    // composition (`preset_only`) and the subagent's own tool (`helper_only`) —
    // the scope-parent join and the per-child tree coexist.
    const run = await startInProcessRun(
      { ...spawnRequest(parent), subagent: 'inherit-on' },
      {},
    )
    await run.result

    expect(ctx.tools.schemas(run.localAgent).map(schema => schema.name)).toEqual(['preset_only', 'helper_only'])
    // The child's durable composition is still the parent's preset; the
    // subagent tree is a per-child overlay, not the child's own preset.
    expect(run.localAgent?.session.header.agentPreset).toBe('coding')
    await run.dispose()
  })

  it('runs a named subagent that does not opt in on its own tools only', async () => {
    const { ctx, parent } = await setupPresetHost()

    // `helper` carries no `inheritParent`, so by default it is self-contained:
    // the child runs ONLY on the subagent's own tree and does NOT inherit the
    // parent's `preset_only` tool.
    const run = await startInProcessRun(
      { ...spawnRequest(parent), subagent: 'helper' },
      {},
    )
    await run.result

    expect(ctx.tools.schemas(run.localAgent).map(schema => schema.name)).toEqual(['helper_only'])
    await run.dispose()
  })

  it('routes a child carrying a named subagent with a model override to that model', async () => {
    const { ctx, adapter, parent } = await setupPresetHost()

    // `reviewer-model` declares `model: { provider: mock, model: override-model }`,
    // so the child must be routed to that provider/model rather than inheriting
    // the parent's `mock`/`mock` route.
    const run = await startInProcessRun(
      { ...spawnRequest(parent), subagent: 'reviewer-model' },
      {},
    )
    await run.result

    const childRequest = adapter.requests.at(-1)
    expect(childRequest?.provider).toBe('mock')
    expect(childRequest?.model).toBe('override-model')
    // The subagent tree still mounted (its helper tool is visible on the child),
    // and `reviewer-model` does not opt in to inheritance, so the parent's
    // `preset_only` tool is absent.
    expect(ctx.tools.schemas(run.localAgent).map(schema => schema.name)).toEqual(['helper_only'])
    await run.dispose()
  })

  it('leaves a child on the parent\'s model when the named subagent has no override', async () => {
    const { ctx, adapter, parent } = await setupPresetHost()

    // `inherit-on` declares no model, so the child inherits the parent's
    // `mock`/`mock`.
    const run = await startInProcessRun(
      { ...spawnRequest(parent), subagent: 'inherit-on' },
      {},
    )
    await run.result

    const childRequest = adapter.requests.at(-1)
    expect(childRequest?.provider).toBe('mock')
    expect(childRequest?.model).toBe('mock')
    // The subagent opted in, so the child sees both the parent's `preset_only`
    // and the subagent's own `helper_only`.
    expect(ctx.tools.schemas(run.localAgent).map(schema => schema.name)).toEqual(['preset_only', 'helper_only'])
    await run.dispose()
  })

  it('inherits the parent\'s EFFECTIVE model (request header), not its preset default', async () => {
    const { ctx, adapter, parent } = await setupPresetHost()
    // The parent's composed default is `mock`/`mock` (its agentOptions), but
    // the user picked a different route that its last request actually ran on —
    // here simulated as an installed model selection, whose request header
    // records `mock`/`effective-model`. A delegated child with no override must
    // inherit that live route so it shares the parent's cache-friendly gateway,
    // not fall back to the preset default.
    const effective = { provider: 'mock', model: 'effective-model', maxTokens: 32000 }
    parent.session.append('request/header', { header: { config: effective } })
    expect(parent.session.requestHeader()?.config).toMatchObject({ provider: 'mock', model: 'effective-model' })

    // A subagent with no model override routes to the parent's effective model.
    const run = await startInProcessRun({ ...spawnRequest(parent), subagent: 'inherit-on' }, {})
    await run.result
    const childRequest = adapter.requests.at(-1)
    expect(childRequest?.provider).toBe('mock')
    expect(childRequest?.model).toBe('effective-model')
    await run.dispose()
  })

  it('preserves the subagent model override over the parent\'s effective model', async () => {
    const { ctx, adapter, parent } = await setupPresetHost()
    // The parent ran on `mock`/`effective-model`; `reviewer-model` still must
    // win with its own override — the override precedence is unchanged.
    parent.session.append('request/header', { header: { config: { provider: 'mock', model: 'effective-model' } } })

    const run = await startInProcessRun(
      { ...spawnRequest(parent), subagent: 'reviewer-model' },
      {},
    )
    await run.result
    const childRequest = adapter.requests.at(-1)
    expect(childRequest?.provider).toBe('mock')
    expect(childRequest?.model).toBe('override-model')
    await run.dispose()
  })

  it('fails loud when a named subagent is broken', async () => {
    const { ctx, parent } = await setupPresetHost()
    // A broken subagent must reject the child creation rather than publish a
    // half-composed agent.
    const run = startInProcessRun(
      { ...spawnRequest(parent), subagent: 'broken' },
      {},
    )
    await expect(run).rejects.toThrow(/broken/)
    // No child was published by the rolled-back creation: the roster held only
    // the parent (`coding` join) before the failed start, so the list is
    // unchanged by it.
    expect(ctx.agents.list().map(agent => agent.id)).toEqual(['parent'])
  })
})
