/**
 * Team registry: discovery, per-role broken semantics (a role whose bound
 * subagent is missing/broken/disabled is broken while the team's other roles
 * stay usable), multi-team coexistence, and unknown/disabled resolution.
 */

import { describe, expect, it } from 'vitest'
import { mkdir as mkdirPromise, mkdtemp as mkdtempPromise, writeFile as writeFilePromise } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import SubagentPresets from '../../src/preset/index.ts'
import Teams from '../../src/team/index.ts'

/** Write one mountable subagent directory acting as a role subagent. */
async function writeSubagent(root: string, id: string, enabled = true): Promise<void> {
  const dir = join(root, id)
  await mkdirPromise(dir, { recursive: true })
  await writeFilePromise(join(dir, 'agent.cordis.yml'),
    "- id: persona\n  name: '@deepseek-ai/dsh-persona'\n  config:\n    text: I am a subagent.\n")
  await writeFilePromise(join(dir, 'subagent.yml'), `enabled: ${String(enabled)}\n`)
}

/** Write one team directory holding a `team.yml` with the given roles. */
async function writeTeam(root: string, id: string, roles: string, enabled = true): Promise<void> {
  const dir = join(root, id)
  await mkdirPromise(dir, { recursive: true })
  await writeFilePromise(join(dir, 'team.yml'),
    `metadata:\n  name: ${id}\n  enabled: ${String(enabled)}\nroles:\n${roles}\n`)
}

/** Mount a context with the loader, subagent registry, and team registry. */
async function makeCtx(
  subagentRoot: string,
  teamRoot: string,
): Promise<Context> {
  const ctx = new Context()
  ctx.baseUrl = pathToFileURL(subagentRoot).href + '/'
  await ctx.plugin(Loader)
  ctx.loader.builtins.include = Include
  await ctx.plugin(SubagentPresets, { roots: [{ path: subagentRoot, trust: 'system' }], includeUserRoot: false })
  await ctx.plugin(Teams, { roots: [{ path: teamRoot, trust: 'system' }], includeUserRoot: false })
  return ctx
}

/** Build a role YAML fragment for one role. */
function roleYaml(id: string, subagent: string, extra = ''): string {
  return `  - id: ${id}\n    subagent: ${subagent}\n    description: ${id} role\n${extra}`
}

describe('dsh-subagent-bundle/team discovery', () => {
  it('discovers teams and parses their roles', async () => {
    const subagentRoot = await mkdtempPromise(join(tmpdir(), 'dsh-team-subagent-'))
    const teamRoot = await mkdtempPromise(join(tmpdir(), 'dsh-team-root-'))
    await writeSubagent(subagentRoot, 'writer')
    await writeTeam(teamRoot, 'edit', roleYaml('copywriter', 'writer'))
    const ctx = await makeCtx(subagentRoot, teamRoot)
    try {
      const teams = await ctx.teams.list()
      expect(teams).toHaveLength(1)
      const edit = teams[0]!
      expect(edit.id).toBe('edit')
      expect(edit.trust).toBe('system')
      expect(edit.broken).toBeUndefined()
      expect(edit.metadata.enabled).toBe(true)
      expect(edit.roles).toHaveLength(1)
      expect(edit.roles[0]!.id).toBe('copywriter')
      expect(edit.roles[0]!.subagent).toBe('writer')
      expect(edit.roles[0]!.broken).toBeUndefined()
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('resolves a role that health-checks its bound subagent and forwards subagent/prompt', async () => {
    const subagentRoot = await mkdtempPromise(join(tmpdir(), 'dsh-team-subagent-'))
    const teamRoot = await mkdtempPromise(join(tmpdir(), 'dsh-team-root-'))
    await writeSubagent(subagentRoot, 'writer')
    await writeTeam(teamRoot, 'edit',
      roleYaml('copywriter', 'writer', '    prompt: You are a copywriter.\n    memory: persistent\n'))
    const ctx = await makeCtx(subagentRoot, teamRoot)
    try {
      const role = await ctx.teams.resolveRole('edit', 'copywriter')
      expect(role.subagent).toBe('writer')
      expect(role.prompt).toBe('You are a copywriter.')
      expect(role.memory).toBe('persistent')
      // A team with a healthy role still lists other broken roles without
      // failing the whole team.
      const team = await ctx.teams.resolve('edit')
      expect(team.broken).toBeUndefined()
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('marks a role whose bound subagent is missing as broken while the team stays usable', async () => {
    const subagentRoot = await mkdtempPromise(join(tmpdir(), 'dsh-team-subagent-'))
    const teamRoot = await mkdtempPromise(join(tmpdir(), 'dsh-team-root-'))
    await writeSubagent(subagentRoot, 'writer')
    // `ghost` binds a subagent that does not exist in the subagent roster.
    await writeTeam(teamRoot, 'edit',
      roleYaml('copywriter', 'writer') + roleYaml('ghostwriter', 'ghost'))
    const ctx = await makeCtx(subagentRoot, teamRoot)
    try {
      // The team lists both roles; the healthy one resolves, the broken one is
      // refused with a per-role reason — the team's OTHER roles stay usable.
      const team = await ctx.teams.resolve('edit')
      expect(team.broken).toBeUndefined()
      expect(team.roles.map(r => r.id).sort()).toEqual(['copywriter', 'ghostwriter'])

      const healthy = await ctx.teams.resolveRole('edit', 'copywriter')
      expect(healthy.subagent).toBe('writer')

      await expect(ctx.teams.resolveRole('edit', 'ghostwriter')).rejects.toThrow('not found')
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('refuses a role whose bound subagent is a broken subagent', async () => {
    const subagentRoot = await mkdtempPromise(join(tmpdir(), 'dsh-team-subagent-'))
    const teamRoot = await mkdtempPromise(join(tmpdir(), 'dsh-team-root-'))
    // A "broken" subagent: directory with a malformed composition.
    await mkdirPromise(join(subagentRoot, 'bad'), { recursive: true })
    await writeFilePromise(join(subagentRoot, 'bad', 'agent.cordis.yml'), 'not: [valid yaml')
    await writeFilePromise(join(subagentRoot, 'bad', 'subagent.yml'), 'enabled: true\n')
    await writeTeam(teamRoot, 'edit', roleYaml('role', 'bad'))
    const ctx = await makeCtx(subagentRoot, teamRoot)
    try {
      await expect(ctx.teams.resolveRole('edit', 'role')).rejects.toThrow('broken')
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('refuses a role whose bound subagent is disabled', async () => {
    const subagentRoot = await mkdtempPromise(join(tmpdir(), 'dsh-team-subagent-'))
    const teamRoot = await mkdtempPromise(join(tmpdir(), 'dsh-team-root-'))
    await writeSubagent(subagentRoot, 'writer', false)
    await writeTeam(teamRoot, 'edit', roleYaml('copywriter', 'writer'))
    const ctx = await makeCtx(subagentRoot, teamRoot)
    try {
      await expect(ctx.teams.resolveRole('edit', 'copywriter')).rejects.toThrow('disabled')
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('resolves multiple coexisting teams independently', async () => {
    const subagentRoot = await mkdtempPromise(join(tmpdir(), 'dsh-team-subagent-'))
    const teamRoot = await mkdtempPromise(join(tmpdir(), 'dsh-team-root-'))
    await writeSubagent(subagentRoot, 'writer')
    await writeSubagent(subagentRoot, 'reviewer')
    await writeTeam(teamRoot, 'edit', roleYaml('copywriter', 'writer'))
    await writeTeam(teamRoot, 'review', roleYaml('code-reviewer', 'reviewer'))
    const ctx = await makeCtx(subagentRoot, teamRoot)
    try {
      const teams = await ctx.teams.list()
      expect(teams.map(t => t.id).sort()).toEqual(['edit', 'review'])
      const editRole = await ctx.teams.resolveRole('edit', 'copywriter')
      const reviewRole = await ctx.teams.resolveRole('review', 'code-reviewer')
      expect(editRole.subagent).toBe('writer')
      expect(reviewRole.subagent).toBe('reviewer')
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('throws for an unknown team and an unknown role on a known team', async () => {
    const subagentRoot = await mkdtempPromise(join(tmpdir(), 'dsh-team-subagent-'))
    const teamRoot = await mkdtempPromise(join(tmpdir(), 'dsh-team-root-'))
    await writeSubagent(subagentRoot, 'writer')
    await writeTeam(teamRoot, 'edit', roleYaml('copywriter', 'writer'))
    const ctx = await makeCtx(subagentRoot, teamRoot)
    try {
      await expect(ctx.teams.resolve('nope')).rejects.toThrow('not found')
      await expect(ctx.teams.resolveRole('edit', 'nope')).rejects.toThrow('has no role')
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('marks a team with a missing team.yml as broken', async () => {
    const subagentRoot = await mkdtempPromise(join(tmpdir(), 'dsh-team-subagent-'))
    const teamRoot = await mkdtempPromise(join(tmpdir(), 'dsh-team-root-'))
    await mkdirPromise(join(teamRoot, 'ghost'), { recursive: true })
    const ctx = await makeCtx(subagentRoot, teamRoot)
    try {
      const teams = await ctx.teams.list()
      expect(teams).toHaveLength(1)
      expect(teams[0]!.id).toBe('ghost')
      expect(teams[0]!.broken).toContain('is missing')
    } finally {
      await ctx.fiber.dispose()
    }
  })
})
