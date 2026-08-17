// @vitest-environment jsdom
/**
 * The subagent-preset model picker's optgroup encoding: `modelOptionValue`
 * mints the `provider\u0000model` value the `<select>` carries, and the edit
 * dialog decodes it back through `setEditField('model', ...)`. The decode
 * path is private, so these tests exercise it the way the form does — by
 * staging a pick and reading the dialog's staged metadata.
 */

import { describe, expect, it } from 'vitest'
import type { IApiClient } from '@deepseek-ai/dsh-api-remotes/client'
import {
  INHERIT_MODEL_VALUE, modelOptionValue, SubagentSectionController,
} from '../../src/ui/section-store.ts'
import type { SubagentPresetWire } from '../../src/ui/wire-client.ts'

/** A success wire result (the `/subagent-preset` channel returns RpcResult, no rpcId). */
const wireOk = (value: unknown) => Promise.resolve({ ok: true as const, value })

/** A success apiproxy response (the `llm` domain still returns the rpcId-bearing RpcResponse). */
const apiOk = (value: unknown) => Promise.resolve({ rpcId: 'r', result: { ok: true as const, value } })

/** A wire face that reports one editable local subagent with no stored model. */
function fakeApi(): Pick<IApiClient, 'llm'> & { subagentPresets: SubagentPresetWire } {
  return {
    subagentPresets: {
      list: () => wireOk({
        subagents: [{ id: 'reviewer', trust: 'user', metadata: { description: 'Reviews the change.' } }],
        authorable: true,
        hasDocument: true,
      }),
      readEditable: () => wireOk({
        metadata: { description: 'Reviews the change.' },
        persona: undefined,
        tools: [],
        catalog: [],
      }),
      update: (request: { subagent: string; metadata?: { inheritParent?: boolean } }) =>
        wireOk({ subagent: request.subagent }),
    },
    llm: {
      models: () => apiOk({ groups: [] }),
    },
  } as unknown as Pick<IApiClient, 'llm'> & { subagentPresets: SubagentPresetWire }
}

/** A controller with the edit dialog already open over the fake subagent. */
async function openEdit(): Promise<SubagentSectionController> {
  const controller = new SubagentSectionController(fakeApi())
  await controller.load()
  await controller.beginEdit('reviewer')
  return controller
}

describe('the model picker optgroup encoding', () => {
  it('mints a provider\u0000model value for a concrete pick', () => {
    expect(modelOptionValue({ provider: 'deepseek-official', model: 'deepseek-v4' }))
      .toBe('deepseek-official\u0000deepseek-v4')
  })

  it('separates a provider and model that both contain no separator', () => {
    expect(modelOptionValue({ provider: 'a', model: 'b' })).toBe('a\u0000b')
  })
})

describe('decoding a model pick back to provider/model', () => {
  it('restores a concrete pick staged through the edit dialog', async () => {
    const controller = await openEdit()

    controller.setEditField('model', 'value', 'deepseek-official\u0000deepseek-v4')

    expect(controller.store.getSnapshot().edit?.metadata.model)
      .toEqual({ provider: 'deepseek-official', model: 'deepseek-v4' })
  })

  it('keeps the model absent for the inherit-the-parent empty value', async () => {
    const controller = await openEdit()

    controller.setEditField('model', 'value', INHERIT_MODEL_VALUE)

    expect(controller.store.getSnapshot().edit?.metadata.model).toBeUndefined()
  })

  it('leaves the staged model untouched for a value with no separator', async () => {
    const controller = await openEdit()

    controller.setEditField('model', 'value', 'deepseek-official')

    expect(controller.store.getSnapshot().edit?.metadata.model).toBeUndefined()
  })

  it('keeps a previously staged model when the pick has an empty provider', async () => {
    const controller = await openEdit()
    controller.setEditField('model', 'value', 'deepseek-official\u0000deepseek-v4')

    controller.setEditField('model', 'value', '\u0000deepseek-v4')

    // An undecodable value is not a pick: the staged model stays as it was.
    expect(controller.store.getSnapshot().edit?.metadata.model)
      .toEqual({ provider: 'deepseek-official', model: 'deepseek-v4' })
  })

  it('keeps a previously staged model when the pick has an empty model id', async () => {
    const controller = await openEdit()
    controller.setEditField('model', 'value', 'deepseek-official\u0000deepseek-v4')

    controller.setEditField('model', 'value', 'deepseek-official\u0000')

    expect(controller.store.getSnapshot().edit?.metadata.model)
      .toEqual({ provider: 'deepseek-official', model: 'deepseek-v4' })
  })
})

describe('the inheritParent switch', () => {
  it('seeds the edit draft from the stored metadata, defaulting to off', async () => {
    const controller = await openEdit()
    // The fake stores no `inheritParent`, so the staged draft reads off.
    expect(controller.store.getSnapshot().edit?.metadata.inheritParent).toBe(false)
  })

  it('toggles the staged inheritParent through setEditField', async () => {
    const controller = await openEdit()

    controller.setEditField('inheritParent', 'value', true)
    expect(controller.store.getSnapshot().edit?.metadata.inheritParent).toBe(true)

    controller.setEditField('inheritParent', 'value', false)
    expect(controller.store.getSnapshot().edit?.metadata.inheritParent).toBe(false)
  })

  it('submits inheritParent only when true, leaving it absent for the default off', async () => {
    // A controller wired to a capture-capable api, so the update payload can be
    // asserted directly.
    let updateRequest: { metadata?: { inheritParent?: boolean } } | undefined
    const capturingApi: Pick<IApiClient, 'llm'> & { subagentPresets: SubagentPresetWire } = {
      subagentPresets: {
        list: () => wireOk({
          subagents: [{ id: 'reviewer', trust: 'user', metadata: { description: 'Reviews the change.' } }],
          authorable: true,
          hasDocument: true,
        }),
        readEditable: () => wireOk({
          metadata: { description: 'Reviews the change.' },
          persona: undefined,
          tools: [],
          catalog: [],
        }),
        update: (request: { subagent: string; metadata?: { inheritParent?: boolean } }) => {
          updateRequest = request
          return wireOk({ subagent: request.subagent })
        },
      },
      llm: { models: () => apiOk({ groups: [] }) },
    } as unknown as Pick<IApiClient, 'llm'> & { subagentPresets: SubagentPresetWire }
    const controller = new SubagentSectionController(capturingApi)
    await controller.load()
    await controller.beginEdit('reviewer')

    // Default off: saving submits no `inheritParent` key.
    await controller.confirmEdit()
    expect(updateRequest?.metadata?.inheritParent).toBeUndefined()

    // Opt in: saving submits `inheritParent: true`.
    await controller.beginEdit('reviewer')
    controller.setEditField('inheritParent', 'value', true)
    await controller.confirmEdit()
    expect(updateRequest?.metadata?.inheritParent).toBe(true)
    // The edit dialog closes after a successful save.
    expect(controller.store.getSnapshot().edit).toBeNull()
  })
})
