/**
 * Continuable-child composition inheritance through OUR harness service
 * (`HarnessSubagentRuntime`): the continuable path composes children through
 * OUR continuation manager, which runs OUR `setupChildComposition` — so the
 * `inheritParent` switch, the default-off self-contained named subagent, and a
 * cold resume's re-mount of the durable `subagent` id all survive on the
 * replacement code path. The official `continuation-inheritance.spec.ts` pins
 * the policy snapshot; this suite pins the composition inheritance that the
 * official seam loses once the harness package modification is restored
 * upstream (task 3).
 */

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
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
import { SessionId } from '@deepseek-ai/dsh-session'
import { LlmAdapter, type GenerateOptions, type StreamChunk } from '@deepseek-ai/dsh-llm'
import SandboxPolicyService from '@deepseek-ai/dsh-sandbox-policy'
import JsonlSessionPersistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import ApprovalService from '@deepseek-ai/dsh-user-approval'
import { textResponse } from './mock-adapter.ts'
import HarnessSubagentRuntime from '../../src/in-process/service.ts'
import * as spawnPlugin from '../../src/in-process/spawn.ts'

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures')
const ROOTS = [{ path: join(FIXTURES, 'presets'), trust: 'system' as const }]
const SUBAGENT_ROOTS = [{ path: join(FIXTURES, 'subagents'), trust: 'system' as const }]

/**
 * Adapter whose every child turn waits on the NEXT caller-registered gate, so a
 * test can hold a fresh child's first turn open to read its composition before
 * it settles. The single host is shared across all tests, so one gate is
 * consumed per created child; tests register their gate before starting a child.
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

function startSpec(parent: Agent, subagent: string | undefined) {
  return {
    provider: 'spawn',
    label: 'child task',
    request: {
      prompt: [{ type: 'text' as const, text: 'child task' }],
      parent,
      ...subagent !== undefined ? { subagent } : {},
    },
    signal: new AbortController().signal,
  }
}

/** Wait until the child's Activation is gone, i.e. its handle finished disposal. */
async function waitNoActivation(ctx: Context, childId: SessionId): Promise<void> {
  await vi.waitFor(() => {
    expect(ctx.agents.get(childId)).toBeUndefined()
  }, { timeout: 15_000 })
}

describe('continuable composition inheritance (harness service)', () => {
  let ctx: Context
  let parent: Agent
  let adapter: GatedAdapter
  let root: string

  // One shared host boots the whole suite, so the shared vitest worker is not
  // loaded with a fresh host per test (which otherwise starves a sibling test's
  // fixed 20ms catalogue-refresh window). Each test creates an independent
  // continuable child on the same parent.
  beforeAll(async () => {
    ctx = new Context()
    // The shared host is disposed in afterAll, NOT by the per-test afterEach
    // (which would tear it down after the first test and leave later tests
    // reading a disposed `ctx.subagents`).
    ctx.baseUrl = pathToFileURL(FIXTURES).href + '/'
    await ctx.plugin(Loader)
    ctx.loader.builtins.include = Include
    await mountAgentLoopTestDependencies(ctx)
    root = mkdtempSync(join(tmpdir(), 'dsh-continuable-inherit-'))
    await ctx.plugin(JsonlSessionPersistence, { root })
    await ctx.plugin(SandboxPolicyService, { mode: 'workspace-write', workspaceRoot: root })
    await ctx.plugin(ApprovalService)
    await ctx.plugin(AgentLoop, { agents: [] })
    await ctx.plugin(AgentPresets, { default: 'coding', roots: ROOTS, includeUserRoot: false })
    await ctx.plugin(SubagentPresets, { roots: SUBAGENT_ROOTS, includeUserRoot: false })
    // OUR capability seam, not the official `@deepseek-ai/dsh-subagent`.
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

  it('inherits the parent preset for a continuable child with no named subagent', async () => {
    const gate = Promise.withResolvers<undefined>()
    adapter.gates.push(gate)

    const started = await ctx.subagents.startContinuable(startSpec(parent, undefined))
    const child = ctx.agents.get(started.childId)
    expect(child).toBeDefined()
    expect(ctx.tools.schemas(child as Agent).map(schema => schema.name)).toEqual(['preset_only'])
    release(gate)
    await waitNoActivation(ctx, started.childId)
  })

  it('mounts an inheritParent subagent tree on top of the inherited parent preset (switch ON)', async () => {
    const gate = Promise.withResolvers<undefined>()
    adapter.gates.push(gate)

    // `inherit-on` opts in: the child sees BOTH the parent's `preset_only` and
    // the subagent's own `helper_only`.
    const started = await ctx.subagents.startContinuable(startSpec(parent, 'inherit-on'))
    const child = ctx.agents.get(started.childId)
    expect(child).toBeDefined()
    expect(ctx.tools.schemas(child as Agent).map(schema => schema.name)).toEqual(['preset_only', 'helper_only'])
    release(gate)
    await waitNoActivation(ctx, started.childId)
  })

  it('runs a default (inheritParent off) subagent self-contained, excluding the parent preset (switch OFF)', async () => {
    const gate = Promise.withResolvers<undefined>()
    adapter.gates.push(gate)

    // `helper` carries no `inheritParent`, so by default it is self-contained:
    // the child sees ONLY the subagent's own `helper_only`, never `preset_only`.
    const started = await ctx.subagents.startContinuable(startSpec(parent, 'helper'))
    const child = ctx.agents.get(started.childId)
    expect(child).toBeDefined()
    expect(ctx.tools.schemas(child as Agent).map(schema => schema.name)).toEqual(['helper_only'])
    release(gate)
    await waitNoActivation(ctx, started.childId)
  })

  it('persists the durable subagent id that re-mounts inheritance on cold resume', async () => {
    const gate = Promise.withResolvers<undefined>()
    adapter.gates.push(gate)

    // First residency epoch with the `inherit-on` subagent mounted.
    const started = await ctx.subagents.startContinuable(startSpec(parent, 'inherit-on'))
    const first = ctx.agents.get(started.childId)
    expect(first).toBeDefined()
    expect(ctx.tools.schemas(first as Agent).map(schema => schema.name)).toEqual(['preset_only', 'helper_only'])
    release(gate)
    await waitNoActivation(ctx, started.childId)

    // The `subagent` id is DURABLE: our harness descriptor folds it back out of
    // the persisted child log, and it is exactly the input our continuation
    // manager's `materialize` feeds to `setupChildComposition` on every cold
    // resume — so the inheritParent composition re-mounts by construction. The
    // official descriptor (restored in task 3) would reject this field, which is
    // why the harness folds through `./descriptor.ts` instead.
    const loaded = await ctx.sessionPersistence.load(started.childId)
    const descriptor = loaded.events.find(event => event.type === 'subagent/descriptor')
    expect(descriptor?.data).toMatchObject({ subagent: 'inherit-on' })
    expect(descriptor?.data).toMatchObject({ mode: 'continuable' })
  })

  afterAll(async () => {
    await ctx.fiber.dispose()
    rmSync(root, { recursive: true, force: true })
  })
})
