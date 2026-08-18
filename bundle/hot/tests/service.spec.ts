/**
 * The HarnessHot service's row config and activation-time autoMount loop:
 * the config is validated at the plugin boundary, and the loop mounts the
 * whole list even when one package fails, so a stale entry (an uninstalled
 * or unpatchable package) can never take the tree down.
 */

import { describe, expect, it, vi } from 'vitest'
import { Context, Service, getTraceable, symbols, type Fiber } from '@deepseek-ai/cordis'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { HarnessHot, harnessHotConfigSchema, type HarnessHotConfig } from '../src/service.ts'
import { HotManager, type HotContext, type HotMountRecord } from '../src/hot.ts'

describe('harnessHotConfigSchema', () => {
  it('accepts an empty config and a populated autoMount list', () => {
    expect(harnessHotConfigSchema.parse({})).toEqual({})
    expect(harnessHotConfigSchema.parse({ autoMount: ['probe'] })).toEqual({ autoMount: ['probe'] })
  })

  it('rejects malformed autoMount shapes', () => {
    expect(() => harnessHotConfigSchema.parse({ autoMount: 'probe' })).toThrow()
    expect(() => harnessHotConfigSchema.parse({ autoMount: [''] })).toThrow()
    expect(() => harnessHotConfigSchema.parse({ autoMount: [42] })).toThrow()
  })
})

/** A HarnessHot double whose mount is driven by the test. */
class FakeHot extends HarnessHot {
  readonly mounted: string[] = []
  readonly failing = new Set<string>()

  override mount(target: { package: string; profileDir?: string }): Promise<HotMountRecord> {
    if (this.failing.has(target.package)) {
      return Promise.reject(new Error(`no bundle patch found for "${target.package}"`))
    }
    this.mounted.push(target.package)
    return Promise.resolve({ package: target.package, file: '/fake', rowIds: [], mountedAt: 0 })
  }
}

function makeService(config?: HarnessHotConfig): FakeHot {
  return new FakeHot(new Context(), config)
}

describe('HarnessHot autoMount', () => {
  it('mounts nothing without a config', async () => {
    const service = makeService()
    await service[Service.init]()
    expect(service.mounted).toEqual([])
  })

  it('mounts every configured package in order', async () => {
    const service = makeService({ autoMount: ['alpha', 'beta'] })
    await service[Service.init]()
    expect(service.mounted).toEqual(['alpha', 'beta'])
  })

  it('skips a failing package and still mounts the rest', async () => {
    const service = makeService({ autoMount: ['alpha', 'stale', 'beta'] })
    service.failing.add('stale')
    await service[Service.init]()
    expect(service.mounted).toEqual(['alpha', 'beta'])
  })
})

describe('hostCtx shadow stripping', () => {
  it('strips the cordis shadow the wire wraps the service in', () => {
    // `HarnessHot.hostCtx()` returns `getTraceable(this.ctx, this.ctx)`; the
    // wire's traceable method call swaps the service onto a shadow context
    // (`ctx.extend({ [shadow]: origin })`), which would otherwise propagate
    // into the Include subtree and break service inject on a hot re-mount.
    // This test pins the exact stripping behaviour that hostCtx relies on.
    const root = new Context()
    const origin = root.extend()
    const shadowed = origin.extend({ [symbols.shadow]: origin })
    expect(shadowed[symbols.shadow]).toBe(origin)
    const stripped = getTraceable(shadowed, shadowed)
    expect(stripped[symbols.shadow]).toBeUndefined()
    // A shadow-free ctx resolves a service it provides, exactly as a boot
    // mount's service context does.
    root.provide('probe', { value: 1 })
    expect((stripped as { probe?: { value: number } }).probe).toEqual({ value: 1 })
  })

  it('leaves a shadow-free context untouched', () => {
    const root = new Context()
    expect(getTraceable(root, root)).toBe(root)
  })
})

/**
 * The full-tree recompose guard: while a hot copy is mounted, a user patch
 * change recomposes the root include tree, which would otherwise resurrect the
 * static rows the hot copy's convergence disabled and collide with it. The
 * guard listens on the cordis `internal/update` waterfall (the earliest
 * reliable signal, before the include handler recomposes) and — for the root
 * include's own fiber — unmounts every hot copy first, symmetrically restoring
 * its static rows, then lets the recompose proceed on a clean static layer.
 */
describe('HarnessHot recompose guard', () => {
  /**
   * A HarnessHot pinned to a temp profile dir (so mounts stay out of the cwd)
   * that already holds one mountable `hotprobe` package.
   */
  function makePinnedService(): { service: HarnessHot; manager: HotManager } {
    const root = mkdtempSync(join(tmpdir(), 'dsh-hot-guard-'))
    const pkgDir = join(root, 'node_modules', 'hotprobe')
    mkdirSync(join(pkgDir, 'lib'), { recursive: true })
    writeFileSync(join(pkgDir, 'package.json'), JSON.stringify({ name: 'hotprobe', version: '1.0.0' }))
    writeFileSync(join(pkgDir, 'cordis.patch.yml'), "- insert:\n    - id: probe\n      name: 'hotprobe'\n")
    const ctx = new Context()
    ctx.baseUrl = pathToFileURL(root + '/').href
    const service = new HarnessHot(ctx, {})
    const manager = (service as unknown as { manager: HotManager }).manager
    return { service, manager }
  }

  it('unmounts every hot copy on a root-include recompose', async () => {
    const { service, manager } = makePinnedService()
    // Mount one hot copy through the manager with a fake plugin handle so no
    // real loader/Include is involved. The handle records its dispose.
    const disposed: string[] = []
    const fakeCtx = {
      plugin: () => ({ await: async () => {}, dispose: async () => { disposed.push('hotprobe') } }),
    } as HotContext
    await manager.mount(fakeCtx, 'hotprobe')
    expect(manager.list().length).toBe(1)

    // A root-include fiber update (what a user patch change routes through)
    // must trigger the guard's full unmount, then continue the recompose.
    const rootFiber = { entry: { options: { id: 'include', name: 'cordis:include' } } } as unknown as Fiber
    const next = vi.fn(async () => {})
    await (service as unknown as {
      handleInternalUpdate(fiber: Fiber, next: () => void | Promise<void>): Promise<void>
    }).handleInternalUpdate(rootFiber, next)

    // The hot copy was disposed (guard unmount) and the recompose continued.
    expect(disposed).toEqual(['hotprobe'])
    expect(manager.list().length).toBe(0)
    expect(next).toHaveBeenCalledTimes(1)
  })

  it('does not unmount hot copies for a non-root-include update', async () => {
    const { service, manager } = makePinnedService()
    const disposed: string[] = []
    const fakeCtx = {
      plugin: () => ({ await: async () => {}, dispose: async () => { disposed.push('hotprobe') } }),
    } as HotContext
    await manager.mount(fakeCtx, 'hotprobe')
    expect(manager.list().length).toBe(1)

    // A regular plugin's own config update is NOT a full recompose — the guard
    // must leave hot copies alone and still continue the chain.
    const otherFiber = { entry: { options: { id: 'some-plugin', name: 'some-plugin' } } } as unknown as Fiber
    const next = vi.fn(async () => {})
    await (service as unknown as {
      handleInternalUpdate(fiber: Fiber, next: () => void | Promise<void>): Promise<void>
    }).handleInternalUpdate(otherFiber, next)

    expect(disposed).toEqual([])
    expect(manager.list().length).toBe(1)
    expect(next).toHaveBeenCalledTimes(1)
  })

  it('handleRecompose unmounts every hot copy (dispose the mounted fiber)', async () => {
    const { service, manager } = makePinnedService()
    // A static-row adapter records the disable at mount; the unmount path the
    // guard drives is HotManager.unmount, whose symmetric static restore is
    // covered by the hot core's own convergence suite.
    const disabled: string[] = []
    const disposed: string[] = []
    const fakeCtx = {
      plugin: () => ({ await: async () => {}, dispose: async () => { disposed.push('hotprobe') } }),
      staticRows: {
        has: (id: string) => id === 'probe',
        disable: async (id: string) => { disabled.push(id) },
        restore: async () => {},
      },
    } as HotContext
    await manager.mount(fakeCtx, 'hotprobe')
    expect(disabled).toEqual(['probe'])
    expect(manager.list()[0]?.staticRows).toEqual(['probe'])

    await (service as unknown as { handleRecompose(): Promise<void> }).handleRecompose()

    // The guard disposed the mounted hot copy, removing it from the live list.
    expect(disposed).toEqual(['hotprobe'])
    expect(manager.list().length).toBe(0)
  })
})
