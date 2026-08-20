// @vitest-environment jsdom
/**
 * The team section controller: roster loading, create (id + initial roles),
 * the edit detail over the full role roster (compact list + single-role edit
 * dialog), the enabled toggle, and delete.
 */

import { describe, expect, it } from 'vitest'
import type { IApiClient } from '@deepseek-ai/dsh-api-remotes/client'
import {
  createBlocker, detailBlocker, roleBlocker, TeamSectionController,
} from '../../src/ui-team/section-store.ts'
import type { TeamPresetWire } from '../../src/ui-team/wire-client.ts'

/** A success wire result (the `/team-preset` channel returns RpcResult). */
const wireOk = (value: unknown) => Promise.resolve({ ok: true as const, value })

/** A wire face reporting one user team with two roles and two subagents. */
function fakeApi(): Pick<IApiClient, 'llm'> & { teamPresets: TeamPresetWire } {
  return {
    teamPresets: {
      list: () => wireOk({
        teams: [{
          id: 'edit', trust: 'user', metadata: { name: 'Edit', enabled: true },
          roles: [
            { id: 'copywriter' },
            { id: 'scout' },
          ],
        }],
        authorable: true,
        hasDocument: true,
        subagents: ['writer', 'reviewer'],
      }),
      read: () => wireOk({
        team: {
          id: 'edit', trust: 'user', metadata: { name: 'Edit', enabled: true },
          roles: [
            { id: 'copywriter', description: 'Writes copy.', prompt: 'You are a writer.', subagent: 'writer', level: 2, memory: 'one-shot' },
            { id: 'scout', description: 'Reads source.', prompt: 'You are a scout.', subagent: 'reviewer', level: 1, memory: 'persistent' },
          ],
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
  it('loads the roster and forwards subagents', async () => {
    const controller = new TeamSectionController(fakeApi())
    await controller.load()
    const state = controller.store.getSnapshot()
    expect(state.status).toBe('ready')
    expect(state.rows).toHaveLength(1)
    expect(state.rows[0]!.id).toBe('edit')
    expect(state.rows[0]!.roleCount).toBe(2)
    expect(state.subagents).toEqual(['writer', 'reviewer'])
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
    expect(createBlocker(controller.store.getSnapshot().create!, controller.store.getSnapshot().rows)).toBe('roleSubagentRequired')

    controller.setCreateRoleField(0, 'subagent', 'writer')
    expect(createBlocker(controller.store.getSnapshot().create!, controller.store.getSnapshot().rows)).toBeUndefined()
  })

  it('submits the create and re-reads the roster', async () => {
    let created: { id: string; roles: unknown[] } | undefined
    const api = {
      teamPresets: {
        list: () => wireOk({ teams: [], authorable: true, hasDocument: true, subagents: ['writer'] }),
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
    controller.setCreateRoleField(0, 'subagent', 'writer')
    controller.setCreateRoleField(0, 'memory', 'persistent')
    await controller.confirmCreate()
    expect(created?.id).toBe('news')
    expect(created?.roles).toEqual([{ id: 'copywriter', subagent: 'writer', level: 1, memory: 'persistent' }])
    expect(controller.store.getSnapshot().create).toBeNull()
  })
})

describe('edit detail (list + role edits)', () => {
  it('loads a team detail with full roles and starts with no role edit open', async () => {
    const controller = new TeamSectionController(fakeApi())
    await controller.load()
    await controller.beginDetail('edit')
    const draft = controller.store.getSnapshot().detail!
    expect(draft.title).toBe('Edit')
    expect(draft.roles).toHaveLength(2)
    expect(draft.roles[0]!.subagent).toBe('writer')
    expect(draft.roleEdit).toBeNull()
    expect(detailBlocker(draft)).toBeUndefined()
  })

  it('blocks a team save when a roster row lacks a subagent', async () => {
    const controller = new TeamSectionController(fakeApi())
    await controller.load()
    await controller.beginDetail('edit')
    controller.addRoleInDetail()
    // addRoleInDetail immediately opens a role edit over the new row; cancel
    // it to leave an empty-bodied role in the roster.
    controller.cancelRoleEdit()
    const withEmpty = controller.store.getSnapshot().detail!
    expect(withEmpty.roles).toHaveLength(3)
    expect(withEmpty.roles[2]!.subagent).toBe('')
    expect(detailBlocker(withEmpty)).toBe('roleSubagentRequired')
  })
})

describe('role-level edits (compact list → single-role edit dialog)', () => {
  it('beginRoleEdit clones the row into a draft without mutating the roster', async () => {
    const controller = new TeamSectionController(fakeApi())
    await controller.load()
    await controller.beginDetail('edit')

    controller.beginRoleEdit(0)
    const edit = controller.store.getSnapshot().detail!.roleEdit
    expect(edit).not.toBeNull()
    expect(edit!.kind).toBe('existing')
    if (edit!.kind !== 'existing') throw new Error('expected existing edit')
    expect(edit!.index).toBe(0)
    expect(edit!.dirty).toBe(false)
    expect(edit!.draft).toEqual(controller.store.getSnapshot().detail!.roles[0]!)
    // The roster is not mutated just by opening the edit.
    expect(controller.store.getSnapshot().detail!.roles[0]!.subagent).toBe('writer')
  })

  it('setRoleEditField marks the draft dirty and updates a field', async () => {
    const controller = new TeamSectionController(fakeApi())
    await controller.load()
    await controller.beginDetail('edit')
    controller.beginRoleEdit(1)

    controller.setRoleEditField('memory', 'persistent')
    const edit = controller.store.getSnapshot().detail!.roleEdit
    expect(edit!.dirty).toBe(true)
    if (edit!.kind !== 'existing') throw new Error('expected existing')
    expect(edit!.draft.memory).toBe('persistent')
    // Roster not yet committed.
    expect(controller.store.getSnapshot().detail!.roles[1]!.memory).toBe('persistent')
  })

  it('saveRoleEdit writes the staged draft back and closes the edit', async () => {
    const controller = new TeamSectionController(fakeApi())
    await controller.load()
    await controller.beginDetail('edit')
    controller.beginRoleEdit(0)
    controller.setRoleEditField('subagent', 'reviewer')

    controller.saveRoleEdit()
    const detail = controller.store.getSnapshot().detail!
    expect(detail.roleEdit).toBeNull()
    expect(detail.roles[0]!.subagent).toBe('reviewer')
    expect(detail.roles[1]!.subagent).toBe('reviewer')
  })

  it('cancelRoleEdit on an existing edit discards the staged draft and leaves the roster untouched', async () => {
    const controller = new TeamSectionController(fakeApi())
    await controller.load()
    await controller.beginDetail('edit')
    controller.beginRoleEdit(0)
    controller.setRoleEditField('subagent', 'reviewer')
    controller.setRoleEditField('memory', 'persistent')

    controller.cancelRoleEdit()
    const detail = controller.store.getSnapshot().detail!
    expect(detail.roleEdit).toBeNull()
    expect(detail.roles[0]!.subagent).toBe('writer')
    expect(detail.roles[0]!.memory).toBe('one-shot')
  })

  it('addRoleInDetail appends a blank row and opens the edit over it', async () => {
    const controller = new TeamSectionController(fakeApi())
    await controller.load()
    await controller.beginDetail('edit')

    const before = controller.store.getSnapshot().detail!.roles.length
    controller.addRoleInDetail()
    const detail = controller.store.getSnapshot().detail!
    expect(detail.roles.length).toBe(before + 1)
    const edit = detail.roleEdit
    expect(edit).not.toBeNull()
    expect(edit!.kind).toBe('new')
    expect(edit!.draft).toEqual({ id: '', description: '', prompt: '', subagent: '', level: 1, memory: 'one-shot' })
    // roleBlocker only fails on the targeted single-role form — the blank
    // trailing row makes the whole roster block, but the new role is the
    // one being filled in.
    expect(roleBlocker([edit!.draft])).toBe('roleIdRequired')
  })

  it('saveRoleEdit on a new edit commits the draft without double-inserting', async () => {
    const controller = new TeamSectionController(fakeApi())
    await controller.load()
    await controller.beginDetail('edit')
    controller.addRoleInDetail()
    controller.setRoleEditField('id', 'editor')
    controller.setRoleEditField('subagent', 'reviewer')

    controller.saveRoleEdit()
    const detail = controller.store.getSnapshot().detail!
    expect(detail.roleEdit).toBeNull()
    expect(detail.roles).toHaveLength(3)
    expect(detail.roles[2]!.id).toBe('editor')
    expect(detail.roles[2]!.subagent).toBe('reviewer')
  })

  it('cancelRoleEdit on a new edit removes the trailing blank row', async () => {
    const controller = new TeamSectionController(fakeApi())
    await controller.load()
    await controller.beginDetail('edit')
    controller.addRoleInDetail()
    controller.setRoleEditField('id', 'editor')

    const before = controller.store.getSnapshot().detail!.roles.length
    controller.cancelRoleEdit()
    const detail = controller.store.getSnapshot().detail!
    expect(detail.roleEdit).toBeNull()
    expect(detail.roles.length).toBe(before - 1)
    expect(detail.roles[detail.roles.length - 1]!.id).toBe('scout')
  })

  it('removeRole on the open-edit row also closes the edit', async () => {
    const controller = new TeamSectionController(fakeApi())
    await controller.load()
    await controller.beginDetail('edit')
    controller.beginRoleEdit(0)
    controller.setRoleEditField('subagent', 'reviewer')

    controller.removeRole(0)
    const detail = controller.store.getSnapshot().detail!
    expect(detail.roleEdit).toBeNull()
    expect(detail.roles).toHaveLength(1)
    expect(detail.roles[0]!.id).toBe('scout')
  })

  it('removeRole on a different row keeps the edit open and the index valid', async () => {
    const controller = new TeamSectionController(fakeApi())
    await controller.load()
    await controller.beginDetail('edit')
    controller.beginRoleEdit(0)
    // Remove the row that is NOT being edited.
    controller.removeRole(1)
    const detail = controller.store.getSnapshot().detail!
    expect(detail.roles).toHaveLength(1)
    expect(detail.roleEdit).not.toBeNull()
    if (detail.roleEdit === null || detail.roleEdit.kind !== 'existing') throw new Error('expected existing edit still open')
    expect(detail.roleEdit.index).toBe(0)
  })

  it('confirmDetail refuses to run while a role edit is still open', async () => {
    let updateCalls = 0
    const api = {
      teamPresets: {
        list: () => wireOk({
          teams: [{ id: 'edit', trust: 'user', metadata: {}, roles: [{ id: 'copywriter' }] }],
          authorable: true, hasDocument: true, subagents: ['writer'],
        }),
        read: () => wireOk({
          team: {
            id: 'edit', trust: 'user', metadata: {},
            roles: [{ id: 'copywriter', description: '', prompt: '', subagent: 'writer', level: 1, memory: 'one-shot' }],
          },
        }),
        update: () => { updateCalls++; return wireOk({ id: 'edit' }) },
        create: (request: { id: string }) => wireOk({ id: request.id }),
        remove: () => wireOk({}),
        openLocation: () => wireOk({ opened: true }),
      },
      llm: {} as never,
    } as unknown as Pick<IApiClient, 'llm'> & { teamPresets: TeamPresetWire }
    const controller = new TeamSectionController(api)
    await controller.load()
    await controller.beginDetail('edit')
    controller.beginRoleEdit(0)
    controller.setRoleEditField('subagent', 'reviewer')

    await controller.confirmDetail()
    expect(updateCalls).toBe(0)
    expect(controller.store.getSnapshot().detail?.roleEdit).not.toBeNull()
  })

  it('saveRoleEdit refuses to commit when the draft fails validation', async () => {
    const controller = new TeamSectionController(fakeApi())
    await controller.load()
    await controller.beginDetail('edit')
    controller.beginRoleEdit(0)
    controller.setRoleEditField('subagent', '')

    controller.saveRoleEdit()
    const detail = controller.store.getSnapshot().detail!
    // Edit stays open, roster stays untouched.
    expect(detail.roleEdit).not.toBeNull()
    expect(detail.roles[0]!.subagent).toBe('writer')
  })

  it('saves the staged roster once the role edit closes, and re-reads', async () => {
    let updatePayload: { id: string; roles: { id: string; subagent: string; memory: string }[] } | undefined
    const api = {
      teamPresets: {
        list: () => wireOk({
          teams: [{ id: 'edit', trust: 'user', metadata: {}, roles: [{ id: 'copywriter' }] }],
          authorable: true, hasDocument: true, subagents: ['writer', 'reviewer'],
        }),
        read: () => wireOk({
          team: {
            id: 'edit', trust: 'user', metadata: {},
            roles: [{ id: 'copywriter', description: '', prompt: '', subagent: 'writer', level: 1, memory: 'one-shot' }],
          },
        }),
        update: (request: { id: string; roles: { id: string; subagent: string; memory: string }[] }) => {
          updatePayload = request
          return wireOk({ id: request.id })
        },
        create: (request: { id: string }) => wireOk({ id: request.id }),
        remove: () => wireOk({}),
        openLocation: () => wireOk({ opened: true }),
      },
      llm: {} as never,
    } as unknown as Pick<IApiClient, 'llm'> & { teamPresets: TeamPresetWire }
    const controller = new TeamSectionController(api)
    await controller.load()
    await controller.beginDetail('edit')
    controller.beginRoleEdit(0)
    controller.setRoleEditField('subagent', 'reviewer')
    controller.saveRoleEdit()
    await controller.confirmDetail()
    expect(updatePayload?.roles).toEqual([{ id: 'copywriter', subagent: 'reviewer', level: 1, memory: 'one-shot' }])
    expect(controller.store.getSnapshot().detail).toBeNull()
  })
})

describe('toggle and delete', () => {
  it('toggles a team via an enabled-only update', async () => {
    let toggle: { id: string; metadata?: { enabled?: boolean } } | undefined
    const api = {
      teamPresets: {
        list: () => wireOk({
          teams: [{ id: 'edit', trust: 'user', metadata: { enabled: true }, roles: [] }],
          authorable: true, hasDocument: true, subagents: [],
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
  it('keeps a role draft when poking a non-role field (legacy field-id via setCreateRoleField)', async () => {
    // Sanity that the store-level patch never corrupts a role row.
    const controller = new TeamSectionController(fakeApi())
    await controller.load()
    await controller.beginDetail('edit')
    controller.beginRoleEdit(0)
    controller.setRoleEditField('id', controller.store.getSnapshot().detail!.roles[0]!.id)
    expect(controller.store.getSnapshot().detail!.roleEdit).not.toBeNull()
  })
})
