// @vitest-environment jsdom
/**
 * The session team-mode chip: per-session mode controller (read, optimistic
 * switch, lock rollback) and its registration into the `conversation.input.left`
 * slot. Mirrors the team-apply bench; these browser-half suites stay excluded
 * from the thread-safe lane (see vitest.config.ts) and run against a live
 * host instance.
 */

import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { TestRemote, usePinnedBrowserLanguages } from '@deepseek-ai/dsh-client-test-runtime'
import { apply, inject, TeamModeController } from '../../src/ui-team/index.ts'
import { TEAM_PRESET_CHANNEL } from '../../src/ui-team/wire-client.ts'
import type { TeamPresetWire, WireTeamModeState } from '../../src/ui-team/wire-client.ts'
import { TeamModeChip } from '../../src/ui-team/TeamModeChip.tsx'

usePinnedBrowserLanguages('zh-CN')

/** A success wire result. */
const wireOk = (value: unknown) => Promise.resolve({ ok: true as const, value })
const wireErr = (code: string, message: string) =>
  Promise.resolve({ ok: false as const, error: { code, message, details: {} } })

/** A wire face scripted per endpoint, recording each mode call. */
function fakeWire(overrides: {
  modeRead?: () => Promise<{ ok: true; value: WireTeamModeState } | { ok: false; error: unknown }>
  modeSelect?: (payload: { mode: string; team?: string }) => Promise<{ ok: true; value: WireTeamModeState } | { ok: false; error: unknown }>
} = {}): { wire: TeamPresetWire; calls: string[] } {
  const calls: string[] = []
  return {
    calls,
    wire: {
      modeRead: (payload) => {
        calls.push(`modeRead:${payload.sessionId}`)
        return overrides.modeRead?.() ?? wireOk({ mode: 'standard' })
      },
      modeSelect: (payload) => {
        calls.push(`modeSelect:${payload.sessionId}:${payload.mode}:${payload.team ?? ''}`)
        return overrides.modeSelect?.(payload) ?? wireOk({ mode: payload.mode, ...payload.team ? { team: payload.team } : {} })
      },
      list: () => wireOk({
        teams: [{ id: 'edit', trust: 'user', metadata: { name: '编辑团队' }, roles: [{ id: 'copywriter' }] }],
        authorable: true, hasDocument: true, subagents: ['writer'],
      }),
      read: () => wireOk({ team: { id: 'edit', trust: 'user', metadata: {}, roles: [] } }),
      create: () => wireOk({ id: 'edit' }),
      update: () => wireOk({ id: 'edit' }),
      remove: () => wireOk({}),
      openLocation: () => wireOk({ opened: true }),
    } as unknown as TeamPresetWire,
  }
}

describe('team mode controller', () => {
  it('loads the session mode and the standard-first team roster', async () => {
    const { wire } = fakeWire()
    const controller = new TeamModeController(wire, 's1')
    await controller.load()
    const state = controller.store.getSnapshot()
    expect(state.status).toBe('ready')
    expect(state.options.map(option => option.id)).toEqual(['standard', 'edit'])
    expect(state.options[1]!.name).toBe('编辑团队')
    expect(state.current).toEqual({ mode: 'standard' })
  })

  it('shows the team as current when the session already runs team mode', async () => {
    const { wire } = fakeWire({ modeRead: () => wireOk({ mode: 'team', team: 'edit' }) })
    const controller = new TeamModeController(wire, 's1')
    await controller.load()
    expect(controller.store.getSnapshot().current).toEqual({ mode: 'team', team: 'edit' })
  })

  it('optimistically flips to a team and reconciles with the host reply', async () => {
    const { wire, calls } = fakeWire()
    const controller = new TeamModeController(wire, 's1')
    await controller.load()

    const selectPromise = controller.select('team', 'edit')
    // Optimistic: the local current is already the picked team before the reply.
    expect(controller.store.getSnapshot().current).toEqual({ mode: 'team', team: 'edit' })
    await selectPromise
    expect(controller.store.getSnapshot().current).toEqual({ mode: 'team', team: 'edit' })
    expect(calls).toContain('modeSelect:s1:team:edit')
  })

  it('rolls back a rejected pick (host locked the session) and surfaces the reason', async () => {
    const { wire } = fakeWire({
      modeSelect: () => wireErr('team-mode-locked', 'session has already started'),
    })
    const controller = new TeamModeController(wire, 's1')
    await controller.load()

    await controller.select('team', 'edit')
    const state = controller.store.getSnapshot()
    expect(state.current).toEqual({ mode: 'standard' })
    expect(state.busy).toBe(false)
    expect(state.error).toContain('already started')
  })

  it('rolls back to the last accepted mode when a later pick is rejected', async () => {
    let reject = false
    const { wire } = fakeWire({
      modeSelect: () => reject
        ? wireErr('team-mode-locked', 'session has already started')
        : wireOk({ mode: 'team', team: 'edit' }),
    })
    const controller = new TeamModeController(wire, 's1')
    await controller.load()
    await controller.select('team', 'edit')
    reject = true
    await controller.select('standard')
    expect(controller.store.getSnapshot().current).toEqual({ mode: 'team', team: 'edit' })
  })

  it('guards re-entry while a pick is in flight', async () => {
    let resolveSelect: ((value: { ok: true; value: WireTeamModeState }) => void) | undefined
    const { wire } = fakeWire({
      modeSelect: () => new Promise((resolve) => { resolveSelect = resolve }),
    })
    const controller = new TeamModeController(wire, 's1')
    await controller.load()

    const first = controller.select('team', 'edit')
    // Second call while busy: ignored.
    await controller.select('standard')
    expect(controller.store.getSnapshot().current).toEqual({ mode: 'team', team: 'edit' })
    resolveSelect!({ ok: true, value: { mode: 'team', team: 'edit' } })
    await first
    expect(controller.store.getSnapshot().current).toEqual({ mode: 'team', team: 'edit' })
  })
})

describe('ui-team mode chip apply', () => {
  async function bench() {
    const ctx = new Context()
    await ctx.plugin(SlotRegistry).await()
    const locale = new LocaleRuntime(ctx)
    ctx.provide('locale', locale)
    new TestRemote(ctx)
    ctx.provide('connection', {
      api: {},
      rpc: {
        call: (channel: string, endpoint: string, payload: unknown) => {
          if (channel !== TEAM_PRESET_CHANNEL) {
            return Promise.reject(new Error(`unexpected rpc channel ${JSON.stringify(channel)}`))
          }
          if (endpoint === 'list') {
            return Promise.resolve({ ok: true as const, value: { teams: [], authorable: true, hasDocument: true, subagents: [] } })
          }
          if (endpoint === 'modeRead') {
            return Promise.resolve({ ok: true as const, value: { mode: 'standard' } })
          }
          if (endpoint === 'modeSelect') {
            return Promise.resolve({ ok: true as const, value: { mode: (payload as { mode: string }).mode } })
          }
          return Promise.reject(new Error(`unexpected endpoint ${endpoint}`))
        },
      },
    } as never)
    return { ctx, slots: ctx.get('slots') as SlotRegistry }
  }

  function declareRoot(slots: SlotRegistry): void {
    slots.register({
      name: 'root',
      children: {
        'conversation.input.left': { kind: 'list', scope: 'session' },
      },
    } as never, () => null)
  }

  it('declares the services it uses', () => {
    expect(inject).toEqual(['slots', 'locale', 'connection', 'remote'])
  })

  it('registers the mode chip into conversation.input.left', async () => {
    const { ctx, slots } = await bench()
    declareRoot(slots)
    await ctx.plugin({ inject: [...inject], apply }).await()
    const entry = slots.entries('conversation.input.left')[0]!
    expect(entry.component).toBe(TeamModeChip)
    expect(entry.options).toMatchObject({ id: 'teams-mode', order: 10 })
  })
})
