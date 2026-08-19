/**
 * Model-plan management wire: every `/model-plan` endpoint (list/read/create/
 * update/remove/select/readSelection) dispatches against the registry service,
 * maps its failure vocabulary onto wire codes, and answers an empty roster when
 * no registry is composed.
 */

import { describe, expect, it, vi } from 'vitest'
import { MODEL_PLAN_CHANNEL, dispatchModelPlan } from '../src/wire/index.ts'

/** A canned abort signal for wire calls. */
function signal(): AbortSignal {
  return new AbortController().signal
}

/** A plan-shaped service response for list/read mocks. */
function planRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'flash', provider: 'pi-ai', model: 'deepseek-v3', params: { temperature: 0.2 }, trust: 'user', isDefault: false,
    ...overrides,
  }
}

describe('model-plan wire', () => {
  it('serves the loopback /model-plan channel', () => {
    expect(MODEL_PLAN_CHANNEL).toBe('/model-plan')
  })

  it('lists plans through the registry and reports authorability', async () => {
    const list = vi.fn(async () => [planRow()])
    const plans = { list, authorable: true } as unknown as Parameters<typeof dispatchModelPlan>[0]
    const result = await dispatchModelPlan(plans, 'list', {}, signal())
    expect(result).toEqual({ ok: true, value: { plans: [planRow()], authorable: true } })
    expect(list).toHaveBeenCalledExactlyOnceWith()
  })

  it('answers an empty roster when no registry is composed', async () => {
    const result = await dispatchModelPlan(undefined, 'list', {}, signal())
    expect(result).toEqual({ ok: true, value: { plans: [], authorable: false } })
  })

  it('reads one plan through the registry', async () => {
    const resolve = vi.fn(async () => planRow())
    const plans = { resolve } as unknown as Parameters<typeof dispatchModelPlan>[0]
    const result = await dispatchModelPlan(plans, 'read', { id: 'flash' }, signal())
    expect(result).toEqual({ ok: true, value: { plan: planRow() } })
    expect(resolve).toHaveBeenCalledExactlyOnceWith('flash')
  })

  it('creates a plan through the registry', async () => {
    const create = vi.fn(async () => '/tmp/x')
    const plans = { create } as unknown as Parameters<typeof dispatchModelPlan>[0]
    const result = await dispatchModelPlan(
      plans, 'create', { id: 'flash', provider: 'pi-ai', model: 'deepseek-v3', params: { custom: 'x' } }, signal(),
    )
    expect(result).toEqual({ ok: true, value: { id: 'flash' } })
    expect(create).toHaveBeenCalledExactlyOnceWith('flash', {
      provider: 'pi-ai', model: 'deepseek-v3', params: { custom: 'x' },
    })
  })

  it('updates a plan through the registry (partial edit)', async () => {
    const update = vi.fn(async () => {})
    const plans = { update } as unknown as Parameters<typeof dispatchModelPlan>[0]
    const result = await dispatchModelPlan(plans, 'update', { id: 'flash', provider: 'venus' }, signal())
    expect(result).toEqual({ ok: true, value: { id: 'flash' } })
    expect(update).toHaveBeenCalledExactlyOnceWith('flash', { provider: 'venus' })
  })

  it('removes a plan through the registry', async () => {
    const remove = vi.fn(async () => {})
    const plans = { remove } as unknown as Parameters<typeof dispatchModelPlan>[0]
    const result = await dispatchModelPlan(plans, 'remove', { id: 'flash' }, signal())
    expect(result).toEqual({ ok: true, value: {} })
    expect(remove).toHaveBeenCalledExactlyOnceWith('flash')
  })

  it('selects a plan binding through the registry', async () => {
    const select = vi.fn(async () => ({ planId: 'flash', overrides: { temperature: 0.9 } }))
    const plans = { select } as unknown as Parameters<typeof dispatchModelPlan>[0]
    const result = await dispatchModelPlan(
      plans, 'select', { sessionId: 's1', planId: 'flash', overrides: { temperature: 0.9 } }, signal(),
    )
    expect(result).toEqual({ ok: true, value: { planId: 'flash', overrides: { temperature: 0.9 } } })
    expect(select).toHaveBeenCalledExactlyOnceWith('s1', 'flash', { temperature: 0.9 })
  })

  it('reads the session selection through the registry', async () => {
    const readSelection = vi.fn(async () => ({ planId: 'flash', overrides: {} }))
    const plans = { readSelection } as unknown as Parameters<typeof dispatchModelPlan>[0]
    const result = await dispatchModelPlan(plans, 'readSelection', { sessionId: 's1' }, signal())
    expect(result).toEqual({ ok: true, value: { planId: 'flash', overrides: {} } })
    expect(readSelection).toHaveBeenCalledExactlyOnceWith('s1')
  })

  it('reads an empty selection when the session binds no plan', async () => {
    const readSelection = vi.fn(async () => ({ overrides: {} }))
    const plans = { readSelection } as unknown as Parameters<typeof dispatchModelPlan>[0]
    const result = await dispatchModelPlan(plans, 'readSelection', { sessionId: 's1' }, signal())
    expect(result).toEqual({ ok: true, value: { overrides: {} } })
  })

  it('rejects an endpoint the channel does not serve', async () => {
    const result = await dispatchModelPlan(undefined, 'explode', {}, signal())
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('bad-request')
  })

  it('maps a malformed payload to bad-request', async () => {
    const result = await dispatchModelPlan(undefined, 'read', {}, signal())
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('bad-request')
  })

  it('maps a selection-lock failure onto model-plan-locked', async () => {
    const select = vi.fn(async () => { throw new Error('session "s1" has already started; its plan binding is fixed') })
    const plans = { select } as unknown as Parameters<typeof dispatchModelPlan>[0]
    const result = await dispatchModelPlan(plans, 'select', { sessionId: 's1', planId: 'flash' }, signal())
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('model-plan-locked')
  })

  it('answers model-plan-not-found when no registry is composed', async () => {
    const result = await dispatchModelPlan(undefined, 'read', { id: 'flash' }, signal())
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('model-plan-not-found')
  })
})
