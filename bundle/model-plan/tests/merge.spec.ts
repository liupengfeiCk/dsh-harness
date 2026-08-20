/**
 * Model-plan merge interceptor: the precedence (session overrides > plan params
 * > official base), the verbatim passthrough channel (every bag key lands on
 * `LlmCallConfig.extra` — the native route is never touched by plan params),
 * and zero intervention when a session binds no plan.
 */

import { describe, expect, it, vi } from 'vitest'
import type { LlmCallConfig } from '@deepseek-ai/dsh-llm'
import { createMergeHandler, mergePlanConfig } from '../src/merge.ts'

/** A canonical official base config (what `next()` resolves). */
function base(): LlmCallConfig {
  return { provider: 'official', model: 'default-model', temperature: 0.7 }
}

describe('mergePlanConfig', () => {
  it('lays every plan param onto extra verbatim (native route untouched)', () => {
    const { config, warnedExtra } = mergePlanConfig(
      base(),
      { provider: 'venus', model: 'deepseek-v3', params: { temperature: 0.3, reasoningEffort: 'high', top_p: 0.8 } },
      {},
    )
    expect(config.provider).toBe('venus')
    expect(config.model).toBe('deepseek-v3')
    // The official base's own native temperature survives (plan params never
    // touch native fields); the whole bag rides on extra untouched.
    expect(config.temperature).toBe(0.7)
    expect(config.extra).toEqual({ temperature: 0.3, reasoningEffort: 'high', top_p: 0.8 })
    expect(warnedExtra).toEqual(['temperature', 'reasoningEffort', 'top_p'])
  })

  it('session overrides win over plan params and never touch native fields', () => {
    const { config } = mergePlanConfig(
      base(),
      { provider: 'venus', model: 'm', params: { temperature: 0.3, max_tokens: 1000 } },
      { temperature: 0.9 },
    )
    // Both plan param and override ride on extra; the override wins the key.
    expect(config.extra).toEqual({ temperature: 0.9, max_tokens: 1000 })
    // The official base's native temperature is untouched by the bag.
    expect(config.temperature).toBe(0.7)
  })

  it('routes the whole bag onto extra with no known-key/native split', () => {
    const { config, warnedExtra } = mergePlanConfig(
      base(),
      { provider: 'p', model: 'm', params: { temperature: 0.2, top_p: 0.9, custom: { nested: 1 } } },
      {},
    )
    expect(config.extra).toEqual({ temperature: 0.2, top_p: 0.9, custom: { nested: 1 } })
    expect(warnedExtra).toEqual(['temperature', 'top_p', 'custom'])
  })

  it('omits extra when the merged bag is empty', () => {
    const { config } = mergePlanConfig(
      base(),
      { provider: 'p', model: 'm', params: {} },
      {},
    )
    expect(config.extra).toBeUndefined()
    expect(config.temperature).toBe(0.7)
  })

  it('discards an inherited reasoningEffort when the plan declares none (official withoutInheritedEffort)', () => {
    // base carries an inherited effort (e.g. the seat's default "high" written by
    // the official model-selection layer); the plan takes over provider/model but
    // declares no reasoningEffort in its bag, so the inherited band must be voided —
    // this is what prevents a provider whose adapter rejects reasoningEffort from failing.
    const inherited: LlmCallConfig = {
      provider: 'official', model: 'default-model', temperature: 0.7,
      reasoningEffort: 'high',
    }
    const { config, warnedExtra } = mergePlanConfig(
      inherited,
      { provider: 'tencent', model: 'deepseek-v4-flash', params: { top_p: 0.8 } },
      {},
    )
    expect(config.provider).toBe('tencent')
    expect(config.model).toBe('deepseek-v4-flash')
    expect('reasoningEffort' in config).toBe(false)
    expect(config.extra).toEqual({ top_p: 0.8 })
    expect(warnedExtra).toEqual(['top_p'])
  })

  it('keeps an inherited reasoningEffort when the merged bag explicitly declares one', () => {
    const inherited: LlmCallConfig = {
      provider: 'official', model: 'default-model', temperature: 0.7,
      reasoningEffort: 'high',
    }
    const { config } = mergePlanConfig(
      inherited,
      { provider: 'tencent', model: 'deepseek-v4-flash', params: { reasoningEffort: 'medium' } },
      {},
    )
    // Declared in the bag, so the inherited effort survives and the bag value
    // rides through extra verbatim (the adapter maps it if it honours the key).
    expect('reasoningEffort' in config).toBe(true)
    expect(config.extra).toEqual({ reasoningEffort: 'medium' })
  })

  it('keeps an inherited reasoningEffort when a session override declares one', () => {
    const inherited: LlmCallConfig = {
      provider: 'official', model: 'default-model', temperature: 0.7,
      reasoningEffort: 'high',
    }
    const { config } = mergePlanConfig(
      inherited,
      { provider: 'tencent', model: 'deepseek-v4-flash', params: {} },
      { reasoningEffort: 'off' },
    )
    // The merged bag (plan + overrides) DOES declare an effort via the override,
    // so the inherited one survives and the override rides through extra.
    expect('reasoningEffort' in config).toBe(true)
    expect(config.extra).toEqual({ reasoningEffort: 'off' })
  })

  it('applies a session override of any key onto extra', () => {
    const { config, warnedExtra } = mergePlanConfig(
      base(),
      { provider: 'p', model: 'm', params: {} },
      { top_k: 5 },
    )
    expect(config.extra).toEqual({ top_k: 5 })
    expect(warnedExtra).toEqual(['top_k'])
  })

  it('merges plan and override bags with the override winning a duplicate key', () => {
    const { config } = mergePlanConfig(
      base(),
      { provider: 'p', model: 'm', params: { top_p: 0.5, max_tokens: 2000 } },
      { top_p: 0.8 },
    )
    expect(config.extra).toEqual({ top_p: 0.8, max_tokens: 2000 })
  })
})

describe('createMergeHandler', () => {
  const warn = vi.fn()
  function deps(overrides?: Partial<Parameters<typeof createMergeHandler>[0]>) {
    warn.mockClear()
    return {
      selectionOf: vi.fn(() => ({ overrides: {} })),
      resolvePlan: vi.fn(async () => ({ provider: 'venus', model: 'm', params: {} })),
      resolveDefaultPlan: vi.fn(async () => undefined),
      logger: { warn },
      ...overrides,
    }
  }

  it('passes through untouched when the session binds no plan and no default exists (zero intervention)', async () => {
    const resolvePlan = vi.fn()
    const resolveDefaultPlan = vi.fn(async () => undefined)
    const handler = createMergeHandler(deps({
      selectionOf: vi.fn(() => ({ overrides: {} })),
      resolvePlan,
      resolveDefaultPlan,
    }))
    const next = vi.fn(async () => base())
    const result = await handler({ agent: { session: { events: [] } } }, next)
    expect(result).toEqual(base())
    expect(next).toHaveBeenCalledExactlyOnceWith()
    expect(resolvePlan).not.toHaveBeenCalled()
    expect(resolveDefaultPlan).toHaveBeenCalledExactlyOnceWith()
    expect(warn).not.toHaveBeenCalled()
  })

  it('falls back to the default plan when the session binds no plan', async () => {
    const handler = createMergeHandler(deps({
      selectionOf: vi.fn(() => ({ overrides: {} })),
      resolveDefaultPlan: vi.fn(async () => ({ provider: 'venus', model: 'default-model', params: { temperature: 0.4 } })),
    }))
    const result = await handler({ agent: { session: { events: [] } } }, async () => base())
    expect(result.provider).toBe('venus')
    expect(result.model).toBe('default-model')
    expect((result as { extra?: Record<string, unknown> }).extra).toEqual({ temperature: 0.4 })
    expect(warn).toHaveBeenCalled()
  })

  it('runs zero intervention when the default plan is unusable', async () => {
    const handler = createMergeHandler(deps({
      selectionOf: vi.fn(() => ({ overrides: {} })),
      resolveDefaultPlan: vi.fn(async () => undefined),
    }))
    const result = await handler({ agent: { session: { events: [] } } }, async () => base())
    expect(result).toEqual(base())
    expect(warn).not.toHaveBeenCalled()
  })

  it('re-resolves the default plan on every request (reference semantics)', async () => {
    const resolveDefaultPlan = vi.fn(async () => ({ provider: 'venus', model: 'm', params: {} }))
    const handler = createMergeHandler(deps({
      selectionOf: vi.fn(() => ({ overrides: {} })),
      resolveDefaultPlan,
    }))
    await handler({ agent: { session: { events: [] } } }, async () => base())
    await handler({ agent: { session: { events: [] } } }, async () => base())
    expect(resolveDefaultPlan).toHaveBeenCalledTimes(2)
  })

  it('prefers an explicit binding over the default plan', async () => {
    const resolvePlan = vi.fn(async () => ({ provider: 'venus', model: 'bound', params: { temperature: 0.2 } }))
    const resolveDefaultPlan = vi.fn(async () => ({ provider: 'venus', model: 'default', params: {} }))
    const handler = createMergeHandler(deps({
      selectionOf: vi.fn(() => ({ planId: 'flash', overrides: {} })),
      resolvePlan,
      resolveDefaultPlan,
    }))
    const result = await handler({ agent: { session: { events: [] } } }, async () => base())
    expect(result.model).toBe('bound')
    expect((result as { extra?: Record<string, unknown> }).extra).toEqual({ temperature: 0.2 })
    expect(resolveDefaultPlan).not.toHaveBeenCalled()
  })

  it('merges the bound plan over the official route on a request', async () => {
    const handler = createMergeHandler(deps({
      selectionOf: vi.fn(() => ({ planId: 'flash', overrides: {} })),
      resolvePlan: vi.fn(async () => ({ provider: 'venus', model: 'deepseek-v3', params: { temperature: 0.3 } })),
    }))
    const result = await handler({ agent: { session: { events: [] } } }, async () => base())
    expect(result.provider).toBe('venus')
    expect(result.model).toBe('deepseek-v3')
    expect((result as { extra?: Record<string, unknown> }).extra).toEqual({ temperature: 0.3 })
  })

  it('warns when the bag is non-empty (never silently dropped)', async () => {
    const handler = createMergeHandler(deps({
      selectionOf: vi.fn(() => ({ planId: 'flash', overrides: {} })),
      resolvePlan: vi.fn(async () => ({ provider: 'p', model: 'm', params: { custom: 'x' } })),
    }))
    const result = await handler({ agent: { session: { events: [] } } }, async () => base())
    expect((result as { extra?: Record<string, unknown> }).extra).toEqual({ custom: 'x' })
    expect(warn).toHaveBeenCalled()
    const message = warn.mock.calls[0]?.[0] as string
    expect(message).toContain('custom')
    expect(message).toContain('extra')
  })

  it('falls back to the official route when the bound plan no longer resolves', async () => {
    const handler = createMergeHandler(deps({
      selectionOf: vi.fn(() => ({ planId: 'gone', overrides: {} })),
      resolvePlan: vi.fn(async () => undefined),
    }))
    const result = await handler({ agent: { session: { events: [] } } }, async () => base())
    expect(result).toEqual(base())
    expect(warn).toHaveBeenCalled()
    const message = warn.mock.calls[0]?.[0] as string
    expect(message).toContain('gone')
  })

  it('re-resolves the plan on every request (reference semantics)', async () => {
    const resolvePlan = vi.fn(async () => ({ provider: 'venus', model: 'deepseek-v3', params: {} }))
    const handler = createMergeHandler(deps({
      selectionOf: vi.fn(() => ({ planId: 'flash', overrides: {} })),
      resolvePlan,
    }))
    await handler({ agent: { session: { events: [] } } }, async () => base())
    await handler({ agent: { session: { events: [] } } }, async () => base())
    expect(resolvePlan).toHaveBeenCalledTimes(2)
  })

  it('folds the selection from the payload agent session events', async () => {
    const selectionOf = vi.fn(() => ({ planId: 'flash', overrides: {} }))
    const handler = createMergeHandler(deps({ selectionOf }))
    const events = [{ type: 'model-plan/select' }]
    await handler({ agent: { session: { events } } }, async () => base())
    expect(selectionOf).toHaveBeenCalledWith(events)
  })
})
