// @vitest-environment jsdom
/**
 * Memory settings-section logic: the scope-tab controller's load/switch/view/
 * delete/bind round-trips over the `/memory` wire. The browser bundle ships as
 * a ModuleLoader artifact loadable only by the real host page, so this suite is
 * a documentation lane (excluded from the thread-safe run by the repo's vitest
 * globs); the live UI is verified against a running instance.
 */

import { describe, expect, it } from 'vitest'
import type { RpcResult } from '@deepseek-ai/dsh-api-remotes/client'
import { MemorySectionController, SCOPE_TABS } from '../../src/ui/section-store.ts'
import type {
  MemoryWire, WireAssetEntry, WireMemorySettings, WireScopeAssets, WireScopeStatus,
} from '../../src/ui/wire-client.ts'

/** A success wire result (the `/memory` channel returns RpcResult). */
const ok = <T>(value: T): RpcResult<T> => ({ ok: true as const, value })

/** An asset entry. */
function asset(overrides: Partial<WireAssetEntry> = {}): WireAssetEntry {
  return {
    ref: 'record:1', layer: 'L1', title: 'fact', preview: '…', updatedAtMs: 1000,
    ...overrides,
  }
}

/** One scope's assets. */
function assets(scope: WireScopeAssets['scope']): WireScopeAssets {
  return { scope, isolation: {}, l1: [asset()], l2: [], l3: [] }
}

/** A status summary. */
function status(overrides: Partial<WireScopeStatus> = {}): WireScopeStatus {
  return {
    scope: 'team', isolation: {}, l0Count: 10, l1Count: 4, l2Count: 2, l3Count: 1,
    lastExtractedAtMs: 5000, ...overrides,
  }
}

/** The default settings value. */
function settings(overrides: Partial<WireMemorySettings> = {}): WireMemorySettings {
  return {
    enabled: true, refinementPlan: '', compression: { mode: 'follow', planId: '' },
    injectionLimit: 0.2, compressionLine: 0.8, retainLine: 0.16, ...overrides,
  }
}

/** A wire face serving canned data and recording mutations. */
function fakeWire(overrides: Partial<MemoryWire> = {}): MemoryWire {
  return {
    assets: async request => ok(assets(request.scope)),
    assetRead: async () => ok({ title: 'fact', content: 'full content' }),
    assetDelete: async () => ok({ deleted: true }),
    bindRole: async request => ok({ assets: [request.assetRef] }),
    unbindRole: async request => ok({ assets: [] }),
    roleBindings: async () => ok({ assets: ['record:1'] }),
    status: async request => ok(status({ scope: request.scope })),
    config: async () => ok(settings()),
    ...overrides,
  }
}

describe('the scope tabs', () => {
  it('offers the three orthogonal scopes in render order', () => {
    expect(SCOPE_TABS.map(t => t.key)).toEqual(['team', 'teamRole', 'project'])
  })
})

describe('the memory section controller', () => {
  it('loads the active tab, the status, and the config', async () => {
    const controller = new MemorySectionController(fakeWire())
    await controller.load()
    const state = controller.store.getSnapshot()
    expect(state.status).toBe('ready')
    expect(state.active).toBe('team')
    expect(state.l1).toHaveLength(1)
    expect(state.l1[0]).toMatchObject({ ref: 'record:1', layer: 'L1' })
    expect(state.statusSummary?.l0Count).toBe(10)
    expect(state.config?.injectionLimit).toBe(0.2)
  })

  it('switches scope and reloads that tab', async () => {
    const controller = new MemorySectionController(fakeWire())
    await controller.load()
    await controller.setActive('project')
    const state = controller.store.getSnapshot()
    expect(state.active).toBe('project')
    expect(state.statusSummary?.scope).toBe('project')
  })

  it('opens and closes an asset detail', async () => {
    const controller = new MemorySectionController(fakeWire())
    await controller.load()
    await controller.viewAsset('record:1')
    expect(controller.store.getSnapshot().detail?.title).toBe('fact')
    controller.closeDetail()
    expect(controller.store.getSnapshot().detail).toBeNull()
  })

  it('deletes the asset awaiting confirmation and reloads', async () => {
    const controller = new MemorySectionController(fakeWire())
    await controller.load()
    controller.confirmDelete('record:1')
    await controller.remove()
    const state = controller.store.getSnapshot()
    expect(state.pendingDelete).toBeNull()
    expect(state.deleting).toBe(false)
  })

  it('loads role bindings into the editor', async () => {
    const controller = new MemorySectionController(fakeWire())
    await controller.load()
    await controller.loadRoleBindings('architect')
    expect(controller.store.getSnapshot().roleAssets).toEqual(['record:1'])
  })

  it('binds an asset to the current role and reflects the host result', async () => {
    const controller = new MemorySectionController(fakeWire())
    await controller.load()
    controller.setBindRoleId('architect')
    await controller.bindAsset('record:9')
    expect(controller.store.getSnapshot().roleAssets).toEqual(['record:9'])
  })

  it('unbinds an asset and reflects the emptied bindings', async () => {
    const controller = new MemorySectionController(fakeWire())
    await controller.load()
    controller.setBindRoleId('architect')
    await controller.unbindAsset('record:1')
    expect(controller.store.getSnapshot().roleAssets).toEqual([])
  })

  it('surfaces a delete failure without clearing the pending delete', async () => {
    const wire = fakeWire({
      assetDelete: async () => ({ ok: false as const, error: { code: 'memory-not-found' as never, message: 'gone', details: {} } }),
    })
    const controller = new MemorySectionController(wire)
    await controller.load()
    controller.confirmDelete('record:1')
    await controller.remove()
    const state = controller.store.getSnapshot()
    expect(state.pendingDelete).toBeNull()
    expect(state.error).toBe('gone')
  })
})
