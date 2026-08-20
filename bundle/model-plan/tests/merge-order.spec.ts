/**
 * Model-plan merge interceptor vs the official model-selection layer:
 * `agent/request` waterfall ordering.
 *
 * The official `installModelSelection` (mounted during agent setup, BEFORE this
 * bundle's `agent/created` hook) unconditionally rewrites `provider`/`model`
 * from the agent's own selection. If the model-plan merge interceptor were
 * registered AFTER it in the waterfall, the official layer would overwrite the
 * plan-derived route on every request — so an in-flight session would never
 * follow a plan edit. The fix registers the merge interceptor with
 * `prepend: true` so it sits at the FRONT (outermost) of the waterfall and its
 * plan route wins.
 *
 * These tests model the real ordering the bundle deploys: the official
 * selection handler is registered first (as during agent setup), then the
 * merge interceptor is registered with `{ prepend: true }` (as the
 * `agent/created` hook does). They assert the merged provider/model survive the
 * official layer's rewrite.
 */

import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { agentEvents } from '@deepseek-ai/dsh-agent'
import { createMergeHandler } from '../src/merge.ts'
import type { PlanParams } from '../src/types.ts'

/** The plan that governs the request (what `resolveDefaultPlan` returns). */
const plan = { provider: 'tencent', model: 'deepseek-v4-flash', params: { temperature: 0.7 } as PlanParams }

/** Build the merge handler with a resolveDefaultPlan that returns the current plan. */
function buildMergeHandler() {
  return createMergeHandler({
    selectionOf: vi.fn(() => ({ overrides: {} })),
    resolvePlan: vi.fn(async () => undefined),
    resolveDefaultPlan: vi.fn(async () => plan),
    logger: { warn: vi.fn() },
  })
}

/**
 * Fire the `agent/request` waterfall on a context, replicating the argument
 * shape the loop uses: a payload carrying the agent subject and the inner next.
 */
async function fireRequest(agentCtx: Context) {
  return await agentCtx.waterfall(
    'agent/request',
    { agent: { session: { events: [] } }, turn: 1, step: 0, signal: new AbortController().signal },
    () => Promise.resolve({ provider: 'seed-provider', model: 'seed-model' }),
  )
}

describe('agent/request waterfall ordering: merge vs official model-selection', () => {
  it('without prepend, the official selection overwrites the plan provider (the bug)', async () => {
    const ctx = new Context()
    const agentCtx = ctx.extend()
    try {
      // Official model-selection registered during setup (BEFORE the merge hook).
      agentCtx.on('agent/request', async (_payload: unknown, next: () => Promise<any>) => {
        const resolved = await next()
        return { ...resolved, provider: 'deepseek-official', model: 'deepseek-v4-flash' }
      })
      // Merge registered WITHOUT prepend (registered later => inner => overwritten).
      agentCtx.on('agent/request', buildMergeHandler())
      const result = await fireRequest(agentCtx)
      expect(result.provider).toBe('deepseek-official')
      expect(result.model).toBe('deepseek-v4-flash')
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('with prepend, the plan provider survives the official selection rewrite (the fix)', async () => {
    const ctx = new Context()
    const agentCtx = ctx.extend()
    try {
      // Official model-selection registered during setup (BEFORE the merge hook).
      agentCtx.on('agent/request', async (_payload: unknown, next: () => Promise<any>) => {
        const resolved = await next()
        return { ...resolved, provider: 'deepseek-official', model: 'deepseek-v4-flash' }
      })
      // Merge registered with prepend (front/outermost => rewrites LAST => wins).
      agentCtx.on('agent/request', buildMergeHandler(), { prepend: true })
      const result = await fireRequest(agentCtx)
      expect(result.provider).toBe('tencent')
      expect(result.model).toBe('deepseek-v4-flash')
      // The plan's temperature rides through extra verbatim.
      expect((result as { extra?: Record<string, unknown> }).extra).toEqual({ temperature: 0.7 })
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('with prepend, a session binding no plan still runs zero-intervention', async () => {
    const ctx = new Context()
    const agentCtx = ctx.extend()
    try {
      const handler = createMergeHandler({
        selectionOf: vi.fn(() => ({ overrides: {} })),
        resolvePlan: vi.fn(async () => undefined),
        resolveDefaultPlan: vi.fn(async () => undefined),
        logger: { warn: vi.fn() },
      })
      agentCtx.on('agent/request', async (_payload: unknown, next: () => Promise<any>) => {
        const resolved = await next()
        return { ...resolved, provider: 'deepseek-official', model: 'deepseek-v4-flash' }
      })
      agentCtx.on('agent/request', handler, { prepend: true })
      const result = await fireRequest(agentCtx)
      expect(result.provider).toBe('deepseek-official')
      expect(result.model).toBe('deepseek-v4-flash')
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('with prepend, the plan voids an inherited reasoningEffort the official layer wrote (the夹死 bug)', async () => {
    const ctx = new Context()
    const agentCtx = ctx.extend()
    try {
      // The official model-selection layer writes its own reasoningEffort (the
      // agent seat's default "high") into the resolved config BEFORE the merge
      // interceptor rewrites the route. The plan (tencent, deepseek-v4-flash)
      // declares no reasoningEffort, so the inherited band must be discarded —
      // otherwise tencent rejects the request whether or not the user set one.
      agentCtx.on('agent/request', async (_payload: unknown, next: () => Promise<any>) => {
        const resolved = await next()
        return { ...resolved, provider: 'deepseek-official', model: 'deepseek-v4-flash', reasoningEffort: 'high' }
      })
      agentCtx.on('agent/request', buildMergeHandler(), { prepend: true })
      const result = await fireRequest(agentCtx)
      expect(result.provider).toBe('tencent')
      expect(result.model).toBe('deepseek-v4-flash')
      expect('reasoningEffort' in result).toBe(false)
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('with prepend, dispatched through the real agentEvents scope carrier, the plan provider wins', async () => {
    const ctx = new Context()
    // Simulate the agent's scoped context as a child of the loop context.
    const agentCtx = ctx.extend()
    const agent = {
      id: 'agent-1',
      ctx: agentCtx,
      session: { events: [] },
      // A permissive filter so both listeners (official selection + merge) pass.
      [Context.filter]: () => true,
    } as unknown as { id: string; ctx: Context; session: { events: unknown[] } }
    try {
      // Official model-selection registered during setup (BEFORE the merge hook).
      agentCtx.on('agent/request', async (_payload: unknown, next: () => Promise<any>) => {
        const resolved = await next()
        return { ...resolved, provider: 'deepseek-official', model: 'deepseek-v4-flash' }
      })
      // Merge registered with prepend in the agent/created hook.
      agentCtx.on('agent/request', buildMergeHandler(), { prepend: true })
      const dispatcher = agentEvents(ctx, agent)
      const result = await dispatcher.waterfall(
        'agent/request',
        { turn: 1, step: 0, signal: new AbortController().signal },
        () => Promise.resolve({ provider: 'seed-provider', model: 'seed-model' }),
      )
      expect(result.provider).toBe('tencent')
      expect(result.model).toBe('deepseek-v4-flash')
    } finally {
      await ctx.fiber.dispose()
    }
  })
})
