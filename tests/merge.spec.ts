/**
 * Model-plan merge interceptor: the precedence (session overrides > plan params
 * > official base), the two sealed channels (known keys → native fields, other
 * keys → `extra`), and zero intervention when a session binds no plan.
 */

import { describe, expect, it, vi } from 'vitest'
import type { LlmCallConfig } from '@deepseek-ai/dsh-llm'
import { createMergeHandler, mergePlanConfig, KNOWN_KEYS } from '../src/merge.ts'

/** A canonical official base config (what `next()` resolves). */
function base(): LlmCallConfig {
  return { provider: 'official', model: 'default-model', temperature: 0.7 }
}

describe('KNOWN_KEYS', () => {
  it('routes the exact native fields onto LlmCallConfig', () => {
    expect([...KNOWN_KEYS].sort()).toEqual(['maxTokens', 'reasoningEffort', 'stop', 'temperature'])
  })
})

describe('mergePlanConfig', () => {
  it('layers plan params over the official base', () => {
    const { config, warnedExtra } = mergePlanConfig(
      base(),
      { provider: 'venus', model: 'deepseek-v3', params: { temperature: 0.3, reasoningEffort: 'high' } },
      {},
    )
    expect(config.provider).toBe('venus')
    expect(config.model).toBe('deepseek-v3')
    expect(config.temperature).toBe(0.3)
    expect(config.reasoningEffort).toBe('high')
    expect(warnedExtra).toEqual([])
    expect(config.extra).toBeUndefined()
  })

  it('session overrides win over plan params and the base', () => {
    const { config } = mergePlanConfig(
      base(),
      { provider: 'venus', model: 'm', params: { temperature: 0.3, maxTokens: 1000 } },
      { temperature: 0.9 },
    )
    expect(config.temperature).toBe(0.9) // override beats plan
    expect(config.maxTokens).toBe(1000) // plan still applies
  })

  it('splits known keys onto native fields and other keys onto extra', () => {
    const { config, warnedExtra } = mergePlanConfig(
      base(),
      { provider: 'p', model: 'm', params: { temperature: 0.2, topP: 0.9, custom: { nested: 1 } } },
      {},
    )
    expect(config.temperature).toBe(0.2)
    expect(config.extra).toEqual({ topP: 0.9, custom: { nested: 1 } })
    expect(warnedExtra).toEqual(['topP', 'custom'])
  })

  it('applies a plan-provided reasoningEffort onto the native field', () => {
    const { config } = mergePlanConfig(
      base(),
      { provider: 'p', model: 'm', params: { reasoningEffort: 'medium' } },
      {},
    )
    expect(config.reasoningEffort).toBe('medium')
  })

  it('applies a session override of a non-known key onto extra', () => {
    const { config, warnedExtra } = mergePlanConfig(
      base(),
      { provider: 'p', model: 'm', params: {} },
      { topK: 5 },
    )
    expect(config.extra).toEqual({ topK: 5 })
    expect(warnedExtra).toEqual(['topK'])
  })

  it('merges plan and override bags with the override winning a duplicate key', () => {
    const { config } = mergePlanConfig(
      base(),
      { provider: 'p', model: 'm', params: { topP: 0.5, temperature: 0.1 } },
      { topP: 0.8 },
    )
    expect(config.extra).toEqual({ topP: 0.8 })
    expect(config.temperature).toBe(0.1)
  })
})

describe('createMergeHandler', () => {
  const warn = vi.fn()
  function deps(overrides?: Partial<Parameters<typeof createMergeHandler>[0]>) {
    warn.mockClear()
    return {
      selectionOf: vi.fn(() => ({ overrides: {} })),
      resolvePlan: vi.fn(async () => ({ provider: 'venus', model: 'm', params: {} })),
      logger: { warn },
      ...overrides,
    }
  }

  it('passes through untouched when the session binds no plan (zero intervention)', async () => {
    const resolvePlan = vi.fn()
    const handler = createMergeHandler(deps({ selectionOf: vi.fn(() => ({ overrides: {} })), resolvePlan }))
    const next = vi.fn(async () => base())
    const result = await handler({ agent: { session: { events: [] } } }, next)
    expect(result).toEqual(base())
    expect(next).toHaveBeenCalledExactlyOnceWith()
    expect(resolvePlan).not.toHaveBeenCalled()
    expect(warn).not.toHaveBeenCalled()
  })

  it('merges the bound plan over the official route on a request', async () => {
    const handler = createMergeHandler(deps({
      selectionOf: vi.fn(() => ({ planId: 'flash', overrides: {} })),
      resolvePlan: vi.fn(async () => ({ provider: 'venus', model: 'deepseek-v3', params: { temperature: 0.3 } })),
    }))
    const result = await handler({ agent: { session: { events: [] } } }, async () => base())
    expect(result.provider).toBe('venus')
    expect(result.model).toBe('deepseek-v3')
    expect(result.temperature).toBe(0.3)
  })

  it('warns when a bag carries a non-known key (never silently dropped)', async () => {
    const handler = createMergeHandler(deps({
      selectionOf: vi.fn(() => ({ planId: 'flash', overrides: {} })),
      resolvePlan: vi.fn(async () => ({ provider: 'p', model: 'm', params: { custom: 'x' } })),
    }))
    const result = await handler({ agent: { session: { events: [] } } }, async () => base())
    expect(result.extra).toEqual({ custom: 'x' })
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
