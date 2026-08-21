/**
 * Parse a team's stored `team.yml`.
 *
 * A team is one YAML file carrying the team's display metadata plus its role
 * roster. Unlike a subagent (which stores metadata beside its composition in a
 * separate `subagent.yml`), a team's metadata and roles live in the SAME file,
 * because a team has no separate plugin tree to keep the metadata away from —
 * the roles' capability surfaces come from the subagents they name, not from
 * the team file itself.
 *
 * Every read failure that makes the team unusable is surfaced as a `broken`
 * reason by discovery; a malformed role's subagent reference makes THAT role
 * broken while the rest of the roster stays usable.
 * @module dsh-harness-subagent-bundle/team/metadata
 */

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import yaml from 'js-yaml'
import { ROLE_LEVEL_DEFAULT, type Team, type TeamRole, type TeamRoleMemory, type TeamTrust } from './types.ts'

/** The file that makes a directory a team. */
export const TEAM_FILE = 'team.yml'

/** A non-empty trimmed string, or undefined for anything else. */
function text(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed === '' ? undefined : trimmed
}

/** A literal boolean, or undefined for anything else. */
function flag(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}

/** Parse a role's memory policy, defaulting to `one-shot`. */
function memory(value: unknown): TeamRoleMemory {
  return value === 'persistent' ? 'persistent' : 'one-shot'
}

/**
 * Parse a role's hierarchy level, defaulting to {@link ROLE_LEVEL_DEFAULT}.
 * @param value - the raw `level` field.
 * @returns `{ level }` on a valid positive integer, or
 *   `{ broken }` when the field is present but unusable (the role stays listed
 *   as broken — a team's other roles remain usable).
 */
function roleLevel(value: unknown): { level?: number; broken?: string } {
  if (value === undefined) return { level: ROLE_LEVEL_DEFAULT }
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    return { broken: 'the role "level" must be a positive integer (1 or higher)' }
  }
  return { level: value }
}

/** Display metadata a team may publish about itself. */
export interface TeamMetadata {
  /** Display name of the team (defaults to the id when absent). */
  readonly name?: string
  /** One sentence on what this team is for. */
  readonly description?: string
  /** Whether the team is enabled for delegation. */
  readonly enabled?: boolean
}

/**
 * Parse a team file's contents into its team shape. Malformed shape is
 * surfaced as a whole-team `broken` reason; a role whose own fields are
 * unusable is surfaced as a per-role `broken` reason (the team still lists).
 * @param id - the team id (the directory name).
 * @param trust - the trust recorded from the root this team was found under.
 * @param path - the absolute path of the `team.yml` file.
 * @param content - the file's raw text.
 * @returns the parsed team, or a team carrying a whole-team `broken` reason.
 */
export function parseTeam(id: string, trust: TeamTrust, path: string, content: string): Team {
  let parsed: unknown
  try {
    parsed = yaml.load(content)
  } catch {
    return { id, trust, path, metadata: {}, roles: [], broken: 'the team file is not valid YAML' }
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { id, trust, path, metadata: {}, roles: [], broken: 'the team file must be a YAML map' }
  }
  const record = parsed as Record<string, unknown>

  // Whole-team metadata; absent fields read as empty (the id stands in as the name).
  const rawMetadata = (typeof record.metadata === 'object' && record.metadata !== null && !Array.isArray(record.metadata))
    ? record.metadata as Record<string, unknown>
    : {}
  const metadataName = text(rawMetadata.name)
  const metadataDescription = text(rawMetadata.description)
  const metadataEnabled = flag(rawMetadata.enabled)
  const metadata: TeamMetadata = {
    ...metadataName !== undefined ? { name: metadataName } : {},
    ...metadataDescription !== undefined ? { description: metadataDescription } : {},
    ...metadataEnabled !== undefined ? { enabled: metadataEnabled } : {},
  }

  // The role roster: `roles` must be a list of maps, each with a `subagent`.
  const rawRoles = record.roles
  if (!Array.isArray(rawRoles)) {
    return { id, trust, path, metadata, roles: [], broken: 'the team file must carry a "roles" list' }
  }
  const roles: TeamRole[] = []
  const seen = new Set<string>()
  for (const [index, raw] of rawRoles.entries()) {
    const label = `roles[${index}]`
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      return { id, trust, path, metadata, roles: [], broken: `${label} is not a role map` }
    }
    const role = raw as Record<string, unknown>
    const roleId = text(role.id)
    if (roleId === undefined) {
      return { id, trust, path, metadata, roles: [], broken: `${label} names no role (an "id" string is required)` }
    }
    if (seen.has(roleId)) {
      return { id, trust, path, metadata, roles: [], broken: `${label} repeats role id "${roleId}"` }
    }
    seen.add(roleId)
    // The subagent is the hard capability constraint: a role without one cannot
    // delegate. It is the one field whose absence makes the role broken rather
    // than merely un-described.
    const subagent = text(role.subagent)
    const description = text(role.description)
    const prompt = text(role.prompt)
    const parsedLevel = roleLevel(role.level)
    roles.push({
      id: roleId,
      ...description !== undefined ? { description } : {},
      ...prompt !== undefined ? { prompt } : {},
      ...subagent === undefined
        ? { subagent: '', broken: 'the role binds no "subagent" (a subagent id is required)' }
        : { subagent },
      // An absent level defaults to 1; an invalid level breaks the role while
      // the team's other roles stay usable.
      level: parsedLevel.level ?? ROLE_LEVEL_DEFAULT,
      memory: memory(role.memory),
      // T12: a role inherits the main conversation's summary by default.
      // `false` opts the child into non-inheritance mode (it manages its own
      // memory under the unified model). Orthogonal to `memory`.
      inheritMainSummaries: role.inheritMainSummaries !== false,
      ...parsedLevel.broken !== undefined
        ? { broken: parsedLevel.broken }
        : {},
    })
  }
  return { id, trust, path, metadata, roles }
}

/**
 * Read and parse one team directory's `team.yml`.
 * @param directory - the team directory.
 * @param id - the team id (the directory name).
 * @param trust - the trust recorded from the root this team was found under.
 * @returns the parsed team, or a team carrying a whole-team `broken` reason
 *   when the file is missing or unreadable.
 */
export async function readTeam(id: string, trust: TeamTrust, directory: string): Promise<Team> {
  const path = join(directory, TEAM_FILE)
  let content: string
  try {
    content = await readFile(path, 'utf8')
  } catch {
    return {
      id, trust, path,
      metadata: {}, roles: [],
      broken: `the team file ${TEAM_FILE} is missing — the directory still occupies the id; delete it or restore the file`,
    }
  }
  return parseTeam(id, trust, path, content)
}
