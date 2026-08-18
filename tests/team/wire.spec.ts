/**
 * The team-management wire layer: dispatch logic, payload validation, the
 * failure vocabulary, and the update semantics (enabled-only toggle vs
 * whole-rewrite) that carry the browser settings surface.
 */

import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { TeamNotWritableError } from '../../src/team/authoring.ts'
import { UnknownTeamError } from '../../src/team/types.ts'
import type { Teams } from '../../src/team/index.ts'
import type { SubagentPresets } from '../../src/preset/index.ts'
import {
  dispatchTeamPreset,
  registerTeamPresetWire,
  TEAM_PRESET_CHANNEL,
} from '../../src/team/wire/index.ts'

const signal = (): AbortSignal => new AbortController().signal

/** A scripted team registry whose mutation methods record their calls. */
function mockTeams(overrides: Partial<Teams> = {}): {
  teams: Teams
  setEnabled: ReturnType<typeof vi.fn>
  create: ReturnType<typeof vi.fn>
  update: ReturnType<typeof vi.fn>
  remove: ReturnType<typeof vi.fn>
} {
  const setEnabled = vi.fn(async () => {})
  const create = vi.fn(async () => {})
  const update = vi.fn(async () => {})
  const remove = vi.fn(async () => {})
  const teams = {
    authorable: true,
    list: async () => [],
    resolve: async (id: string) => ({
      id, trust: 'user' as const, path: `/teams/${id}/team.yml`, metadata: {}, roles: [],
    }),
    create,
    update,
    remove,
    setEnabled,
    ...overrides,
  } as unknown as Teams
  return { teams, setEnabled, create, update, remove }
}

/** A scripted subagent registry, for the role bodies' available ids. */
function mockSubagents(ids: string[] = []): SubagentPresets {
  return { list: async () => ids.map(id => ({ id, trust: 'user' as const, path: `/s/${id}/agent.cordis.yml`, metadata: {} })) } as unknown as SubagentPresets
}

describe('team-preset wire dispatch', () => {
  it('lists an empty roster when the deployment composes no teams', async () => {
    const result = await dispatchTeamPreset(undefined, undefined, 'list', {}, signal())
    expect(result).toEqual({
      ok: true,
      value: { teams: [], authorable: false, hasDocument: expect.any(Boolean), bodies: [] },
    })
  })

  it('lists the roster rows and forwards authorable and the bodies', async () => {
    const { teams } = mockTeams({
      authorable: false,
      list: async () => [{
        id: 'edit', trust: 'system' as const, path: '/x/team.yml',
        metadata: { enabled: true }, roles: [{ id: 'copywriter' }, { id: 'editor', broken: 'x' }],
      }],
    })
    const result = await dispatchTeamPreset(teams, mockSubagents(['writer', 'reviewer']), 'list', {}, signal())
    expect(result).toEqual({
      ok: true,
      value: {
        teams: [{
          id: 'edit', trust: 'system', metadata: { enabled: true },
          roles: [{ id: 'copywriter' }, { id: 'editor', broken: 'x' }],
        }],
        authorable: false,
        hasDocument: expect.any(Boolean),
        bodies: ['writer', 'reviewer'],
      },
    })
  })

  it('reads one team with its full role definitions', async () => {
    const { teams } = mockTeams({
      resolve: async (id: string) => ({
        id, trust: 'user' as const, path: `/t/${id}/team.yml`,
        metadata: { name: 'Edit' }, roles: [{
          id: 'copywriter', description: 'Writes copy', prompt: 'You are a copywriter.', body: 'writer', memory: 'persistent' as const,
        }],
      }),
    })
    const result = await dispatchTeamPreset(teams, undefined, 'read', { id: 'edit' }, signal())
    expect(result).toEqual({
      ok: true,
      value: {
        team: {
          id: 'edit', trust: 'user', metadata: { name: 'Edit' },
          roles: [{
            id: 'copywriter', description: 'Writes copy', prompt: 'You are a copywriter.', body: 'writer', memory: 'persistent',
          }],
        },
      },
    })
  })

  it('maps an unknown team to the not-found code', async () => {
    const { teams } = mockTeams({
      resolve: async () => { throw new UnknownTeamError('nope', []) },
    })
    const result = await dispatchTeamPreset(teams, undefined, 'read', { id: 'nope' }, signal())
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('team-preset-not-found')
  })

  it('creates a team from its initial roster', async () => {
    const { teams, create } = mockTeams()
    const result = await dispatchTeamPreset(
      teams, undefined, 'create',
      {
        id: 'edit',
        name: 'Edit team',
        roles: [{ id: 'copywriter', body: 'writer', memory: 'one-shot' }],
      },
      signal(),
    )
    expect(result).toEqual({ ok: true, value: { id: 'edit' } })
    expect(create).toHaveBeenCalledExactlyOnceWith(
      'edit',
      { name: 'Edit team' },
      [{ id: 'copywriter', body: 'writer', memory: 'one-shot' }],
    )
  })

  it('removes a locally authored team', async () => {
    const { teams, remove } = mockTeams()
    const result = await dispatchTeamPreset(teams, undefined, 'remove', { id: 'edit' }, signal())
    expect(result).toEqual({ ok: true, value: {} })
    expect(remove).toHaveBeenCalledExactlyOnceWith('edit')
  })

  it('rejects opening a shipped team directory as read-only', async () => {
    const { teams } = mockTeams({
      resolve: async (id: string) => ({ id, trust: 'system' as const, path: `/sys/${id}/team.yml`, metadata: {}, roles: [] }),
    })
    const result = await dispatchTeamPreset(teams, undefined, 'openLocation', { id: 'shipped' }, signal())
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('team-preset-read-only')
  })

  it('rejects a malformed payload as bad-request', async () => {
    const { teams } = mockTeams()
    const result = await dispatchTeamPreset(teams, undefined, 'read', { id: '' }, signal())
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('bad-request')
  })

  it('rejects an endpoint the channel does not serve', async () => {
    const { teams } = mockTeams()
    const result = await dispatchTeamPreset(teams, undefined, 'nope', {}, signal())
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('bad-request')
  })
})

describe('team-preset update semantics', () => {
  it('routes an enabled-only metadata write to setEnabled (the row-level toggle)', async () => {
    const { teams, setEnabled } = mockTeams()
    const result = await dispatchTeamPreset(
      teams, undefined, 'update', { id: 'edit', metadata: { enabled: false } }, signal())
    expect(result).toEqual({ ok: true, value: { id: 'edit' } })
    expect(setEnabled).toHaveBeenCalledExactlyOnceWith('edit', false)
    expect(teams.update).not.toHaveBeenCalled()
  })

  it('rewrites roles and metadata on a whole update', async () => {
    const { teams, update } = mockTeams({
      resolve: async (id: string) => ({
        id, trust: 'user' as const, path: `/t/${id}/team.yml`,
        metadata: { name: 'Old' }, roles: [],
      }),
    })
    const result = await dispatchTeamPreset(
      teams, undefined, 'update',
      {
        id: 'edit',
        metadata: { name: 'New', enabled: true },
        roles: [{ id: 'copywriter', body: 'writer', memory: 'persistent', description: 'Writes' }],
      },
      signal(),
    )
    expect(result).toEqual({ ok: true, value: { id: 'edit' } })
    expect(update).toHaveBeenCalledExactlyOnceWith(
      'edit',
      { name: 'New', enabled: true },
      [{ id: 'copywriter', description: 'Writes', body: 'writer', memory: 'persistent' }],
    )
  })

  it('keeps the untouched side on a partial update', async () => {
    const { teams, update } = mockTeams({
      resolve: async (id: string) => ({
        id, trust: 'user' as const, path: `/t/${id}/team.yml`,
        metadata: { name: 'Keep', enabled: true }, roles: [{ id: 'old', body: 'writer', memory: 'one-shot' }],
      }),
    })
    // A roles-only write preserves the stored metadata.
    await dispatchTeamPreset(
      teams, undefined, 'update',
      { id: 'edit', roles: [{ id: 'copywriter', body: 'writer', memory: 'one-shot' }] },
      signal(),
    )
    expect(update).toHaveBeenCalledExactlyOnceWith(
      'edit',
      { name: 'Keep', enabled: true },
      [{ id: 'copywriter', body: 'writer', memory: 'one-shot' }],
    )
  })

  it('maps a read-only update refusal onto the read-only code', async () => {
    const { teams } = mockTeams({
      resolve: async (id: string) => ({ id, trust: 'system' as const, path: `/sys/${id}/team.yml`, metadata: {}, roles: [] }),
      update: async () => { throw new TeamNotWritableError('shipped', 'it ships with the deployment') },
    })
    const result = await dispatchTeamPreset(
      teams, undefined, 'update',
      { id: 'shipped', roles: [{ id: 'r', body: 'writer', memory: 'one-shot' }] },
      signal(),
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('team-preset-read-only')
  })
})

describe('team-preset wire registration', () => {
  it('registers the dedicated loopback channel via ctx.inject once connection is available', async () => {
    const root = new Context()
    const registered: { channel: string; authority: string }[] = []
    const handle = vi.fn((channel: string, _handler: unknown, options: { authority: string }) => {
      registered.push({ channel, authority: options.authority })
      return () => Promise.resolve()
    })
    root.provide('connection', { rpc: { handle } })
    registerTeamPresetWire(root)
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(handle).toHaveBeenCalledTimes(1)
    expect(registered[0]!.channel).toBe(TEAM_PRESET_CHANNEL)
    expect(registered[0]!.authority).toBe('loopback')
    await root.fiber.dispose()
  })
})
