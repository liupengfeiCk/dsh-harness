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
import { dshHomePath } from '@deepseek-ai/dsh-home-paths';
import { discoverTeams, USER_TEAM_DIR } from "./discovery.js";
import { UnknownTeamError, UnknownTeamRoleError, } from "./types.js";
export { TEAM_FILE } from "./metadata.js";
export { discoverTeams, scanRoot, USER_TEAM_DIR } from "./discovery.js";
export { TEAM_ID, UnknownTeamError, UnknownTeamRoleError } from "./types.js";
/**
 * Registry over the deployment's user-defined teams.
 *
 * Discovery is unmemoized: `list()` and `resolve()` re-read the roots on every
 * call so a team authored while the process runs is visible immediately.
 */
export class Teams extends Service {
    config;
    /** Runtime schema for the team roster. */
    static Config = z.object({
        roots: z.array(z.object({
            path: z.string().required(),
            trust: z.union(['system', 'user']).default('user'),
        })).default([]),
        includeUserRoot: z.boolean().default(true),
    });
    /** The roots discovery actually scans: configured roots, then the harness-home user root. */
    resolvedRoots;
    constructor(ctx, config) {
        super(ctx, 'teams');
        this.config = config;
        this.resolvedRoots = config.includeUserRoot
            ? [...config.roots, { path: dshHomePath(USER_TEAM_DIR), trust: 'user' }]
            : [...config.roots];
    }
    /**
     * Every team the configured roots currently supply.
     * @returns the teams, first-root-wins per id.
     */
    async list() {
        return await discoverTeams(this.resolvedRoots);
    }
    /**
     * Resolve one team by id.
     *
     * A broken team resolves — deleting one, reading one, and reporting one all
     * need the row — and the role-resolution paths refuse it AFTER resolution.
     * @param id - the team id.
     * @returns the resolved team.
     * @throws when no configured root supplies that id.
     */
    async resolve(id) {
        const teams = await this.list();
        const found = teams.find(team => team.id === id);
        if (found === undefined) {
            throw new UnknownTeamError(id, teams.map(team => team.id));
        }
        return found;
    }
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
    async resolveRoleDefinition(teamId, roleId) {
        const team = await this.resolve(teamId);
        if (team.broken !== undefined) {
            throw new Error(`team-presets: team "${teamId}" cannot be used: ${team.broken}`);
        }
        if (team.metadata.enabled === false) {
            throw new Error(`team-presets: team "${teamId}" is disabled; enable it in the teams settings to delegate to it`);
        }
        const role = team.roles.find(candidate => candidate.id === roleId);
        if (role === undefined) {
            throw new UnknownTeamRoleError(teamId, roleId, team.roles.map(candidate => candidate.id));
        }
        return role;
    }
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
    async resolveRole(teamId, roleId) {
        const role = await this.resolveRoleDefinition(teamId, roleId);
        if (role.broken !== undefined) {
            throw new Error(`team-presets: team "${teamId}" role "${roleId}" cannot be delegated: ${role.broken}`);
        }
        // The body is a subagent id resolved through the subagent registry. A role
        // whose body is missing, broken, or disabled is refused here — the team's
        // other roles stay usable (broken semantics are per-role, not per-team).
        const subagents = this.ctx.get('subagentPresets');
        if (subagents === undefined) {
            throw new Error(`team-presets: team "${teamId}" role "${roleId}" binds body subagent "${role.body}" but no subagent `
                + 'registry is loaded (load dsh-harness-subagent-bundle/preset in the host composition)');
        }
        const body = await subagents.resolve(role.body);
        if (body.broken !== undefined) {
            throw new Error(`team-presets: team "${teamId}" role "${roleId}" cannot be delegated: its body subagent "${role.body}" `
                + `is broken: ${body.broken}`);
        }
        if (body.metadata.enabled === false) {
            throw new Error(`team-presets: team "${teamId}" role "${roleId}" cannot be delegated: its body subagent "${role.body}" `
                + 'is disabled; enable it in the subagents settings to delegate to it');
        }
        return role;
    }
}
export default Teams;
//# sourceMappingURL=index.js.map