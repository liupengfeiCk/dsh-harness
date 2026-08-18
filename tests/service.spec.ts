/**
 * The HarnessHot service's row config and activation-time autoMount loop:
 * the config is validated at the plugin boundary, and the loop mounts the
 * whole list even when one package fails, so a stale entry (an uninstalled
 * or unpatchable package) can never take the tree down.
 */

import { describe, expect, it } from 'vitest'
import { Context, Service } from '@deepseek-ai/cordis'
import { HarnessHot, harnessHotConfigSchema, type HarnessHotConfig } from '../src/service.ts'
import type { HotMountRecord } from '../src/hot.ts'

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
