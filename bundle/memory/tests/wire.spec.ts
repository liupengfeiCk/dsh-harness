/**
 * `/memory` wire dispatch tests (T14).
 *
 * Verifies the dispatch layer validates payloads, maps manager results onto
 * the wire vocabulary, and fails closed on unknown endpoints and a missing
 * manager — without pulling the vendor engine or the connection runtime into
 * the graph.
 *
 * @module dsh-harness-memory-bundle/tests/wire
 */

import { describe, expect, it, vi } from 'vitest'
import { dispatchMemory } from '../src/wire/index.ts'
import type { MemoryManager } from '../src/memory/manager.ts'

// The manager pulls the vendor memory engine (service.ts → TdaiCore) and the
// vendor profile-sync module, neither of which the vitest vite resolver can
// reach through the package's own exports. The dispatch test only exercises the
// wire seam, so mock the manager module wholesale — dispatchMemory never
// instantiates it, it only calls methods on whatever instance the caller passes
// (the `MemoryManager` type is erased at compile time).
vi.mock('../src/memory/manager.ts', () => ({
  MemoryManager: class MemoryManager {},
}))

/** A stub manager that records calls and returns canned results. */
function stubManager(overrides: Partial<MemoryManager> = {}): MemoryManager {
  return {
    assets: vi.fn(async () => ({
      scope: 'team', isolation: {}, l1: [], l2: [], l3: [],
    })),
    readAsset: vi.fn(async () => ({ title: 't', content: 'c' })),
    deleteAsset: vi.fn(async () => true),
    bindRole: vi.fn(async () => {}),
    unbindRole: vi.fn(async () => {}),
    roleBindings: vi.fn(async () => []),
    status: vi.fn(async () => ({
      scope: 'team', isolation: {}, l0Count: 1, l1Count: 2, l2Count: 3, l3Count: 4, lastExtractedAtMs: 5,
    })),
    settings: vi.fn(() => ({
      enabled: true, refinementPlan: '', compression: { mode: 'follow', planId: '' },
      injectionLimit: 0.2, compressionLine: 0.8, retainLine: 0.16,
    })),
    ...overrides,
  } as unknown as MemoryManager
}

const signal = new AbortController().signal

describe('dispatchMemory', () => {
  it('serves assets and returns the grouped layers', async () => {
    const manager = stubManager()
    const result = await dispatchMemory(manager, 'assets', { scope: 'team', isolation: { teamId: 't1' } }, signal)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.scope).toBe('team')
      expect(result.value.l1).toEqual([])
    }
    expect(manager.assets).toHaveBeenCalledWith('team', { teamId: 't1' })
  })

  it('serves assetRead', async () => {
    const result = await dispatchMemory(stubManager(), 'assetRead', { ref: 'record:1' }, signal)
    expect(result.ok).toBe(true)
  })

  it('serves assetDelete and returns the deleted flag', async () => {
    const result = await dispatchMemory(stubManager(), 'assetDelete', { ref: 'record:1' }, signal)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.deleted).toBe(true)
  })

  it('serves bindRole / unbindRole / roleBindings', async () => {
    const manager = stubManager({ roleBindings: vi.fn(async () => ['record:1']) })
    const bind = await dispatchMemory(manager, 'bindRole', { roleId: 'role-a', assetRef: 'record:1' }, signal)
    expect(bind.ok).toBe(true)
    if (bind.ok) expect(bind.value.assets).toEqual(['record:1'])
    const list = await dispatchMemory(manager, 'roleBindings', { roleId: 'role-a' }, signal)
    expect(list.ok).toBe(true)
  })

  it('serves status with the pipeline counts', async () => {
    const result = await dispatchMemory(stubManager(), 'status', { scope: 'project', isolation: { projectId: 'p1' } }, signal)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.l1Count).toBe(2)
  })

  it('serves config from the live settings', async () => {
    const result = await dispatchMemory(stubManager(), 'config', {}, signal)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.enabled).toBe(true)
  })

  it('fails closed on an unknown endpoint', async () => {
    const result = await dispatchMemory(stubManager(), 'nope', {}, signal)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('bad-request')
  })

  it('fails with bad-request on a malformed payload', async () => {
    const result = await dispatchMemory(stubManager(), 'assets', { scope: 'nope' }, signal)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('bad-request')
  })

  it('answers empty rosters when no manager is composed', async () => {
    const assets = await dispatchMemory(undefined, 'assets', { scope: 'team' }, signal)
    expect(assets.ok).toBe(true)
    if (assets.ok) {
      expect(assets.value.l1).toEqual([])
      expect(assets.value.l2).toEqual([])
      expect(assets.value.l3).toEqual([])
    }
    const status = await dispatchMemory(undefined, 'status', { scope: 'team' }, signal)
    expect(status.ok).toBe(true)
    if (status.ok) expect(status.value.l0Count).toBe(0)
  })
})
