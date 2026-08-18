/**
 * Filesystem discovery of user-defined teams.
 *
 * A team is a directory holding a {@link TEAM_FILE} (`team.yml`); the directory
 * name is the team id. Discovery re-reads the roots on every call so a team
 * authored while the process is running is visible without a restart. Each root
 * holds one subdirectory per team, mirroring the subagent discovery layout.
 *
 * Discovery owns whole-team HEALTH: a directory whose `team.yml` is missing or
 * malformed is reported as a broken roster row rather than skipped, so the id
 * stays visible and deletable. Per-role health (a role whose bound subagent is
 * missing/broken) is resolved by the {@link Teams} service, which can consult
 * the subagent registry.
 * @module dsh-harness-subagent-bundle/team/discovery
 */
import { type Team, type TeamRoot } from './types.ts';
/**
 * Harness-home directory holding locally authored teams.
 * Mirrors `USER_SUBAGENT_DIR` (`subagents`) in the preset package: this package
 * owns the writable team root the same way, and the app supplies the SHIPPED
 * root.
 */
export declare const USER_TEAM_DIR = "teams";
/**
 * Scan one root for team directories.
 *
 * An absent root yields no teams rather than throwing (the user root does not
 * exist until the first locally authored team). Every directory whose name is a
 * usable team id is a roster row — broken when its `team.yml` is missing or
 * malformed. A directory named outside {@link TEAM_ID} is skipped.
 * @param root - the directory and the trust its teams inherit.
 * @returns the root's teams ordered by id.
 */
export declare function scanRoot(root: TeamRoot): Promise<Team[]>;
/**
 * Scan every root in precedence order.
 * @param roots - roots in precedence order; an earlier root wins a duplicate id.
 * @returns every discovered team, first-root-wins per id.
 */
export declare function discoverTeams(roots: readonly TeamRoot[]): Promise<Team[]>;
//# sourceMappingURL=discovery.d.ts.map