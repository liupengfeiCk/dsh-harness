// @vitest-environment jsdom
/**
 * The team section controller: roster loading, create (id + initial roles),
 * the edit detail over the full role roster, the enabled toggle, and delete.
 */

import { describe, expect, it } from 'vitest'
import type { IApiClient } from '@deepseek-ai/dsh-api-remotes/client'
import {
  createBlocker, detailBlocker, TeamSectionController,
} from '../../src/ui-team/section-store.ts'
import type { TeamPresetWire } from '../../src/ui-team/wire-client.ts'

/** A success wire result (the `/team-preset` channel returns RpcResult). */
const wireOk = (value: unknown) => Promise.resolve({ ok: true as const, value })

/** A wire face reporting one user team with one role and two bodies. */
function fakeApi(): Pick<IApiClient, 'llm'> & { teamPresets: TeamPresetWire } {
  return {
    teamPresets: {
      list: () => wireOk({
        teams: [{
          id: 'edit', trust: 'user', metadata: { name: 'Edit', enabled: true },
          roles: [{ id: 'copywriter' }],
        }],
        authorable: true,
        hasDocument: true,
        bodies: ['writer', 'reviewer'],
      }),
      read: () => wireOk({
        team: {
          id: 'edit', trust: 'user', metadata: { name: 'Edit', enabled: true },
          roles: [{ id: 'copywriter', description: 'Writes', prompt: 'You are a writer.', body: 'writer', memory: 'one-shot' }],
        },
      }),
      update: (request: { id: string }) => wireOk({ id: request.id }),
      create: (request: { id: string }) => wireOk({ id: request.id }),
      remove: () => wireOk({}),
      openLocation: () => wireOk({ opened: true }),
    },
    llm: {} as never,
  } as unknown as Pick<IApiClient, 'llm'> & { teamPresets: TeamPresetWire }
}

describe('team roster loading', () => {
  it('loads the roster and forwards bodies', async () => {
    const controller = new TeamSectionController(fakeApi())
    await controller.load()
    const state = controller.store.getSnapshot()
    expect(state.status).toBe('ready')
    expect(state.rows).toHaveLength(1)
    expect(state.rows[0]!.id).toBe('edit')
    expect(state.rows[0]!.roleCount).toBe(1)
    expect(state.bodies).toEqual(['writer', 'reviewer'])
    expect(state.authorable).toBe(true)
  })
})

describe('create dialog', () => {
  it('starts with one empty role and blocks until id and roles are filled', async () => {
    const controller = new TeamSectionController(fakeApi())
    await controller.load()
    controller.beginCreate()
    const draft = controller.store.getSnapshot().create!
    expect(draft.roles).toHaveLength(1)
    expect(createBlocker(draft, controller.store.getSnapshot().rows)).toBe('idRequired')

    controller.setCreateId('edit')
    expect(createBlocker(controller.store.getSnapshot().create!, controller.store.getSnapshot().rows)).toBe('idTaken')

    controller.setCreateId('news')
    expect(createBlocker(controller.store.getSnapshot().create!, controller.store.getSnapshot().rows)).toBe('roleBodyRequired')

    controller.setCreateRoleField(0, 'body', 'writer')
    expect(createBlocker(controller.store.getSnapshot().create!, controller.store.getSnapshot().rows)).toBeUndefined()
  })

  it('submits the create and re-reads the roster', async () => {
    let created: { id: string; roles: unknown[] } | undefined
    const api = {
      teamPresets: {
        list: () => wireOk({ teams: [], authorable: true, hasDocument: true, bodies: ['writer'] }),
        create: (request: { id: string; roles: unknown[] }) => { created = request; return wireOk({ id: request.id }) },
        read: () => wireOk({ team: { id: 'x', trust: 'user', metadata: {}, roles: [] } }),
        update: (request: { id: string }) => wireOk({ id: request.id }),
        remove: () => wireOk({}),
        openLocation: () => wireOk({ opened: true }),
      },
      llm: {} as never,
    } as unknown as Pick<IApiClient, 'llm'> & { teamPresets: TeamPresetWire }
    const controller = new TeamSectionController(api)
    await controller.load()
    controller.beginCreate()
    controller.setCreateId('news')
    controller.setCreateRoleField(0, 'id', 'copywriter')
    controller.setCreateRoleField(0, 'body', 'writer')
    controller.setCreateRoleField(0, 'memory', 'persistent')
    await controller.confirmCreate()
    expect(created?.id).toBe('news')
    expect(created?.roles).toEqual([{ id: 'copywriter', body: 'writer', memory: 'persistent' }])
    expect(controller.store.getSnapshot().create).toBeNull()
  })
})

describe('edit detail', () => {
  it('loads a team detail with full roles and edits a role field', async () => {
    const controller = new TeamSectionController(fakeApi())
    await controller.load()
    await controller.beginDetail('edit')
    const draft = controller.store.getSnapshot().detail!
    expect(draft.title).toBe('Edit')
    expect(draft.roles).toHaveLength(1)
    expect(draft.roles[0]!.body).toBe('writer')

    controller.setDetailRoleField(0, 'body', 'reviewer')
    controller.setDetailRoleField(0, 'memory', 'persistent')
    expect(controller.store.getSnapshot().detail!.roles[0]!.body).toBe('reviewer')
    expect(controller.store.getSnapshot().detail!.roles[0]!.memory).toBe('persistent')
  })

  it('blocks a save until every role binds a body', async () => {
    const controller = new TeamSectionController(fakeApi())
    await controller.load()
    await controller.beginDetail('edit')
    const draft = controller.store.getSnapshot().detail!
    expect(detailBlocker(draft)).toBeUndefined()

    controller.addDetailRole()
    const withEmpty = controller.store.getSnapshot().detail!
    expect(withEmpty.roles).toHaveLength(2)
    expect(detailBlocker(withEmpty)).toBe('roleBodyRequired')

    controller.setDetailRoleField(1, 'id', 'editor')
    controller.setDetailRoleField(1, 'body', 'reviewer')
    expect(detailBlocker(controller.store.getSnapshot().detail!)).toBeUndefined()
  })

  it('saves the staged roster and re-reads', async () => {
    const controller = new TeamSectionController(fakeApi())
    await controller.load()
    await controller.beginDetail('edit')
    controller.setDetailRoleField(0, 'body', 'reviewer')
    await controller.confirmDetail()
    expect(controller.store.getSnapshot().detail).toBeNull()
    expect(controller.store.getSnapshot().status).toBe('ready')
  })
})

describe('toggle and delete', () => {
  it('toggles a team via an enabled-only update', async () => {
    let toggle: { id: string; metadata?: { enabled?: boolean } } | undefined
    const api = {
      teamPresets: {
        list: () => wireOk({
          teams: [{ id: 'edit', trust: 'user', metadata: { enabled: true }, roles: [] }],
          authorable: true, hasDocument: true, bodies: [],
        }),
        read: () => wireOk({ team: { id: 'edit', trust: 'user', metadata: {}, roles: [] } }),
        update: (request: { id: string; metadata?: { enabled?: boolean } }) => { toggle = request; return wireOk({ id: request.id }) },
        create: (request: { id: string }) => wireOk({ id: request.id }),
        remove: () => wireOk({}),
        openLocation: () => wireOk({ opened: true }),
      },
      llm: {} as never,
    } as unknown as Pick<IApiClient, 'llm'> & { teamPresets: TeamPresetWire }
    const controller = new TeamSectionController(api)
    await controller.load()
    await controller.toggle('edit', false)
    expect(toggle).toEqual({ id: 'edit', metadata: { enabled: false } })
  })

  it('deletes the team awaiting confirmation', async () => {
    const controller = new TeamSectionController(fakeApi())
    await controller.load()
    controller.confirmDelete('edit')
    expect(controller.store.getSnapshot().pendingDelete).toBe('edit')
    await controller.remove()
    expect(controller.store.getSnapshot().pendingDelete).toBeNull()
  })
})

describe('role editing helpers', () => {
  it('keeps a role draft when poking a non-role field', async () => {
    // Sanity that the store-level patch never corrupts a role row.
    const controller = new TeamSectionController(fakeApi())
    await controller.load()
    await controller.beginDetail('edit')
    controller.setDetailRoleField(0, 'nope', 'x')
    expect(controller.store.getSnapshot().detail!.roles[0]!.body).toBe('writer')
  })
})
