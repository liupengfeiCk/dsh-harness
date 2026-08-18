// @vitest-environment jsdom
/**
 * Registration: the team settings section comes from the team apply, deferred
 * until the settings.section slot is declared, at order 22 (beside the
 * subagent section's 21).
 */

import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { resolveSlotLabel } from '@deepseek-ai/dsh-client-ui-slots'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { TestRemote, usePinnedBrowserLanguages } from '@deepseek-ai/dsh-client-test-runtime'
import { apply, inject } from '../../src/ui-team/index.ts'
import { TEAM_PRESET_CHANNEL } from '../../src/ui-team/wire-client.ts'
import { TeamSection } from '../../src/ui-team/TeamSection.tsx'
import type { TeamSectionInjected } from '../../src/ui-team/TeamSection.tsx'

// The service reads its initial locale from the browser; these specs assert
// the shipped Chinese copy, so they state the browser they assume.
usePinnedBrowserLanguages('zh-CN')

const ROSTER_ONE = {
  teams: [{ id: 'edit', trust: 'user', metadata: { name: '编辑团队' }, roles: [{ id: 'copywriter' }] }],
  authorable: true,
  hasDocument: true,
  bodies: ['writer'],
}

async function bench() {
  const ctx = new Context()
  const calls: string[] = []
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
        calls.push(`team:${endpoint}`)
        const id = (payload as { id?: string }).id ?? ''
        if (endpoint === 'list') return Promise.resolve({ ok: true as const, value: ROSTER_ONE })
        if (endpoint === 'read') {
          return Promise.resolve({
            ok: true as const,
            value: { team: { id, trust: 'user', metadata: { name: '编辑团队' }, roles: [{ id: 'copywriter', body: 'writer', memory: 'one-shot' }] } },
          })
        }
        if (endpoint === 'create') return Promise.resolve({ ok: true as const, value: { id } })
        if (endpoint === 'update') return Promise.resolve({ ok: true as const, value: { id } })
        if (endpoint === 'remove') return Promise.resolve({ ok: true as const, value: {} })
        if (endpoint === 'openLocation') return Promise.resolve({ ok: true as const, value: { opened: true as const } })
        return Promise.reject(new Error(`unexpected endpoint ${endpoint}`))
      },
    },
  } as never)
  return { ctx, slots: ctx.get('slots') as SlotRegistry, calls }
}

function declareRoot(slots: SlotRegistry): () => void {
  return slots.register({
    name: 'root',
    children: {
      'settings.section': { kind: 'list', scope: 'root' },
    },
  } as never, () => null)
}

describe('ui-team apply', () => {
  it('declares the services it uses', () => {
    expect(inject).toEqual(['slots', 'locale', 'connection', 'remote'])
  })

  it('registers the team settings section at order 22 beside the subagent row', async () => {
    const { ctx, slots } = await bench()
    declareRoot(slots)
    await ctx.plugin({ inject: [...inject], apply }).await()

    const section = slots.entries('settings.section')[0]!
    expect(section.component).toBe(TeamSection)
    expect(section.options).toMatchObject({ id: 'teams', order: 22 })
    expect(resolveSlotLabel(section.options.label)).toBe('团队')
  })

  it('registers into a declaration that arrives after apply', async () => {
    const { ctx, slots } = await bench()
    await ctx.plugin({ inject: [...inject], apply }).await()
    declareRoot(slots)
    await vi.waitFor(() => { expect(slots.entries('settings.section')).toHaveLength(1) })
  })

  it('hands the section its own store and drives create through it', async () => {
    const { ctx, slots, calls } = await bench()
    declareRoot(slots)
    await ctx.plugin({ inject: [...inject], apply }).await()
    const section = (slots.entries('settings.section')[0]!.inject as unknown as () => TeamSectionInjected)()
    await section.load()
    expect(section.hooks.teamSection.getSnapshot().rows[0]!.id).toBe('edit')
    section.beginCreate()
    section.setCreateId('news')
    section.setCreateRoleField(0, 'id', 'copywriter')
    section.setCreateRoleField(0, 'body', 'writer')
    await section.confirmCreate()
    expect(calls).toContain('team:create')
  })

  it('routes the detail actions to one controller', async () => {
    const { ctx, slots, calls } = await bench()
    declareRoot(slots)
    await ctx.plugin({ inject: [...inject], apply }).await()
    const section = (slots.entries('settings.section')[0]!.inject as unknown as () => TeamSectionInjected)()
    await section.load()
    await section.beginDetail('edit')
    expect(section.hooks.teamSection.getSnapshot().detail?.roles[0]!.body).toBe('writer')
    section.closeDetail()
    section.confirmDelete('edit')
    await section.remove()
    expect(calls).toContain('team:remove')
  })

  it('re-reads the roster when the connection comes back', async () => {
    const { ctx, slots, calls } = await bench()
    declareRoot(slots)
    await ctx.plugin({ inject: [...inject], apply }).await()
    const section = (slots.entries('settings.section')[0]!.inject as unknown as () => TeamSectionInjected)()
    await section.load()
    const before = calls.length
    ctx.emit('connection/reset')
    await vi.waitFor(() => { expect(calls.length).toBeGreaterThan(before) })
  })
})
