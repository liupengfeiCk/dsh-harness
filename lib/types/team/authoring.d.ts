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
import { type Team, type TeamRole, type TeamRoot } from './types.ts';
/** A team id that cannot be used as a directory name under a root. */
export declare class InvalidTeamIdError extends Error {
    /** The rejected id. */
    readonly teamId: string;
    constructor(
    /** The rejected id. */
    teamId: string);
}
/** A create target that is already occupied — a create never overwrites. */
export declare class TeamExistsError extends Error {
    /** The id that is already taken. */
    readonly teamId: string;
    constructor(
    /** The id that is already taken. */
    teamId: string);
}
/** Authoring was attempted where the deployment allows none. */
export declare class TeamNotWritableError extends Error {
    /** What the caller tried to change, for the diagnostic. */
    readonly teamId: string;
    constructor(
    /** What the caller tried to change, for the diagnostic. */
    teamId: string, reason: string);
}
/** A role the caller staged with no usable body reference. */
export declare class TeamRoleInvalidError extends Error {
    /** The team id the role belongs to. */
    readonly teamId: string;
    /** The role id that is unusable. */
    readonly roleId: string;
    constructor(
    /** The team id the role belongs to. */
    teamId: string, 
    /** The role id that is unusable. */
    roleId: string, reason: string);
}
/**
 * The root locally authored teams are written to.
 * @param roots - the configured roots in precedence order.
 * @returns the absolute path of the first `user` root.
 * @throws when the deployment configured no writable root.
 */
export declare function writableRoot(roots: readonly TeamRoot[]): string;
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
export declare function renderTeam(metadata: {
    readonly name?: string;
    readonly description?: string;
    readonly enabled?: boolean;
}, roles: readonly TeamRole[]): string;
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
export declare function createTeam(roots: readonly TeamRoot[], id: string, metadata: {
    readonly name?: string;
    readonly description?: string;
    readonly enabled?: boolean;
}, roles: readonly TeamRole[]): Promise<string>;
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
export declare function updateTeam(roots: readonly TeamRoot[], team: Team, metadata: {
    readonly name?: string;
    readonly description?: string;
    readonly enabled?: boolean;
}, roles: readonly TeamRole[]): Promise<void>;
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
export declare function deleteTeam(roots: readonly TeamRoot[], team: Team): Promise<void>;
/**
 * Flip one locally authored team's enabled switch, leaving its roster and
 * other metadata fields alone.
 * @param roots - the configured roots.
 * @param team - the resolved team to edit.
 * @param enabled - the new enabled state.
 * @throws when the team ships with the deployment or lies outside the writable
 * root.
 */
export declare function setTeamEnabled(roots: readonly TeamRoot[], team: Team, enabled: boolean): Promise<void>;
//# sourceMappingURL=authoring.d.ts.map