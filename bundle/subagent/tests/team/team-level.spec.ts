/**
 * The team-hierarchy "level" attribute (rule 1) and the config-hygiene warning
 * (rule 7): level is a PROGRAM property parsed from `team.yml` (default 1,
 * invalid values rejected), and a one-shot role at level >= 2 triggers a
 * warning that is both logged and surfaced on the team detail wire.
 */

import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { parseTeam } from '../../src/team/metadata.ts'
import { ROLE_LEVEL_DEFAULT } from '../../src/team/types.ts'
import { Teams } from '../../src/team/index.ts'

/** Parse one team.yml string with a dummy path. */
function parse(content: string) {
  return parseTeam('demo', 'user', '/teams/demo/team.yml', content)
}

/** A minimal valid role row helper. */
function roleRow(id: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { id, subagent: 'worker', ...extra }
}

/** A team.yml with exactly one role whose extra fields are given. */
function oneRole(extra: Record<string, unknown> = {}): string {
  return `metadata:\n  name: Demo\nroles:\n  - ${JSON.stringify(roleRow('lead', extra))}\n`
}

describe('team role level parsing', () => {
  it('defaults an absent level to 1', () => {
    const team = parse(oneRole())
    expect(team.broken).toBeUndefined()
    expect(team.roles[0]!.level).toBe(ROLE_LEVEL_DEFAULT)
    expect(team.roles[0]!.level).toBe(1)
  })

  it('accepts an explicit valid level', () => {
    const team = parse(oneRole({ level: 3 }))
    expect(team.broken).toBeUndefined()
    expect(team.roles[0]!.level).toBe(3)
    expect(team.roles[0]!.broken).toBeUndefined()
  })

  it('rejects an invalid level by marking the role broken', () => {
    // A role with a bad level stays listed (broken) while the rest of the
    // roster stays usable — per-role broken semantics, not whole-team.
    const badValues = [0, -1, 1.5, '2', 'x', null, [], {}]
    for (const bad of badValues) {
      const team = parse(oneRole({ level: bad }))
      expect(team.broken).toBeUndefined()
      expect(team.roles[0]!.level).toBe(1)
      expect(team.roles[0]!.broken).toContain('level')
    }
  })

  it('keeps a sibling role usable when one role has a bad level', () => {
    const content = `metadata:\n  name: Demo\nroles:\n  - ${JSON.stringify(roleRow('lead', { level: 0 }))}\n  - ${JSON.stringify(roleRow('scout', { level: 1 }))}\n`
    const team = parse(content)
    expect(team.broken).toBeUndefined()
    const lead = team.roles.find(r => r.id === 'lead')!
    const scout = team.roles.find(r => r.id === 'scout')!
    expect(lead.broken).toContain('level')
    expect(scout.broken).toBeUndefined()
    expect(scout.level).toBe(1)
  })

  it('round-trips an explicit level through a re-parse (render emits level > 1)', async () => {
    const { renderTeam } = await import('../../src/team/authoring.ts')
    const team = parse(oneRole({ level: 2 }))
    const text = renderTeam(team.metadata, team.roles)
    const reparsed = parse(text)
    expect(reparsed.roles[0]!.level).toBe(2)
  })
})

describe('team config-hygiene warning (rule 7)', () => {
  it('warns when a one-shot role is at level >= 2', async () => {
    const team = parse(oneRole({ level: 2, memory: 'one-shot' }))
    const ctx = new Context()
    const warnings: string[] = []
    ctx.logger = { warn: (message: string) => warnings.push(message) } as typeof ctx.logger
    const svc = new Teams(ctx, { roots: [], includeUserRoot: false })
    // Resolve the team through the service's own hygiene path.
    const warning = (svc as unknown as { hygieneWarning: (t: typeof team) => string | undefined }).hygieneWarning(team)
    expect(warning).toBeDefined()
    expect(warning).toContain('lead')
    expect(warning).toContain('level >= 2')
  })

  it('stays clean for a persistent level-2 role', async () => {
    const team = parse(oneRole({ level: 2, memory: 'persistent' }))
    const ctx = new Context()
    const svc = new Teams(ctx, { roots: [], includeUserRoot: false })
    const warning = (svc as unknown as { hygieneWarning: (t: typeof team) => string | undefined }).hygieneWarning(team)
    expect(warning).toBeUndefined()
  })

  it('stays clean for a one-shot level-1 role (delegable only, no warning)', async () => {
    const team = parse(oneRole({ level: 1, memory: 'one-shot' }))
    const ctx = new Context()
    const svc = new Teams(ctx, { roots: [], includeUserRoot: false })
    const warning = (svc as unknown as { hygieneWarning: (t: typeof team) => string | undefined }).hygieneWarning(team)
    expect(warning).toBeUndefined()
  })
})
