/**
 * The subagent-management wire layer: dispatch logic, payload validation, the
 * failure vocabulary, and the update semantics (enabled-only toggle vs
 * whole-metadata replace) that moved here from the withdrawn apiproxy domain.
 */

import { describe, expect, it, vi } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { SubagentNotWritableError, UnknownSubagentError, type SubagentPresets } from '../../src/preset/index.ts'
import {
  dispatchSubagentPreset,
  registerSubagentPresetWire,
  SUBAGENT_PRESET_CHANNEL,
} from '../../src/preset/wire/index.ts'

const signal = (): AbortSignal => new AbortController().signal

/** A scripted registry whose mutation methods record their calls. */
function mockRegistry(overrides: Partial<SubagentPresets> = {}): {
  registry: SubagentPresets
  setEnabled: ReturnType<typeof vi.fn>
  updateComposition: ReturnType<typeof vi.fn>
} {
  const setEnabled = vi.fn(async () => {})
  const updateComposition = vi.fn(async () => {})
  const registry = {
    authorable: true,
    list: async () => [],
    resolve: async (id: string) => ({ id, trust: 'user' as const, path: `/subagents/${id}/agent.cordis.yml`, metadata: {} }),
    read: async () => '',
    create: async () => {},
    remove: async () => {},
    setEnabled,
    updateComposition,
    readEditable: async () => ({ tools: [], catalog: [], metadata: {} }),
    ...overrides,
  } as unknown as SubagentPresets
  return { registry, setEnabled, updateComposition }
}

describe('subagent-preset wire dispatch', () => {
  it('lists an empty roster when the deployment composes no subagents', async () => {
    const result = await dispatchSubagentPreset(undefined, 'list', {}, signal())
    expect(result).toEqual({
      ok: true,
      value: { subagents: [], authorable: false, hasDocument: false },
    })
  })

  it('lists the registry rows and forwards authorable', async () => {
    const { registry } = mockRegistry({
      authorable: false,
      list: async () => [{
        id: 'reviewer', trust: 'system' as const,
        metadata: { enabled: true }, path: '/x',
      }],
    })
    const result = await dispatchSubagentPreset(registry, 'list', {}, signal())
    expect(result).toEqual({
      ok: true,
      value: {
        subagents: [{ id: 'reviewer', trust: 'system', metadata: { enabled: true } }],
        authorable: false,
        hasDocument: expect.any(Boolean),
      },
    })
  })

  it('reads one subagent composition through the registry', async () => {
    const { registry } = mockRegistry({
      resolve: async (id: string) => ({ id, trust: 'user' as const, path: `/s/${id}/agent.cordis.yml`, metadata: {} }),
      read: async () => '- id: tool-read\n',
    })
    const result = await dispatchSubagentPreset(registry, 'read', { subagent: 'helper' }, signal())
    expect(result).toEqual({
      ok: true,
      value: { subagent: 'helper', trust: 'user', content: '- id: tool-read\n' },
    })
  })

  it('maps an unknown subagent to the not-found code', async () => {
    const { registry } = mockRegistry({
      resolve: async () => { throw new UnknownSubagentError('nope', []) },
    })
    const result = await dispatchSubagentPreset(registry, 'read', { subagent: 'nope' }, signal())
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('subagent-preset-not-found')
  })

  it('creates a subagent by copying an existing one', async () => {
    const { registry } = mockRegistry()
    const result = await dispatchSubagentPreset(registry, 'create', { from: 'source', subagent: 'copy' }, signal())
    expect(result).toEqual({ ok: true, value: { subagent: 'copy' } })
  })

  it('removes a locally authored subagent', async () => {
    const { registry } = mockRegistry()
    const result = await dispatchSubagentPreset(registry, 'remove', { subagent: 'helper' }, signal())
    expect(result).toEqual({ ok: true, value: {} })
  })

  it('rejects opening a shipped subagent directory as read-only', async () => {
    const { registry } = mockRegistry({
      resolve: async (id: string) => ({ id, trust: 'system' as const, path: `/sys/${id}/agent.cordis.yml`, metadata: {} }),
    })
    const result = await dispatchSubagentPreset(registry, 'openDocument', { subagent: 'shipped' }, signal())
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('subagent-preset-read-only')
  })

  it('maps an unknown openDocument target to the not-found code', async () => {
    const { registry } = mockRegistry({
      resolve: async () => { throw new UnknownSubagentError('ghost', []) },
    })
    const result = await dispatchSubagentPreset(registry, 'openDocument', { subagent: 'ghost' }, signal())
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('subagent-preset-not-found')
  })

  it('reads the editable fields for one locally authored subagent', async () => {
    const { registry } = mockRegistry({
      readEditable: async () => ({
        persona: { text: 'You review code.' },
        tools: [{ id: 'tool-read', name: '@deepseek-ai/dsh-tool-read', disabled: false }],
        catalog: [],
        metadata: { enabled: true },
      }),
    })
    const result = await dispatchSubagentPreset(registry, 'readEditable', { subagent: 'reviewer' }, signal())
    expect(result).toEqual({
      ok: true,
      value: {
        subagent: 'reviewer',
        persona: { text: 'You review code.' },
        tools: [{ id: 'tool-read', name: '@deepseek-ai/dsh-tool-read', disabled: false }],
        catalog: [],
        metadata: { enabled: true },
      },
    })
  })

  it('rejects a malformed payload as bad-request', async () => {
    const { registry } = mockRegistry()
    const result = await dispatchSubagentPreset(registry, 'read', { subagent: '' }, signal())
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('bad-request')
  })

  it('rejects an endpoint the channel does not serve', async () => {
    const { registry } = mockRegistry()
    const result = await dispatchSubagentPreset(registry, 'nope', {}, signal())
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('bad-request')
  })
})

describe('subagent-preset update semantics', () => {
  it('routes an enabled-only metadata write to setEnabled (the row-level toggle)', async () => {
    const { registry, setEnabled } = mockRegistry()
    const result = await dispatchSubagentPreset(
      registry, 'update', { subagent: 'helper', metadata: { enabled: false } }, signal())
    expect(result).toEqual({ ok: true, value: { subagent: 'helper' } })
    expect(setEnabled).toHaveBeenCalledExactlyOnceWith('helper', false)
    expect(registry.updateComposition).not.toHaveBeenCalled()
  })

  it('routes a whole-metadata save to updateComposition with the staged fields', async () => {
    const { registry, updateComposition } = mockRegistry()
    const result = await dispatchSubagentPreset(
      registry,
      'update',
      {
        subagent: 'helper',
        persona: { text: 'New persona.' },
        tools: { 'tool-read': { disabled: true } },
        installTools: ['tool-web'],
        removeTools: ['tool-old'],
        metadata: { description: 'Updated.', enabled: true },
      },
      signal(),
    )
    expect(result).toEqual({ ok: true, value: { subagent: 'helper' } })
    expect(updateComposition).toHaveBeenCalledExactlyOnceWith(
      'helper',
      {
        persona: { text: 'New persona.' },
        tools: { 'tool-read': { disabled: true } },
        installTools: ['tool-web'],
        removeTools: ['tool-old'],
      },
      { description: 'Updated.', enabled: true },
    )
    expect(registry.setEnabled).not.toHaveBeenCalled()
  })

  it('omits absent composition edits rather than passing undefined keys', async () => {
    const { registry, updateComposition } = mockRegistry()
    await dispatchSubagentPreset(
      registry, 'update', { subagent: 'helper', metadata: { description: 'Just metadata.' } }, signal())
    expect(updateComposition).toHaveBeenCalledExactlyOnceWith(
      'helper',
      {},
      { description: 'Just metadata.' },
    )
  })

  it('maps a read-only update refusal onto the read-only code', async () => {
    const { registry } = mockRegistry({
      updateComposition: async () => {
        throw new SubagentNotWritableError('shipped', 'it ships with the deployment')
      },
    })
    const result = await dispatchSubagentPreset(
      registry, 'update', { subagent: 'shipped', metadata: { description: 'x' } }, signal())
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('subagent-preset-read-only')
  })
})

describe('subagent-preset wire registration', () => {
  it('registers the dedicated loopback channel once connection is available', () => {
    const registered: { channel: string; authority: string; disposer: () => void }[] = []
    const handle = vi.fn((channel: string, _handler: unknown, options: { authority: string }) => {
      registered.push({ channel, authority: options.authority, disposer: () => {} })
      return () => Promise.resolve()
    })
    const effects: Array<() => void> = []
    const listeners: Array<(name: string) => void> = []
    const fakeCtx = {
      get: vi.fn((name: string) => {
        if (name === 'connection') return { rpc: { handle } }
        return undefined
      }),
      on: vi.fn((_event: string, cb: (name: string) => void) => {
        listeners.push(cb)
      }),
      effect: (thunk: () => () => void, _name: string) => {
        const disposer = thunk()
        if (typeof disposer === 'function') effects.push(disposer)
        return disposer ?? (() => {})
      },
    } as unknown as Context
    registerSubagentPresetWire(fakeCtx)

    expect(handle).toHaveBeenCalledTimes(1)
    expect(registered[0]!.channel).toBe(SUBAGENT_PRESET_CHANNEL)
    expect(registered[0]!.authority).toBe('loopback')
    // The channel disposer was attached as a cordis effect.
    expect(effects).toHaveLength(1)
    // A late `connection` signal re-runs registration on the same ctx.
    listeners.forEach(cb => cb('connection'))
    expect(handle).toHaveBeenCalledTimes(2)
  })
})
