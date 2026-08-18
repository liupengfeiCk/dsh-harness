/**
 * The hot core's cache-eviction and boot-cleanup behaviour. Mounting a live
 * subtree is exercised end-to-end (and through the wire); here we unit-test the
 * two parts that are hard to drive through a real loader: the Node loadCache
 * eviction (which must only touch the package's own modules, surviving pnpm
 * symlinks and Node v1/v2 loadCache shapes) and the boot-time wipe of leftover
 * hot inputs.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { randomBytes } from 'node:crypto'
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

/**
 * Documented limitation: Node's process-level ESM package resolution cache
 * (`modulesBinding.readPackageJSON`) caches a package's parsed `exports` map
 * keyed by its package.json path, with no JS-side handle or public API. A
 * subpath that fails `exports` resolution once stays failed for the life of the
 * process even after the file is fixed and every JS cache (`_pathCache`,
 * `require.cache`) is cleared. This test locks in that empirical fact so that
 * if a future Node version opens a clearing channel, the suite flags it.
 *
 * The scenario must run in a real Node process (via `node <script>`), because
 * inside a vitest worker bare-specifier imports are resolved by vite's module
 * runner, which does not touch Node's own `modulesBinding.readPackageJSON`
 * cache — only a genuine Node process exercises the documented behaviour. The
 * test therefore spawns a child `node` process running an inline probe script
 * that: (1) fails to import a bare subpath whose exports entry is missing,
 * (2) fixes the on-disk exports, (3) clears `_pathCache` and `require.cache`
 * (the same JS-side caches `clearNodeResolutionCache` reaches), and (4) re-imports
 * the same bare subpath, asserting it still fails. The probe package is created
 * under a temp dir's `node_modules` chain and removed afterwards.
 */
describe('ESM exports subpath resolution is process-cached (documented limitation)', () => {
  // A unique probe package name so it can never collide with a real dependency
  // and its (unavoidable, process-lifetime) stale cache entry stays isolated.
  const probe = `dsh-hot-esm-cache-${randomBytes(6).toString('hex')}`
  const root = mkdtempSync(join(tmpdir(), 'dsh-hot-esm-'))
  const probeDir = join(root, 'node_modules', probe)

  const exportsWithoutTeam = (): string => JSON.stringify({
    name: probe, version: '1.0.0', type: 'module',
    exports: { '.': './index.js' },
  })
  const exportsWithTeam = (): string => JSON.stringify({
    name: probe, version: '1.0.0', type: 'module',
    exports: { '.': './index.js', './team': './team.js' },
  })

  beforeAll(() => {
    // The probe is a real package under <root>/node_modules/<probe>, so the
    // child `node` process resolves `import('<probe>/team')` through Node's own
    // ESM resolver when the child script sits in <root>.
    mkdirSync(probeDir, { recursive: true })
    writeFileSync(join(probeDir, 'package.json'), exportsWithoutTeam())
    writeFileSync(join(probeDir, 'index.js'), 'export const v = 1\n')
    writeFileSync(join(probeDir, 'team.js'), 'export const team = "t1"\n')
  })

  afterAll(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('a failed bare-subpath import stays failed after fixing exports and clearing JS caches', () => {
    // The child script runs under <root>, whose node_modules holds the probe,
    // and drives the failure→fix→re-import sequence inside one Node process.
    const scriptPath = join(root, 'probe.mjs')
    writeFileSync(scriptPath, `
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createRequire } from 'node:module'

const pkgDir = ${JSON.stringify(probeDir)}
const pkgJson = join(pkgDir, 'package.json')

// 1) The probe's exports does not define './team' yet → import fails.
let firstCode
try { await import('${probe}/team'); firstCode = 'ok' }
catch (e) { firstCode = e?.code ?? 'no-code' }
console.log('first=' + firstCode)

// 2) Fix the on-disk exports so './team' is now exported.
writeFileSync(pkgJson, ${JSON.stringify(exportsWithTeam())})

// 3) Simulate the hot loader's JS-side eviction: clear _pathCache and the whole
//    require.cache. These are exactly what clearNodeResolutionCache reaches —
//    and empirically they do NOT touch the ESM result.
const mod = await import('node:module')
if (mod._pathCache) for (const k of Object.keys(mod._pathCache)) delete mod._pathCache[k]
const req = createRequire(import.meta.url)
for (const k of Object.keys(req.cache)) delete req.cache[k]

// 4) The same bare subpath still fails in this process — Node's ESM exports
//    cache is keyed by package.json path and unreachable from JS.
let secondCode
try { await import('${probe}/team'); secondCode = 'ok' }
catch (e) { secondCode = e?.code ?? 'no-code' }
console.log('second=' + secondCode)
`)
    // Spawn a real Node process so bare-specifier imports go through Node's own
    // ESM resolver (vite's runner inside a vitest worker would not hit the
    // process-level `modulesBinding.readPackageJSON` cache under test).
    const stdout = execFileSync(process.execPath, [scriptPath], { cwd: root, encoding: 'utf8' })
    const lines = stdout.trim().split('\n').filter(Boolean)
    const first = lines.find(l => l.startsWith('first='))?.slice('first='.length)
    const second = lines.find(l => l.startsWith('second='))?.slice('second='.length)

    // First attempt must have failed on the missing exports entry.
    expect(first).toBe('ERR_PACKAGE_PATH_NOT_EXPORTED')
    // After fixing the file AND clearing every JS-side cache the hot loader
    // reaches, the SAME bare subpath still fails — Node's ESM exports cache is
    // keyed by package.json path and unreachable from JS. This is the documented
    // limitation; the only recovery is a host restart.
    expect(second).toBe('ERR_PACKAGE_PATH_NOT_EXPORTED')
  })
})
