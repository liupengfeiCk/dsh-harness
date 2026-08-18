/**
 * The hot core's cache-eviction and boot-cleanup behaviour. Mounting a live
 * subtree is exercised end-to-end (and through the wire); here we unit-test the
 * two parts that are hard to drive through a real loader: the Node loadCache
 * eviction (which must only touch the package's own modules, surviving pnpm
 * symlinks and Node v1/v2 loadCache shapes) and the boot-time wipe of leftover
 * hot inputs.
 */

import { describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, readdirSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  clearPackageLoadCache, HOT_DIR, HotManager,
  type HotContext, type StaticRowsAdapter,
} from '../src/hot.ts'

/** A minimal Map-shaped loadCache double (Node v1: plain Map<url, job>). */
function plainLoadCache(entries: Array<[string, unknown]>): Map<string, unknown> {
  return new Map(entries)
}

/** A Node v24-style loadCache double: Map<url, { [type]: ModuleJob }>. */
function typedLoadCache(entries: Array<[string, unknown]>): Map<string, unknown> {
  const map = new Map<string, unknown>(entries)
  // Node 24's own .delete() only nulls the type slot; emulate that.
  const originalDelete = map.delete.bind(map)
  map.delete = ((key: string) => {
    if (map.has(key)) map.set(key, undefined)
    return true
  }) as typeof map.delete
  void originalDelete
  return map
}

function makeProfileDir(packageDir?: string): { profileDir: string; pkgDir: string } {
  const root = mkdtempSync(join(tmpdir(), 'dsh-hot-'))
  const pkgDir = packageDir ?? join(root, 'node_modules', 'hotprobe')
  mkdirSync(join(pkgDir, 'lib'), { recursive: true })
  writeFileSync(join(pkgDir, 'package.json'), JSON.stringify({ name: 'hotprobe', version: '1.0.0' }))
  writeFileSync(join(pkgDir, 'cordis.patch.yml'), "- insert:\n    - id: probe\n      name: 'hotprobe'\n")
  // A real loadCache only holds actually-loaded module files, which exist on
  // disk; create the synthetic module so the eviction realpath can resolve.
  writeFileSync(join(pkgDir, 'lib', 'index.js'), 'export const version = "1.0.0"\n')
  writeFileSync(join(pkgDir, 'lib', 'helper.js'), 'export const helper = true\n')
  return { profileDir: root, pkgDir }
}

describe('clearPackageLoadCache', () => {
  it('returns false when the loader internals are unavailable', () => {
    expect(clearPackageLoadCache({}, '/tmp', 'pkg')).toBe(false)
    expect(clearPackageLoadCache({ internal: undefined }, '/tmp', 'pkg')).toBe(false)
  })

  it('evicts only the package\'s own modules, never a dependency', () => {
    const { profileDir } = makeProfileDir()
    const cache = plainLoadCache([
      [pathToFileURL(join(profileDir, 'node_modules/hotprobe/lib/index.js')).href, { url: 'index' }],
      [pathToFileURL(join(profileDir, 'node_modules/hotprobe/lib/helper.js')).href, { url: 'helper' }],
      [pathToFileURL(join(profileDir, 'node_modules/dep/lib/index.js')).href, { url: 'dep' }],
      [pathToFileURL(join(profileDir, 'node_modules/other/lib/index.js')).href, { url: 'other' }],
    ])
    const loader = { internal: { loadCache: cache } }

    const ok = clearPackageLoadCache(loader, profileDir, 'hotprobe')

    expect(ok).toBe(true)
    expect(cache.has(pathToFileURL(join(profileDir, 'node_modules/hotprobe/lib/index.js')).href)).toBe(false)
    expect(cache.has(pathToFileURL(join(profileDir, 'node_modules/hotprobe/lib/helper.js')).href)).toBe(false)
    expect(cache.has(pathToFileURL(join(profileDir, 'node_modules/dep/lib/index.js')).href)).toBe(true)
    expect(cache.has(pathToFileURL(join(profileDir, 'node_modules/other/lib/index.js')).href)).toBe(true)
  })

  it('evicts through a Node v24 typed loadCache whose own delete only nulls', () => {
    const { profileDir } = makeProfileDir()
    const url = pathToFileURL(join(profileDir, 'node_modules/hotprobe/lib/index.js')).href
    const cache = typedLoadCache([[url, { module: { url } }]])
    const loader = { internal: { loadCache: cache } }

    expect(clearPackageLoadCache(loader, profileDir, 'hotprobe')).toBe(true)
    // Map.prototype.delete removes the KEY entirely, unlike the typed .delete.
    expect(cache.has(url)).toBe(false)
  })

  it('matches through a pnpm symlink: cached real path still evicted', () => {
    // Simulate pnpm: the package dir is a symlink to a store; the loadCache
    // key holds the store's real path. The package's own prefix must match.
    const root = mkdtempSync(join(tmpdir(), 'dsh-hot-real-'))
    const store = join(root, '.pnpm', 'hotprobe@1.0.0', 'node_modules', 'hotprobe')
    mkdirSync(join(store, 'lib'), { recursive: true })
    writeFileSync(join(store, 'package.json'), JSON.stringify({ name: 'hotprobe', version: '1.0.0' }))
    writeFileSync(join(store, 'lib', 'index.js'), 'export const version = "1.0.0"\n')
    const profileDir = join(root, 'profile')
    mkdirSync(join(profileDir, 'node_modules'), { recursive: true })
    symlinkSync(store, join(profileDir, 'node_modules', 'hotprobe'), 'dir')

    const cache = plainLoadCache([
      [pathToFileURL(join(store, 'lib/index.js')).href, { url: 'index' }],
    ])
    const loader = { internal: { loadCache: cache } }

    expect(clearPackageLoadCache(loader, profileDir, 'hotprobe')).toBe(true)
    expect(cache.size).toBe(0)
  })

  it('ignores non-file URLs and non-package modules', () => {
    const { profileDir } = makeProfileDir()
    const cache = plainLoadCache([
      ['node:fs', { url: 'fs' }],
      ['data:text/javascript,1', { url: 'data' }],
    ])
    const loader = { internal: { loadCache: cache } }
    expect(clearPackageLoadCache(loader, profileDir, 'hotprobe')).toBe(true)
    expect(cache.has('node:fs')).toBe(true)
    expect(cache.has('data:text/javascript,1')).toBe(true)
  })
})

describe('HotManager boot cleanup', () => {
  it('wipes leftover hot-*.yml on startup', () => {
    const { profileDir } = makeProfileDir()
    const hotDir = join(profileDir, HOT_DIR)
    mkdirSync(hotDir, { recursive: true })
    writeFileSync(join(hotDir, 'hot-1.yml'), '- id: a\n  name: pkg\n')
    writeFileSync(join(hotDir, 'hot-2.yml'), '- id: b\n  name: pkg\n')
    // A non-hot file must survive.
    writeFileSync(join(hotDir, 'state.json'), '{}')

    const manager = new HotManager(profileDir)
    manager.cleanHotDir()

    expect(readdirSync(hotDir)).toEqual(['state.json'])
  })

  it('is a no-op when the hot dir does not exist yet', () => {
    const { profileDir } = makeProfileDir()
    const manager = new HotManager(profileDir)
    expect(() => manager.cleanHotDir()).not.toThrow()
  })
})

/**
 * The double-mount convergence behaviour: mounting a package whose insert rows
 * share names with static root-tree rows must first disable each static copy
 * (runtime, in-memory), then mount the hot subtree; unmount must restore them.
 * The static-row channel is mocked here — the real one is exercised end-to-end
 * through the service against a live loader.
 */
describe('HotManager double-mount convergence', () => {
  /** A static-row adapter double recording calls in order. */
  function makeAdapter(rows: Set<string>): {
    adapter: StaticRowsAdapter
    calls: string[]
    disabled: string[]
    restored: string[]
  } {
    const calls: string[] = []
    const disabled: string[] = []
    const restored: string[] = []
    return {
      adapter: {
        has: (id: string) => rows.has(id),
        disable: async (id: string) => { calls.push(`disable:${id}`); disabled.push(id) },
        restore: async (id: string) => { calls.push(`restore:${id}`); restored.push(id) },
      },
      calls,
      disabled,
      restored,
    }
  }

  /** A plugin-handle double: await settles immediately, dispose is recorded. */
  function pluginSpy(events: string[]): HotContext['plugin'] {
    return () => {
      events.push('plugin')
      return {
        await: async () => {},
        dispose: async () => { events.push('dispose') },
      }
    }
  }

  it('disables each static insert row before mounting the hot subtree, and restores on unmount', async () => {
    const { profileDir, pkgDir } = makeProfileDir()
    // The probe patch inserts one row, id `probe`; the static tree owns the
    // same-name row that must be disabled before the hot copy mounts.
    const { adapter, calls, disabled, restored } = makeAdapter(new Set(['probe']))
    const events: string[] = []
    const manager = new HotManager(profileDir)
    const ctx = { plugin: pluginSpy(events), staticRows: adapter } as HotContext

    const record = await manager.mount(ctx, 'hotprobe')

    // Static disable precedes the hot subtree plugin mount; the row is recorded.
    expect(calls).toEqual(['disable:probe'])
    expect(disabled).toEqual(['probe'])
    expect(events).toEqual(['plugin'])
    expect(record.staticRows).toEqual(['probe'])

    // Unmount restores the static row (symmetric), then the hot subtree is
    // disposed.
    calls.length = 0
    const disposed = await manager.unmount('hotprobe', ctx)
    expect(disposed?.staticRows).toEqual(['probe'])
    expect(restored).toEqual(['probe'])
    expect(calls).toEqual(['restore:probe'])
    expect(events).toEqual(['plugin', 'dispose'])
  })

  it('skips a static row that does not exist (hot-only pull-in) and records none', async () => {
    const { profileDir } = makeProfileDir()
    // No static row named `probe` exists — the adapter has() returns false.
    const { adapter, calls, disabled } = makeAdapter(new Set())
    const manager = new HotManager(profileDir)
    const ctx = { plugin: pluginSpy([]), staticRows: adapter } as HotContext

    const record = await manager.mount(ctx, 'hotprobe')

    expect(calls).toEqual([])
    expect(disabled).toEqual([])
    expect(record.staticRows).toEqual([])
  })

  it('ignores disable rows when converging (only insert rows pull static copies)', async () => {
    const { profileDir, pkgDir } = makeProfileDir()
    // Add a disable override row alongside the insert; it must not be treated
    // as a static-copy pull-in (only insert rows share names with hot rows).
    writeFileSync(join(pkgDir, 'cordis.patch.yml'),
      "- insert:\n    - id: probe\n      name: 'hotprobe'\n- id: some-official-row\n  disabled: true\n")
    const { adapter, disabled } = makeAdapter(new Set(['probe', 'some-official-row']))
    const manager = new HotManager(profileDir)
    const ctx = { plugin: pluginSpy([]), staticRows: adapter } as HotContext

    const record = await manager.mount(ctx, 'hotprobe')

    expect(disabled).toEqual(['probe'])
    expect(record.staticRows).toEqual(['probe'])
  })

  it('without a staticRows adapter, mounts the hot rows only (degraded host)', async () => {
    const { profileDir } = makeProfileDir()
    const manager = new HotManager(profileDir)
    const ctx = { plugin: pluginSpy([]) } as HotContext

    const record = await manager.mount(ctx, 'hotprobe')

    expect(record.staticRows).toEqual([])
    expect(record.rowIds).toEqual(['harness-probe'])
  })

  it('a same-name re-mount restores the prior static rows before disabling fresh', async () => {
    const { profileDir } = makeProfileDir()
    const { adapter, disabled, restored } = makeAdapter(new Set(['probe']))
    const manager = new HotManager(profileDir)
    const ctx = { plugin: pluginSpy([]), staticRows: adapter } as HotContext

    await manager.mount(ctx, 'hotprobe')
    disabled.length = 0
    restored.length = 0
    // Re-mount supersedes the previous mount: the prior static disable is
    // restored, then disabled again for the new mount — a convergent terminal
    // state (hot copy running, static copy disabled).
    await manager.mount(ctx, 'hotprobe')

    expect(restored).toEqual(['probe'])
    expect(disabled).toEqual(['probe'])
  })
})
