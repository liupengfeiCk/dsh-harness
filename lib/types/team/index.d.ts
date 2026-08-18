/**
 * User-defined teams ("编制表"): a registry over independently stored,
 * user-authored rosters of roles that bind a soul (role) to a body (subagent).
 *
 * A team is one directory holding a `team.yml` carrying the team's display
 * metadata and its role roster. Each role names a subagent id as its "body" —
 * the hard capability boundary — and carries its own prompt as the "soul" — the
 * soft behaviour guide. Roles live in their OWN roots (`config/teams/` for the
 * shipped, read-only set and `$DSH_HOME/.dsh/teams` for locally authored ones),
 * fully separate from both the agent-preset roster and the subagent roster.
 *
 * This service owns the team vocabulary, filesystem discovery, and the guarded
 * resolution of a role into a delegation target (body subagent + soul persona).
 * It does not decide when a child is created; the team delegation tool calls
 * {@link Teams.resolveRole} and then starts the child through `ctx.subagents`.
 * @module dsh-harness-subagent-bundle/team
 */
import { Service } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import type { Context } from '@deepseek-ai/cordis';
import { type Config, type Team, type TeamRole } from './types.ts';
export { TEAM_FILE } from './metadata.ts';
export { discoverTeams, scanRoot, USER_TEAM_DIR } from './discovery.ts';
export { TEAM_ID, UnknownTeamError, UnknownTeamRoleError } from './types.ts';
export type { Config, Team, TeamRole, TeamRoot, TeamTrust, TeamRoleMemory } from './types.ts';
declare module '@deepseek-ai/cordis' {
    interface Context {
        teams: Teams;
    }
}
/**
 * Registry over the deployment's user-defined teams.
 *
 * Discovery is unmemoized: `list()` and `resolve()` re-read the roots on every
 * call so a team authored while the process runs is visible immediately.
 */
export declare class Teams extends Service {
    config: Config;
    /** Runtime schema for the team roster. */
    static Config: z<Config>;
    /** The roots discovery actually scans: configured roots, then the harness-home user root. */
    private readonly resolvedRoots;
    constructor(ctx: Context, config: Config);
    /**
     * Every team the configured roots currently supply.
     * @returns the teams, first-root-wins per id.
     */
    list(): Promise<Team[]>;
    /**
     * Resolve one team by id.
     *
     * A broken team resolves — deleting one, reading one, and reporting one all
     * need the row — and the role-resolution paths refuse it AFTER resolution.
     * @param id - the team id.
     * @returns the resolved team.
     * @throws when no configured root supplies that id.
     */
    resolve(id: string): Promise<Team>;
    /**
     * Resolve one role's stored definition (its bound body and soul prompt) from
     * the team's CURRENT file, without health-checking the bound body. Used by
     * the cold-resume path to re-materialize a persistent role against the latest
     * team definition ("reference semantics": if the team file was edited, the
     * resumed role uses the new version). A role whose own fields are unusable
     * resolves to its structurally-broken form so the caller can decide.
     * @param teamId - the team id.
     * @param roleId - the role id.
     * @returns the role's latest stored definition.
     * @throws when the team is unknown or broken, or the role id is unknown.
     */
    resolveRoleDefinition(teamId: string, roleId: string): Promise<TeamRole>;
    /**
     * Resolve a role that is about to compose a child, health-checking its bound
     * body (subagent). A role whose body is missing, structurally broken, or
     * disabled is refused with a per-role reason — the team's OTHER roles stay
     * usable. This is the delegation gate the team tool calls.
     * @param teamId - the team id.
     * @param roleId - the role id.
     * @returns the usable role with its body (subagent id) and soul (prompt).
     * @throws when the team is unknown/broken, the role is unknown, or the role's
     *   bound body is not a usable subagent.
     */
    resolveRole(teamId: string, roleId: string): Promise<TeamRole>;
}
export default Teams;
//# sourceMappingURL=index.d.ts.map