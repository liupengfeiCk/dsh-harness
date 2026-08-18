/**
 * Team authoring: create/update/remove/toggle over locally authored teams,
 * confined to the `user` root, with system trust and path containment refused.
 */

import { describe, expect, it } from 'vitest'
import { mkdtemp as mkdtempPromise, readFile as readFilePromise } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import Teams, {
  InvalidTeamIdError, TeamExistsError, TeamNotWritableError, TeamRoleInvalidError,
  type TeamRole,
} from '../../src/team/index.ts'

/** One minimal usable role. */
function role(id: string, body = 'writer'): TeamRole {
  return { id, body, memory: 'one-shot' }
}

/** Mount a team registry over one writable temp root. */
async function makeCtx(root: string): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(Teams, { roots: [{ path: root, trust: 'user' }], includeUserRoot: false })
  return ctx
}

describe('dsh-subagent-bundle/team authoring', () => {
  it('creates a team and its team.yml from an initial roster', async () => {
    const root = await mkdtempPromise(join(tmpdir(), 'dsh-team-auth-'))
    const ctx = await makeCtx(root)
    try {
      await ctx.teams.create('edit', { name: 'Edit' }, [role('copywriter'), role('editor')])
      const teams = await ctx.teams.list()
      expect(teams).toHaveLength(1)
      const team = teams[0]!
      expect(team.id).toBe('edit')
      expect(team.trust).toBe('user')
      expect(team.metadata.name).toBe('Edit')
      expect(team.roles.map(r => r.id).sort()).toEqual(['copywriter', 'editor'])
      const file = await readFilePromise(join(root, 'edit', 'team.yml'), 'utf8')
      expect(file).toContain('name: Edit')
      expect(file).toContain('id: copywriter')
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('refuses an id that is not a valid directory name', async () => {
    const root = await mkdtempPromise(join(tmpdir(), 'dsh-team-auth-'))
    const ctx = await makeCtx(root)
    try {
      await expect(ctx.teams.create('../escape', {}, [role('r')])).rejects.toThrow(InvalidTeamIdError)
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('refuses a create whose id is already taken', async () => {
    const root = await mkdtempPromise(join(tmpdir(), 'dsh-team-auth-'))
    const ctx = await makeCtx(root)
    try {
      await ctx.teams.create('edit', {}, [role('copywriter')])
      await expect(ctx.teams.create('edit', {}, [role('other')])).rejects.toThrow(TeamExistsError)
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('refuses a role with no bound body', async () => {
    const root = await mkdtempPromise(join(tmpdir(), 'dsh-team-auth-'))
    const ctx = await makeCtx(root)
    try {
      await expect(ctx.teams.create('edit', {}, [role('r', '')])).rejects.toThrow(TeamRoleInvalidError)
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('updates a team whole, rewriting its metadata and roles', async () => {
    const root = await mkdtempPromise(join(tmpdir(), 'dsh-team-auth-'))
    const ctx = await makeCtx(root)
    try {
      await ctx.teams.create('edit', { name: 'Old' }, [role('copywriter')])
      await ctx.teams.update('edit', { name: 'New', enabled: true }, [role('editor', 'reviewer')])
      const team = await ctx.teams.resolve('edit')
      expect(team.metadata.name).toBe('New')
      expect(team.metadata.enabled).toBe(true)
      expect(team.roles.map(r => r.id)).toEqual(['editor'])
      expect(team.roles[0]!.body).toBe('reviewer')
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('toggles one team enabled without touching its roster', async () => {
    const root = await mkdtempPromise(join(tmpdir(), 'dsh-team-auth-'))
    const ctx = await makeCtx(root)
    try {
      await ctx.teams.create('edit', {}, [role('copywriter')])
      await ctx.teams.setEnabled('edit', false)
      const team = await ctx.teams.resolve('edit')
      expect(team.metadata.enabled).toBe(false)
      expect(team.roles).toHaveLength(1)
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('deletes a locally authored team', async () => {
    const root = await mkdtempPromise(join(tmpdir(), 'dsh-team-auth-'))
    const ctx = await makeCtx(root)
    try {
      await ctx.teams.create('edit', {}, [role('copywriter')])
      await ctx.teams.remove('edit')
      expect(await ctx.teams.list()).toHaveLength(0)
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('refuses to update or delete a shipped team', async () => {
    const userRoot = await mkdtempPromise(join(tmpdir(), 'dsh-team-auth-user-'))
    const systemRoot = await mkdtempPromise(join(tmpdir(), 'dsh-team-auth-sys-'))
    const ctx = new Context()
    await ctx.plugin(Teams, {
      roots: [
        { path: systemRoot, trust: 'system' },
        { path: userRoot, trust: 'user' },
      ],
      includeUserRoot: false,
    })
    try {
      // Seed a shipped team with an id that also does NOT collide with a user one.
      await import('node:fs/promises').then(fs => fs.mkdir(join(systemRoot, 'shipped'), { recursive: true }))
      await import('node:fs/promises').then(fs =>
        fs.writeFile(join(systemRoot, 'shipped', 'team.yml'), 'metadata:\n  name: Shipped\nroles:\n  - id: r\n    body: writer\n    memory: one-shot\n'))
      await expect(ctx.teams.update('shipped', {}, [role('r')])).rejects.toThrow(TeamNotWritableError)
      await expect(ctx.teams.remove('shipped')).rejects.toThrow(TeamNotWritableError)
      await expect(ctx.teams.setEnabled('shipped', false)).rejects.toThrow(TeamNotWritableError)
    } finally {
      await ctx.fiber.dispose()
    }
  })
})
