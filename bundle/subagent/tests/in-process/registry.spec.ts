/**
 * The harness-owned provider registry semantics — a DELIBERATE divergence from
 * the official seam (`@deepseek-ai/dsh-subagent`).
 *
 * The official `registerProvider` throws `DUPLICATE_PROVIDER` when a name is
 * already registered. That fail-loud behaviour aborts the whole entry update
 * when a hot-recomposing profile layer re-mounts a provider row into a still
 * active registry: the reconciler's official row re-registers the same name and
 * the thrown error rolls back the update, leaving the old tree in place.
 *
 * The harness registry instead is LAST-WRITE-WINS with CONDITIONAL removal:
 *  - a same-name registration supersedes the previous one (no throw), so a
 *    reconciling re-mount lands instead of aborting;
 *  - the disposer returned by an earlier registration only deletes the slot
 *    when that slot is still the record the earlier call registered (compared
 *    by token), so an old row being torn down cannot evict the newer owner.
 *
 * These cases pin that contract. They use `HarnessSubagentRuntime` directly so
 * the assertions exercise OUR registry, not the official one.
 */

import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type {
  SubagentProvider,
  SubagentRun,
  SubagentStartRequest,
} from '@deepseek-ai/dsh-subagent'
import HarnessSubagentRuntime from '../../src/in-process/service.ts'

const contexts: Context[] = []

afterEach(async () => {
  for (const ctx of contexts.splice(0).reverse()) await ctx.fiber.dispose()
})

async function harnessCtx(): Promise<Context> {
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(HarnessSubagentRuntime)
  return ctx
}

let startCounter = 0

/** A minimal no-op provider. Distinct instances are told apart by reference. */
function provider(name: string): SubagentProvider {
  return {
    name,
    capabilities: { outputSchema: false, depthLimit: false, toolFilter: false, persona: false },
    inheritsParentContext: false,
    async start(_request: SubagentStartRequest): Promise<SubagentRun> {
      return {
        id: Symbol(++startCounter) as never,
        localAgent: undefined,
        result: Promise.resolve({ output: [], stopReason: 'completed' }),
        dispose: async () => {},
      }
    },
  }
}

describe('harness provider registry (last-write-wins)', () => {
  it('a same-name re-registration supersedes the earlier one instead of throwing', async () => {
    const ctx = await harnessCtx()
    const first = provider('spawn')
    const second = provider('spawn')
    ctx.subagents.registerProvider(first)
    ctx.subagents.registerProvider(second)

    // No DUPLICATE_PROVIDER throw; the latest registration wins.
    expect(ctx.subagents.getProvider('spawn')).toBe(second)
    expect(ctx.subagents.list()).toEqual(['spawn'])
  })

  it('after a supersede, the OLD disposer does not evict the NEW registration', async () => {
    const ctx = await harnessCtx()
    const first = provider('spawn')
    const second = provider('spawn')
    const oldDisposer = ctx.subagents.registerProvider(first)
    ctx.subagents.registerProvider(second)

    // Tearing down the earlier row must not remove the newer owner's slot.
    oldDisposer()
    expect(ctx.subagents.getProvider('spawn')).toBe(second)
  })

  it('the NEW disposer removes the registration', async () => {
    const ctx = await harnessCtx()
    const first = provider('spawn')
    const second = provider('spawn')
    ctx.subagents.registerProvider(first)
    const newDisposer = ctx.subagents.registerProvider(second)

    newDisposer()
    expect(ctx.subagents.getProvider('spawn')).toBeUndefined()
    expect(ctx.subagents.list()).toEqual([])
  })

  it('replace → old-dispose → re-register settles on the re-registered provider', async () => {
    const ctx = await harnessCtx()
    const first = provider('spawn')
    const second = provider('spawn')
    const firstDisposer = ctx.subagents.registerProvider(first)
    const secondDisposer = ctx.subagents.registerProvider(second)

    // Both earlier rows tear down in any order; neither owns the slot now.
    firstDisposer()
    secondDisposer()
    expect(ctx.subagents.getProvider('spawn')).toBeUndefined()

    // A fresh registration lands cleanly.
    const third = provider('spawn')
    ctx.subagents.registerProvider(third)
    expect(ctx.subagents.getProvider('spawn')).toBe(third)
  })

  it('a same-name re-registration while the old slot is alive lands and stays until the new disposer runs', async () => {
    const ctx = await harnessCtx()
    const first = provider('fork')
    const second = provider('fork')
    ctx.subagents.registerProvider(first)
    const newDisposer = ctx.subagents.registerProvider(second)
    expect(ctx.subagents.getProvider('fork')).toBe(second)

    newDisposer()
    expect(ctx.subagents.getProvider('fork')).toBeUndefined()
  })
})
