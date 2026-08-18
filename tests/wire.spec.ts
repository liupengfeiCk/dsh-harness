/**
 * The `/harness-hot` wire dispatch: the channel's `mount`/`unmount`/`upgrade`/
 * `list` endpoints, exercised against a fake `harnessHot` service. The
 * dispatch must fold a hot failure (restart required) and a bad payload onto
 * the wire's codes, and must fail closed when no service is composed.
 */

import { describe, expect, it } from 'vitest'
import {
  dispatchHarnessHot, HARNESS_HOT_CHANNEL,
} from '../src/wire/index.ts'
import { RestartRequiredError } from '../src/patch.ts'
import type { HarnessHot } from '../src/service.ts'

/** A fake `harnessHot` service double recording calls. */
function fakeService(overrides: Partial<HarnessHot> = {}): {
  service: HarnessHot
  calls: string[]
} {
  const calls: string[] = []
  const service = {
    mount: async (target: { package: string; profileDir?: string }) => {
      calls.push(`mount:${target.package}:${target.profileDir ?? 'default'}`)
      return { package: target.package, rowIds: ['harness-probe'], mountedAt: 1000 }
    },
    unmount: async (pkg: string) => {
      calls.push(`unmount:${pkg}`)
      return { package: pkg, rowIds: ['harness-probe'], mountedAt: 1000 }
    },
    upgrade: async (target: { package: string; profileDir?: string }) => {
      calls.push(`upgrade:${target.package}:${target.profileDir ?? 'default'}`)
      return { package: target.package, rowIds: ['harness-probe'], mountedAt: 1000 }
    },
    list: () => {
      calls.push('list')
      return [{ package: 'probe', rowIds: ['harness-probe'], mountedAt: 1000 }]
    },
    ...overrides,
  } as unknown as HarnessHot
  return { service, calls }
}

const signal = new AbortController().signal

describe('harness-hot wire mount', () => {
  it('dispatches mount and returns the record', async () => {
    const { service, calls } = fakeService()
    const result = await dispatchHarnessHot(service, 'mount', { package: 'probe' }, signal)
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('unreachable')
    expect(result.value).toMatchObject({ package: 'probe', rowIds: ['harness-probe'], mountedAt: 1000 })
    expect(calls).toEqual(['mount:probe:default'])
  })

  it('forwards an explicit profileDir', async () => {
    const { service, calls } = fakeService()
    await dispatchHarnessHot(service, 'mount', { package: 'probe', profileDir: '/tmp/p' }, signal)
    expect(calls).toEqual(['mount:probe:/tmp/p'])
  })
})

describe('harness-hot wire unmount', () => {
  it('dispatches unmount and returns the record', async () => {
    const { service, calls } = fakeService()
    const result = await dispatchHarnessHot(service, 'unmount', { package: 'probe' }, signal)
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('unreachable')
    expect(result.value).toMatchObject({ package: 'probe' })
    expect(calls).toEqual(['unmount:probe'])
  })

  it('returns null when nothing was mounted', async () => {
    const { service } = fakeService({ unmount: async () => null })
    const result = await dispatchHarnessHot(service, 'unmount', { package: 'ghost' }, signal)
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('unreachable')
    expect(result.value).toBeNull()
  })
})

describe('harness-hot wire upgrade', () => {
  it('dispatches upgrade and returns the new record', async () => {
    const { service, calls } = fakeService()
    const result = await dispatchHarnessHot(service, 'upgrade', { package: 'probe' }, signal)
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('unreachable')
    expect(result.value).toMatchObject({ package: 'probe' })
    expect(calls).toEqual(['upgrade:probe:default'])
  })
})

describe('harness-hot wire list', () => {
  it('returns the current mounts', async () => {
    const { service, calls } = fakeService()
    const result = await dispatchHarnessHot(service, 'list', {}, signal)
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('unreachable')
    expect(result.value).toEqual([{ package: 'probe', rowIds: ['harness-probe'], mountedAt: 1000 }])
    expect(calls).toEqual(['list'])
  })
})

describe('harness-hot wire failure folding', () => {
  it('fails closed with hot-not-found when no service is composed', async () => {
    const result = await dispatchHarnessHot(undefined, 'list', {}, signal)
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('unreachable')
    expect(result.error.code).toBe('hot-not-found')
  })

  it('maps a RestartRequiredError to hot-restart-required', async () => {
    const { service } = fakeService({
      mount: async () => {
        throw new RestartRequiredError('patch has a !!js expression')
      },
    })
    const result = await dispatchHarnessHot(service, 'mount', { package: 'probe' }, signal)
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('unreachable')
    expect(result.error.code).toBe('hot-restart-required')
    expect((result.error.details as { reason?: string }).reason).toContain('restart to activate')
  })

  it('maps a bad payload to bad-request', async () => {
    const { service } = fakeService()
    const result = await dispatchHarnessHot(service, 'mount', { package: '' }, signal)
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('unreachable')
    expect(result.error.code).toBe('bad-request')
  })

  it('rejects an unknown endpoint', async () => {
    const { service } = fakeService()
    const result = await dispatchHarnessHot(service, 'nope', {}, signal)
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('unreachable')
    expect(result.error.code).toBe('bad-request')
  })

  it('maps an internal failure to internal', async () => {
    const { service } = fakeService({
      mount: async () => { throw new Error('boom') },
    })
    const result = await dispatchHarnessHot(service, 'mount', { package: 'probe' }, signal)
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('unreachable')
    expect(result.error.code).toBe('internal')
  })

  it('exports the channel constant for registration', () => {
    expect(HARNESS_HOT_CHANNEL).toBe('/harness-hot')
  })
})
