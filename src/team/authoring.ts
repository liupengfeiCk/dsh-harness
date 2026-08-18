/**
 * Reading, creating, editing, deleting, and toggling locally authored teams.
 *
 * Authoring is confined to a `user` root: the shipped `config/teams/` set is
 * part of the deployment, and letting a browser rewrite it would turn "reset
 * to a known team" into something the same caller could have broken first.
 *
 * A team is one directory holding a `team.yml` carrying the team's display
 * metadata and its role roster. Creation writes a fresh `team.yml` from the
 * caller's initial roles; updates rewrite the whole `team.yml` (metadata and
 * roles in one structured write); the enabled toggle is a metadata-only write
 * that leaves the roster alone.
 * @module dsh-harness-subagent-bundle/team/authoring
 */

import { mkdir, readFile, rm } from 'node:fs/promises'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'
import yaml from 'js-yaml'
import { expandHomePath } from '../home-path.ts'
import { readTeam } from './metadata.ts'
import { TEAM_ID, type Team, type TeamRole, type TeamRoot } from './types.ts'

/** A team id that cannot be used as a directory name under a root. */
export class InvalidTeamIdError extends Error {
  constructor(
    /** The rejected id. */
    readonly teamId: string,
  ) {
    super(
      `team-presets: team id ${JSON.stringify(teamId)} must match ${String(TEAM_ID)} — `
      + 'the id is a directory name, so anything else could escape the team root',
    )
  }
}

/** A create target that is already occupied — a create never overwrites. */
export class TeamExistsError extends Error {
  constructor(
    /** The id that is already taken. */
    readonly teamId: string,
  ) {
    super(
      `team-presets: team "${teamId}" already exists — `
      + 'a create never overwrites; delete the existing team first or choose another id',
    )
  }
}

/** Authoring was attempted where the deployment allows none. */
export class TeamNotWritableError extends Error {
  constructor(
    /** What the caller tried to change, for the diagnostic. */
    readonly teamId: string,
    reason: string,
  ) {
    super(`team-presets: team "${teamId}" cannot be written: ${reason}`)
  }
}

/** A role the caller staged with no usable body reference. */
export class TeamRoleInvalidError extends Error {
  constructor(
    /** The team id the role belongs to. */
    readonly teamId: string,
    /** The role id that is unusable. */
    readonly roleId: string,
    reason: string,
  ) {
    super(`team-presets: team "${teamId}" role "${roleId}" cannot be written: ${reason}`)
  }
}

/**
 * The root locally authored teams are written to.
 * @param roots - the configured roots in precedence order.
 * @returns the absolute path of the first `user` root.
 * @throws when the deployment configured no writable root.
 */
export function writableRoot(roots: readonly TeamRoot[]): string {
  const root = roots.find(candidate => candidate.trust === 'user')
  if (root === undefined) {
    throw new TeamNotWritableError('', 'this deployment configures no user-writable team root')
  }
  return resolve(expandHomePath(root.path))
}

/**
 * Render a team's display metadata and role roster back into `team.yml` text.
 *
 * Absent fields are omitted rather than emitted as null/empty, so the stored
 * file stays minimal and reads cleanly (mirroring how `parseTeam` reads an
 * absent field as undefined). The role roster is emitted as a YAML list under
 * `roles`; each role's absent description/prompt are omitted.
 * @param metadata - the team's display metadata (name/description/enabled).
 * @param roles - the role roster to store.
 * @returns the `team.yml` contents.
 */
export function renderTeam(
  metadata: { readonly name?: string; readonly description?: string; readonly enabled?: boolean },
  roles: readonly TeamRole[],
): string {
  const cleanMetadata: Record<string, unknown> = {}
  if (metadata.name !== undefined) cleanMetadata.name = metadata.name
  if (metadata.description !== undefined) cleanMetadata.description = metadata.description
  if (metadata.enabled !== undefined) cleanMetadata.enabled = metadata.enabled
  const cleanRoles = roles.map(role => {
    const row: Record<string, unknown> = { id: role.id, body: role.body }
    if (role.description !== undefined) row.description = role.description
    if (role.prompt !== undefined) row.prompt = role.prompt
    row.memory = role.memory
    return row
  })
  const document: Record<string, unknown> = {}
  if (Object.keys(cleanMetadata).length > 0) document.metadata = cleanMetadata
  if (cleanRoles.length > 0) document.roles = cleanRoles
  return yaml.dump(document, { lineWidth: -1, noRefs: true })
}

/** Whether anything occupies the path (a create's own backstop). */
async function occupied(path: string): Promise<boolean> {
  let present = true
  try {
    await readFile(path, 'utf8')
  } catch {
    present = false
  }
  return present
}

/**
 * Create a locally authored team from an initial role roster.
 *
 * The new team directory is created under the first `user` root and its
 * `team.yml` written atomically with the caller's metadata and roles. The id
 * becomes the directory name, so it is validated as a containment boundary
 * before anything touches disk.
 * @param roots - the configured roots; the first `user` one receives the team.
 * @param id - the new team's id, which becomes its directory name.
 * @param metadata - the team's display metadata (absent fields stay absent).
 * @param roles - the initial role roster.
 * @returns the absolute path of the new team directory.
 * @throws when the id is unusable or already occupied, a role is unusable, or
 * the deployment configures no writable root.
 */
export async function createTeam(
  roots: readonly TeamRoot[],
  id: string,
  metadata: { readonly name?: string; readonly description?: string; readonly enabled?: boolean },
  roles: readonly TeamRole[],
): Promise<string> {
  if (!TEAM_ID.test(id)) throw new InvalidTeamIdError(id)
  for (const role of roles) {
    if (role.body === '') {
      throw new TeamRoleInvalidError(id, role.id, 'a role must bind a "body" (a subagent id)')
    }
  }
  const dir = join(writableRoot(roots), id)
  const file = join(dir, 'team.yml')
  if (await occupied(file)) throw new TeamExistsError(id)
  try {
    await mkdir(dir, { recursive: true })
    await writeFileAtomic(file, renderTeam(metadata, roles), { mode: 0o600, dirMode: 0o700 })
  } catch (error) {
    await rm(dir, { recursive: true, force: true })
    throw error
  }
  return dir
}

/**
 * Rewrite one locally authored team's `team.yml` as a WHOLE.
 *
 * The caller passes the complete intended team: metadata and roles. A shipped
 * team is refused, exactly like delete — its install is not the user's to
 * manage. The team's file is confined to the writable root by a path-prefix
 * check on top of trust, so an id that collides with a path outside the root
 * can never be rewritten.
 * @param roots - the configured roots.
 * @param team - the resolved team to edit.
 * @param metadata - the complete display metadata to store.
 * @param roles - the complete role roster to store.
 * @throws when the team ships with the deployment or lies outside the writable
 * root, or a role is unusable.
 */
export async function updateTeam(
  roots: readonly TeamRoot[],
  team: Team,
  metadata: { readonly name?: string; readonly description?: string; readonly enabled?: boolean },
  roles: readonly TeamRole[],
): Promise<void> {
  if (team.trust !== 'user') {
    throw new TeamNotWritableError(team.id, 'it ships with the deployment')
  }
  const dir = join(writableRoot(roots), team.id)
  if (!isAbsolute(team.path) || !team.path.startsWith(dir)) {
    throw new TeamNotWritableError(team.id, 'it does not live under the writable team root')
  }
  for (const role of roles) {
    if (role.body === '') {
      throw new TeamRoleInvalidError(team.id, role.id, 'a role must bind a "body" (a subagent id)')
    }
  }
  await writeFileAtomic(team.path, renderTeam(metadata, roles), { mode: 0o600, dirMode: 0o700 })
}

/**
 * Delete a locally authored team.
 *
 * A shipped team is refused: it belongs to the deployment. A team whose roles
 * a live child already mounted is NOT refused — the role's body and soul were
 * read at child creation and a persistent child re-resolves from the latest
 * definition at resume, which after deletion simply fails that resume.
 * @param roots - the configured roots.
 * @param team - the resolved team to remove.
 * @throws when the team ships with the deployment or lies outside the writable
 * root.
 */
export async function deleteTeam(
  roots: readonly TeamRoot[],
  team: Team,
): Promise<void> {
  if (team.trust !== 'user') {
    throw new TeamNotWritableError(team.id, 'it ships with the deployment')
  }
  const dir = join(writableRoot(roots), team.id)
  if (!isAbsolute(team.path) || !team.path.startsWith(dir)) {
    throw new TeamNotWritableError(team.id, 'it does not live under the writable team root')
  }
  await rm(dir, { recursive: true, force: true })
}

/**
 * Flip one locally authored team's enabled switch, leaving its roster and
 * other metadata fields alone.
 * @param roots - the configured roots.
 * @param team - the resolved team to edit.
 * @param enabled - the new enabled state.
 * @throws when the team ships with the deployment or lies outside the writable
 * root.
 */
export async function setTeamEnabled(
  roots: readonly TeamRoot[],
  team: Team,
  enabled: boolean,
): Promise<void> {
  if (team.trust !== 'user') {
    throw new TeamNotWritableError(team.id, 'it ships with the deployment')
  }
  const dir = join(writableRoot(roots), team.id)
  if (!isAbsolute(team.path) || !team.path.startsWith(dir)) {
    throw new TeamNotWritableError(team.id, 'it does not live under the writable team root')
  }
  const current = await readTeam(team.id, team.trust, dirname(team.path))
  await writeFileAtomic(
    team.path,
    renderTeam({ ...current.metadata, enabled }, current.roles),
    { mode: 0o600, dirMode: 0o700 },
  )
}
