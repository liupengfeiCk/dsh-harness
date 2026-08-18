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
 * reason by discovery; a malformed role's body reference makes THAT role broken
 * while the rest of the roster stays usable.
 * @module dsh-harness-subagent-bundle/team/metadata
 */
import type { Team, TeamTrust } from './types.ts';
/** The file that makes a directory a team. */
export declare const TEAM_FILE = "team.yml";
/** Display metadata a team may publish about itself. */
export interface TeamMetadata {
    /** Display name of the team (defaults to the id when absent). */
    readonly name?: string;
    /** One sentence on what this team is for. */
    readonly description?: string;
    /** Whether the team is enabled for delegation. */
    readonly enabled?: boolean;
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
export declare function parseTeam(id: string, trust: TeamTrust, path: string, content: string): Team;
/**
 * Read and parse one team directory's `team.yml`.
 * @param directory - the team directory.
 * @param id - the team id (the directory name).
 * @param trust - the trust recorded from the root this team was found under.
 * @returns the parsed team, or a team carrying a whole-team `broken` reason
 *   when the file is missing or unreadable.
 */
export declare function readTeam(id: string, trust: TeamTrust, directory: string): Promise<Team>;
//# sourceMappingURL=metadata.d.ts.map