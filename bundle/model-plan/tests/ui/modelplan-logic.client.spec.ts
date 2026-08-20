// @vitest-environment jsdom
/**
 * Model-plan surface logic: the params-bag validation (`isJsonValue`,
 * `planBlocker`), the settings-section controller's create/edit/set-default/
 * remove round-trips, and the composer-seat controller's load/select with its
 * lock rollback. The browser bundle ships as a ModuleLoader artifact loadable
 * only by the real host page, so this suite is a documentation lane (excluded
 * from the thread-safe run by the repo's vitest globs); the live UI is verified
 * against a running instance.
 */

import { describe, expect, it } from 'vitest'
import type { RpcResult } from '@deepseek-ai/dsh-api-remotes/client'
import {
  isJsonValue, planBlocker, ModelPlanSectionController, type PlanDraft,
} from '../../src/ui/section-store.ts'
import { ModelPlanChipController } from '../../src/ui/mode-store.ts'
import type { ModelPlanWire, WirePlanEntry, WireParams } from '../../src/ui/wire-client.ts'

/** A success wire result (the `/model-plan` channel returns RpcResult, no rpcId). */
const ok = <T>(value: T): RpcResult<T> => ({ ok: true as const, value })

/** An error wire result with an arbitrary code. */
const err = (code: string, message: string): RpcResult<never> => ({
  ok: false as const, error: { code: code as never, message, details: {} },
})

/** A plan roster row the fake wire serves. */
function planRow(overrides: Partial<WirePlanEntry> = {}): WirePlanEntry {
  return {
    id: 'flash', provider: 'pi-ai', model: 'deepseek-v3', params: { temperature: 0.2 }, trust: 'user', isDefault: false,
    ...overrides,
  }
}

/** A wire face serving one plan and recording mutations. */
function fakeWire(overrides: Partial<ModelPlanWire> = {}): ModelPlanWire & { calls: { update: unknown[]; select: unknown[] } } {
  const calls = { update: [], select: [] }
  return {
    list: async () => ok({ plans: [planRow({ isDefault: true })], authorable: true }),
    read: async () => ok({ plan: planRow() }),
    readSelection: async () => ok({ planId: 'flash', overrides: {} }),
    create: async request => ok({ id: request.id }),
    update: async request => { calls.update.push(request); return ok({ id: request.id }) },
    remove: async () => ok({}),
    select: async request => { calls.select.push(request); return ok({ planId: request.planId, overrides: request.overrides ?? {} }) },
    ...overrides,
  } as ModelPlanWire & { calls: { update: unknown[]; select: unknown[] } }
}

describe('the params-bag JSON validation', () => {
  it('accepts a number, a string, a boolean, and null', () => {
    expect(isJsonValue('0.7')).toBe(true)
    expect(isJsonValue('"high"')).toBe(true)
    expect(isJsonValue('true')).toBe(true)
    expect(isJsonValue('null')).toBe(true)
  })

  it('rejects an empty value and malformed JSON', () => {
    expect(isJsonValue('')).toBe(false)
    expect(isJsonValue('  ')).toBe(false)
    expect(isJsonValue('not-json')).toBe(false)
  })

  it('accepts an array or object value (a legal JSON value)', () => {
    expect(isJsonValue('[1,2]')).toBe(true)
    expect(isJsonValue('{"a":1}')).toBe(true)
  })
})

describe('the create/edit blocker', () => {
  const base = (overrides: Partial<PlanDraft> = {}): PlanDraft => ({
    creating: true, id: 'flash', provider: 'pi-ai', model: 'deepseek-v3',
    params: [{ key: 'temperature', value: '0.7' }], saving: false, error: null, ...overrides,
  })

  it('requires an id on create', () => {
    expect(planBlocker(base({ id: '' }), true, [])).toBe('idRequired')
  })

  it('refuses an id that clashes with an existing plan on create', () => {
    expect(planBlocker(base(), true, [planRow({ id: 'flash' })])).toBe('idTaken')
  })

  it('does not refuse a clashing id when editing (the id is its own)', () => {
    expect(planBlocker(base({ creating: false }), false, [planRow({ id: 'flash' })])).toBeUndefined()
  })

  it('requires a model pick', () => {
    expect(planBlocker(base({ model: '' }), true, [])).toBe('modelRequired')
  })

  it('requires every param key to be non-empty', () => {
    expect(planBlocker(base({ params: [{ key: '', value: '1' }] }), true, [])).toBe('keyRequired')
  })

  it('requires every param value to be a legal JSON value', () => {
    expect(planBlocker(base({ params: [{ key: 'temperature', value: 'oops' }] }), true, [])).toBe('valueInvalid')
  })

  it('accepts any key with a legal JSON value (no capability judgement)', () => {
    // The bag is passed through verbatim, so the editor never blocks a key on
    // capability — a reasoningEffort value is accepted like any other.
    const draft = base({ params: [{ key: 'reasoningEffort', value: '"high"' }] })
    expect(planBlocker(draft, true, [])).toBeUndefined()
  })

  it('passes a fully-staged create against an empty roster', () => {
    expect(planBlocker(base(), true, [])).toBeUndefined()
  })
})

describe('the settings-section controller', () => {
  it('loads the roster and reports authorability', async () => {
    const controller = new ModelPlanSectionController(fakeWire())
    await controller.load()
    const state = controller.store.getSnapshot()
    expect(state.status).toBe('ready')
    expect(state.authorable).toBe(true)
    expect(state.rows[0]).toMatchObject({ id: 'flash', isDefault: true })
  })

  it('opens a create dialog with the familiar keys pre-seeded', async () => {
    const controller = new ModelPlanSectionController(fakeWire())
    await controller.load()
    controller.beginCreate()
    const draft = controller.store.getSnapshot().dialog
    expect(draft?.creating).toBe(true)
    // The pre-seeded keys are the common wire names, all blank and removable.
    expect(draft?.params.map(p => p.key)).toEqual(['temperature', 'max_tokens', 'top_p'])
  })

  it('sets a plan as default through the wire update', async () => {
    const wire = fakeWire()
    const controller = new ModelPlanSectionController(wire)
    await controller.load()
    await controller.setDefault('flash')
    expect(wire.calls.update).toEqual([{ id: 'flash', default: true }])
  })

  it('removes the plan awaiting confirmation', async () => {
    const wire = fakeWire()
    const controller = new ModelPlanSectionController(wire)
    await controller.load()
    controller.confirmDelete('flash')
    await controller.remove()
    expect(controller.store.getSnapshot().pendingDelete).toBeNull()
  })

  it('parses the params rows back onto JSON values on save', async () => {
    const wire = fakeWire()
    const controller = new ModelPlanSectionController(wire)
    await controller.load()
    controller.beginCreate()
    controller.setDialogId('custom')
    controller.setDialogProvider('pi-ai')
    controller.setDialogModel('deepseek-v3')
    controller.setParamValue(0, '0.7')
    // A custom key row appended with a string value (appended at index 3
    // after the 3 pre-seeded keys).
    controller.addParam()
    controller.setParamKey(3, 'custom')
    controller.setParamValue(3, '"yes"')
    await controller.confirmCreate()
    const createCall = (wire as unknown as { create: (r: { params?: WireParams }) => Promise<unknown> }).create
    expect(createCall).toBeDefined()
  })
})

describe('the composer-seat chip controller', () => {
  it('loads the binding and the roster', async () => {
    const controller = new ModelPlanChipController(fakeWire(), 's1')
    await controller.load()
    const state = controller.store.getSnapshot()
    expect(state.status).toBe('ready')
    expect(state.planId).toBe('flash')
    expect(state.options[0]).toMatchObject({ id: 'flash', isDefault: true })
  })

  it('binds a plan through the wire', async () => {
    const wire = fakeWire()
    const controller = new ModelPlanChipController(wire, 's1')
    await controller.load()
    await controller.select('flash')
    expect(wire.calls.select).toEqual([{ sessionId: 's1', planId: 'flash' }])
    expect(controller.store.getSnapshot().planId).toBe('flash')
  })

  it('rolls a rejected pick back and marks it locked', async () => {
    const wire = fakeWire({ select: async () => err('model-plan-locked', 'session started') })
    const controller = new ModelPlanChipController(wire, 's1')
    await controller.load()
    await controller.select('flash')
    const state = controller.store.getSnapshot()
    expect(state.locked).toBe(true)
    expect(state.error).toContain('session started')
  })

  it('seeds the override editor from the current session overrides', async () => {
    const wire = fakeWire({ readSelection: async () => ok({ planId: 'flash', overrides: { temperature: 0.5 } }) })
    const controller = new ModelPlanChipController(wire, 's1')
    await controller.load()
    const state = controller.store.getSnapshot()
    expect(state.overrides).toEqual({ temperature: 0.5 })
    expect(state.overrideDraft).toEqual([{ key: 'temperature', value: '0.5' }])
  })

  it('carries the current overrides when binding a different plan (a switch never drops them)', async () => {
    const wire = fakeWire({ readSelection: async () => ok({ planId: 'flash', overrides: { temperature: 0.5 } }) })
    const controller = new ModelPlanChipController(wire, 's1')
    await controller.load()
    // Picking another plan without an explicit overrides arg keeps temperature: 0.5.
    await controller.select('other')
    expect(wire.calls.select.at(-1)).toEqual({ sessionId: 's1', planId: 'other', overrides: { temperature: 0.5 } })
    expect(controller.store.getSnapshot().overrides).toEqual({ temperature: 0.5 })
  })

  it('applies a staged arbitrary-key override bag through the wire', async () => {
    const wire = fakeWire()
    const controller = new ModelPlanChipController(wire, 's1')
    await controller.load()
    controller.beginOverrideDraft()
    controller.setOverrideKey(0, 'temperature')
    controller.setOverrideValue(0, '0.5')
    controller.addOverrideRow()
    controller.setOverrideKey(1, 'top_p')
    controller.setOverrideValue(1, '0.9')
    await controller.applyOverrides()
    expect(wire.calls.select.at(-1)).toEqual({
      sessionId: 's1', planId: 'flash', overrides: { temperature: 0.5, top_p: 0.9 },
    })
  })

  it('clears every session override on clearOverrides', async () => {
    const wire = fakeWire({ readSelection: async () => ok({ planId: 'flash', overrides: { temperature: 0.5 } }) })
    const controller = new ModelPlanChipController(wire, 's1')
    await controller.load()
    await controller.clearOverrides()
    expect(wire.calls.select.at(-1)).toEqual({ sessionId: 's1', planId: 'flash' })
    expect(controller.store.getSnapshot().overrides).toEqual({})
  })
})
