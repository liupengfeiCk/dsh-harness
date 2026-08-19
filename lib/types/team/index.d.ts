/**
 * User-defined teams ("编制表"): a registry over independently stored,
 * user-authored rosters of roles that bind a prompt (role) to a subagent.
 *
 * A team is one directory holding a `team.yml` carrying the team's display
 * metadata and its role roster. Each role names a subagent id as its
 * capability boundary and carries its own prompt as the behaviour guide. Roles
 * live in their OWN roots (`config/teams/` for the shipped, read-only set and
 * `$DSH_HOME/.dsh/teams` for locally authored ones), fully separate from both
 * the agent-preset roster and the subagent roster.
 *
 * This service owns the team vocabulary, filesystem discovery, and the guarded
 * resolution of a role into a delegation target (subagent + prompt persona).
 * It does not decide when a child is created; the team delegation tool calls
 * {@link Teams.resolveRole} and then starts the child through `ctx.subagents`.
 * @module dsh-harness-subagent-bundle/team
 */
import { Service } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import type { Context } from '@deepseek-ai/cordis';
import { type Config, type Team, type TeamRole, type TeamRoot } from './types.ts';
import { type TeamMode, type TeamModeState } from './mode.ts';
import type { SessionId } from '@deepseek-ai/dsh-session';
export { TEAM_FILE } from './metadata.ts';
export { discoverTeams, scanRoot, USER_TEAM_DIR } from './discovery.ts';
export { InvalidTeamIdError, TeamExistsError, TeamNotWritableError, TeamRoleInvalidError, createTeam, deleteTeam, setTeamEnabled, updateTeam, writableRoot, } from './authoring.ts';
export { TEAM_ID, UnknownTeamError, UnknownTeamRoleError } from './types.ts';
export { STANDARD_TOOLS, TEAM_TOOL, applyModeRestrictions, currentTeamMode, modeLocked, } from './mode.ts';
export type { TeamMode, TeamModeState } from './mode.ts';
export type { Config, Team, TeamRole, TeamRoot, TeamTrust, TeamRoleMemory } from './types.ts';
declare module '@deepseek-ai/cordis' {
    interface Context {
        teams: Teams;
    }
    interface Events {
        /**
         * A session's delegation surface was selected or changed. Carries only the
         * stable folded identity (session id + mode state), never the live Session
         * — the same notification shape as `agent-preset/selected`.
         */
        'subagent-team/mode-selected'(sessionId: string, state: TeamModeState): void;
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
    /**
     * Live tool-visibility disposers applied for each session's mode, keyed by
     * session id. A re-selection (standard ⇄ team) releases the previous
     * restriction before applying the next; entries die with their session.
     */
    private readonly modeRestrictions;
    /** Teams whose config-hygiene warning has already been logged, per id. */
    private readonly warnedHygiene;
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
     * Resolve one role's stored definition (its bound subagent and prompt) from
     * the team's CURRENT file, without health-checking the bound subagent. Used
     * by the cold-resume path to re-materialize a persistent role against the
     * latest team definition ("reference semantics": if the team file was edited,
     * the resumed role uses the new version). A role whose own fields are unusable
     * resolves to its structurally-broken form so the caller can decide.
     * @param teamId - the team id.
     * @param roleId - the role id.
     * @returns the role's latest stored definition.
     * @throws when the team is unknown or broken, or the role id is unknown.
     */
    resolveRoleDefinition(teamId: string, roleId: string): Promise<TeamRole>;
    /**
     * Resolve a role that is about to compose a child, health-checking its bound
     * subagent. A role whose subagent is missing, structurally broken, or
     * disabled is refused with a per-role reason — the team's OTHER roles stay
     * usable. This is the delegation gate the team tool calls.
     * @param teamId - the team id.
     * @param roleId - the role id.
     * @returns the usable role with its subagent (subagent id) and prompt.
     * @throws when the team is unknown/broken, the role is unknown, or the role's
     *   bound subagent is not a usable subagent.
     */
    resolveRole(teamId: string, roleId: string): Promise<TeamRole>;
    /**
     * A config-hygiene advisory for one team, or undefined when it is clean.
     *
     * Rule 7: a role that is BOTH `one-shot` AND at level >= 2 dissolves after a
     * single completed task, so it can never be delegated to again — defeating
     * the point of a delegating role. This is a WARNING, not a refusal: the role
     * stays usable for a single hop. The advisory is surfaced on the team-detail
     * wire (so the UI can read it) and logged when the team is discovered.
     * @param team - the resolved team to inspect.
     * @returns a human-readable advisory, or undefined when the team is clean.
     */
    hygieneWarning(team: Team): string | undefined;
    /**
     * The roots this roster scans, which is not `config.roots`: it is every
     * configured root in order, then the harness-home user root unless
     * `includeUserRoot` is false.
     */
    get roots(): readonly TeamRoot[];
    /** Whether this deployment has a root locally authored teams go to. */
    get authorable(): boolean;
    /**
     * Create a locally authored team from an initial role roster.
     * @param id - the new team's id, which becomes its directory name.
     * @param metadata - the team's display metadata.
     * @param roles - the initial role roster.
     * @throws when the id is unusable or already taken, a role is unusable, or
     * the deployment configures no writable root.
     */
    create(id: string, metadata: {
        readonly name?: string;
        readonly description?: string;
        readonly enabled?: boolean;
    }, roles: readonly TeamRole[]): Promise<void>;
    /**
     * Rewrite one locally authored team's `team.yml` as a whole — display
     * metadata and role roster together.
     * @param id - the team id.
     * @param metadata - the complete display metadata to store.
     * @param roles - the complete role roster to store.
     * @throws when the team is unknown or ships with the deployment.
     */
    update(id: string, metadata: {
        readonly name?: string;
        readonly description?: string;
        readonly enabled?: boolean;
    }, roles: readonly TeamRole[]): Promise<void>;
    /**
     * Delete a locally authored team.
     * @param id - the team id.
     * @throws when the team is unknown or ships with the deployment.
     */
    remove(id: string): Promise<void>;
    /**
     * Toggle one team's enabled switch. A shipped team is refused — its install
     * is not the user's to manage.
     * @param id - the team id.
     * @param enabled - whether the team is usable for delegation.
     * @throws when the team is unknown or ships with the deployment.
     */
    setEnabled(id: string, enabled: boolean): Promise<void>;
    /**
     * The session's current delegation surface, folded from its durable log.
     * @param sessionId - the session to read.
     * @returns the folded mode state.
     * @throws when the session has no live agent (the fold needs its event log).
     */
    readMode(sessionId: SessionId): TeamModeState;
    /**
     * Select one session's delegation surface.
     *
     * Allowed only while the session is blank — no turn has run — because the
     * tools the model saw were produced under the previous surface and swapping
     * them would strand logged tool calls; the attempt throws the same
     * blank-window refusal the agent preset carries. Selecting `team` requires
     * the named team to exist and be usable (the delegation target must be real
     * for the surface to be meaningful).
     *
     * The durable record is a log-only `subagent-team/mode` event (never in the
     * model transcript); the tool visibility is derived from it by restricting
     * the opposite surface's tools on the agent's scope, and the change is
     * broadcast as `subagent-team/mode-selected`.
     * @param sessionId - the session to switch.
     * @param mode - the surface to select.
     * @param team - the team id to delegate to, required when `mode` is `team`.
     * @throws when the session has no live agent, has already started, or names
     * an unknown team.
     */
    selectMode(sessionId: SessionId, mode: TeamMode, team?: string): Promise<void>;
}
export default Teams;
//# sourceMappingURL=index.d.ts.map