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

import { Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { Context } from '@deepseek-ai/cordis'
import { dshHomePath } from '../home-path.ts'
import {
  TeamExistsError,
  createTeam, deleteTeam, setTeamEnabled, updateTeam,
} from './authoring.ts'
import { discoverTeams, USER_TEAM_DIR } from './discovery.ts'
import {
  UnknownTeamError, UnknownTeamRoleError,
  type Config, type Team, type TeamRole, type TeamRoot,
} from './types.ts'
import { applyModeRestrictions, currentTeamMode, modeLocked, type TeamMode, type TeamModeState } from './mode.ts'
// Type-only: `ctx.agents` for applying a session's mode restriction and
// appending the durable mode event to the live session.
import type {} from '@deepseek-ai/dsh-agent'
import type { SessionId } from '@deepseek-ai/dsh-session'

export { TEAM_FILE } from './metadata.ts'
export { discoverTeams, scanRoot, USER_TEAM_DIR } from './discovery.ts'
export {
  InvalidTeamIdError, TeamExistsError, TeamNotWritableError, TeamRoleInvalidError,
  createTeam, deleteTeam, setTeamEnabled, updateTeam, writableRoot,
} from './authoring.ts'
export { TEAM_ID, UnknownTeamError, UnknownTeamRoleError } from './types.ts'
export {
  STANDARD_TOOLS, TEAM_TOOL, applyModeRestrictions, currentTeamMode, modeLocked,
} from './mode.ts'
export type { TeamMode, TeamModeState } from './mode.ts'
export type { Config, Team, TeamRole, TeamRoot, TeamTrust, TeamRoleMemory } from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    teams: Teams
  }

  interface Events {
    /**
     * A session's delegation surface was selected or changed. Carries only the
     * stable folded identity (session id + mode state), never the live Session
     * — the same notification shape as `agent-preset/selected`.
     */
    'subagent-team/mode-selected'(sessionId: string, state: TeamModeState): void
  }
}

/**
 * Registry over the deployment's user-defined teams.
 *
 * Discovery is unmemoized: `list()` and `resolve()` re-read the roots on every
 * call so a team authored while the process runs is visible immediately.
 */
export class Teams extends Service {
  /** Runtime schema for the team roster. */
  static Config = z.object({
    roots: z.array(z.object({
      path: z.string().required(),
      trust: z.union(['system', 'user'] as const).default('user'),
    })).default([]),
    includeUserRoot: z.boolean().default(true),
  }) as z<Config>

  /** The roots discovery actually scans: configured roots, then the harness-home user root. */
  private readonly resolvedRoots: readonly TeamRoot[]

  /**
   * Live tool-visibility disposers applied for each session's mode, keyed by
   * session id. A re-selection (standard ⇄ team) releases the previous
   * restriction before applying the next; entries die with their session.
   */
  private readonly modeRestrictions = new Map<string, Array<() => void>>()

  constructor(ctx: Context, public config: Config) {
    super(ctx, 'teams')
    this.resolvedRoots = config.includeUserRoot
      ? [...config.roots, { path: dshHomePath(USER_TEAM_DIR), trust: 'user' }]
      : [...config.roots]
    // The mode's durable record predates the agent: a blank session may carry
    // a `subagent-team/mode` event before its agent exists (the pick happens
    // on the new-conversation screen). When the agent is created, fold that
    // record and apply its tool restriction — the same window the agent
    // preset composes in.
    ctx.on('agent/created', (payload) => {
      const state = currentTeamMode(payload.agent.session.events)
      const disposers = applyModeRestrictions(ctx, payload.agent, state)
      if (disposers.length > 0) this.modeRestrictions.set(payload.agent.session.id, disposers)
    })
  }

  /**
   * Every team the configured roots currently supply.
   * @returns the teams, first-root-wins per id.
   */
  async list(): Promise<Team[]> {
    return await discoverTeams(this.resolvedRoots)
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
  async resolve(id: string): Promise<Team> {
    const teams = await this.list()
    const found = teams.find(team => team.id === id)
    if (found === undefined) {
      throw new UnknownTeamError(id, teams.map(team => team.id))
    }
    return found
  }

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
  async resolveRoleDefinition(teamId: string, roleId: string): Promise<TeamRole> {
    const team = await this.resolve(teamId)
    if (team.broken !== undefined) {
      throw new Error(`team-presets: team "${teamId}" cannot be used: ${team.broken}`)
    }
    if (team.metadata.enabled === false) {
      throw new Error(`team-presets: team "${teamId}" is disabled; enable it in the teams settings to delegate to it`)
    }
    const role = team.roles.find(candidate => candidate.id === roleId)
    if (role === undefined) {
      throw new UnknownTeamRoleError(teamId, roleId, team.roles.map(candidate => candidate.id))
    }
    return role
  }

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
  async resolveRole(teamId: string, roleId: string): Promise<TeamRole> {
    const role = await this.resolveRoleDefinition(teamId, roleId)
    if (role.broken !== undefined) {
      throw new Error(`team-presets: team "${teamId}" role "${roleId}" cannot be delegated: ${role.broken}`)
    }
    // The subagent is resolved through the subagent registry. A role whose
    // subagent is missing, broken, or disabled is refused here — the team's
    // other roles stay usable (broken semantics are per-role, not per-team).
    const subagents = this.ctx.get('subagentPresets')
    if (subagents === undefined) {
      throw new Error(
        `team-presets: team "${teamId}" role "${roleId}" binds subagent "${role.subagent}" but no subagent `
        + 'registry is loaded (load dsh-harness-subagent-bundle/preset in the host composition)',
      )
    }
    const subagent = await subagents.resolve(role.subagent)
    if (subagent.broken !== undefined) {
      throw new Error(
        `team-presets: team "${teamId}" role "${roleId}" cannot be delegated: its subagent "${role.subagent}" `
        + `is broken: ${subagent.broken}`,
      )
    }
    if (subagent.metadata.enabled === false) {
      throw new Error(
        `team-presets: team "${teamId}" role "${roleId}" cannot be delegated: its subagent "${role.subagent}" `
        + 'is disabled; enable it in the subagents settings to delegate to it',
      )
    }
    return role
  }

  /**
   * The roots this roster scans, which is not `config.roots`: it is every
   * configured root in order, then the harness-home user root unless
   * `includeUserRoot` is false.
   */
  get roots(): readonly TeamRoot[] {
    return this.resolvedRoots
  }

  /** Whether this deployment has a root locally authored teams go to. */
  get authorable(): boolean {
    return this.resolvedRoots.some(root => root.trust === 'user')
  }

  /**
   * Create a locally authored team from an initial role roster.
   * @param id - the new team's id, which becomes its directory name.
   * @param metadata - the team's display metadata.
   * @param roles - the initial role roster.
   * @throws when the id is unusable or already taken, a role is unusable, or
   * the deployment configures no writable root.
   */
  async create(
    id: string,
    metadata: { readonly name?: string; readonly description?: string; readonly enabled?: boolean },
    roles: readonly TeamRole[],
  ): Promise<void> {
    if ((await this.list()).some(team => team.id === id)) throw new TeamExistsError(id)
    await createTeam(this.resolvedRoots, id, metadata, roles)
  }

  /**
   * Rewrite one locally authored team's `team.yml` as a whole — display
   * metadata and role roster together.
   * @param id - the team id.
   * @param metadata - the complete display metadata to store.
   * @param roles - the complete role roster to store.
   * @throws when the team is unknown or ships with the deployment.
   */
  async update(
    id: string,
    metadata: { readonly name?: string; readonly description?: string; readonly enabled?: boolean },
    roles: readonly TeamRole[],
  ): Promise<void> {
    await updateTeam(this.resolvedRoots, await this.resolve(id), metadata, roles)
  }

  /**
   * Delete a locally authored team.
   * @param id - the team id.
   * @throws when the team is unknown or ships with the deployment.
   */
  async remove(id: string): Promise<void> {
    await deleteTeam(this.resolvedRoots, await this.resolve(id))
  }

  /**
   * Toggle one team's enabled switch. A shipped team is refused — its install
   * is not the user's to manage.
   * @param id - the team id.
   * @param enabled - whether the team is usable for delegation.
   * @throws when the team is unknown or ships with the deployment.
   */
  async setEnabled(id: string, enabled: boolean): Promise<void> {
    await setTeamEnabled(this.resolvedRoots, await this.resolve(id), enabled)
  }

  /**
   * The session's current delegation surface, folded from its durable log.
   * @param sessionId - the session to read.
   * @returns the folded mode state.
   * @throws when the session has no live agent (the fold needs its event log).
   */
  readMode(sessionId: SessionId): TeamModeState {
    // Read the SESSION, not the agent: the mode record lives in the session's
    // durable log, and a blank session (the pick happens before the first
    // message) has no live agent yet. `ctx.get` — dynamic lookup, not a
    // property read: this service activates inside hot-mounted Include
    // subtrees where an inject declaration chain is absent, and cordis
    // refuses bare property access there.
    const session = this.ctx.get('sessions')?.get(sessionId)
    if (session === undefined) {
      throw new Error(`team-presets: no live session "${sessionId}"; cannot read its delegation mode`)
    }
    return currentTeamMode(session.events)
  }

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
  async selectMode(sessionId: SessionId, mode: TeamMode, team?: string): Promise<void> {
    // The session, not the agent: the pick lands on the new-conversation
    // screen where the session exists but its agent does not — exactly like
    // the official agent-preset select, which composes when the agent is
    // created. The restriction is applied immediately only when the agent is
    // already live (a reopened blank session); otherwise the `agent/created`
    // hook in the constructor applies it from the folded record.
    const session = this.ctx.get('sessions')?.get(sessionId)
    if (session === undefined) {
      throw new Error(`team-presets: no live session "${sessionId}"; cannot change its delegation mode`)
    }
    if (modeLocked(session.events)) {
      throw new Error(`team-presets: session "${sessionId}" has already started; its delegation mode is fixed`)
    }
    if (mode === 'team') {
      if (team === undefined) {
        throw new Error('team-presets: selecting the team mode requires a team id')
      }
      await this.resolve(team)
    }
    // Release the previous surface's restriction before applying the next.
    const previous = this.modeRestrictions.get(sessionId)
    if (previous !== undefined) {
      for (const dispose of previous) dispose()
      this.modeRestrictions.delete(sessionId)
    }
    // The durable record is the commit point; the log states what the agent
    // runs, and the restriction follows it.
    session.append('subagent-team/mode', mode === 'team'
      ? { mode, team: team as string }
      : { mode })
    const state = currentTeamMode(session.events)
    const agent = this.ctx.get('agents')?.get(sessionId)
    if (agent !== undefined) {
      const disposers = applyModeRestrictions(this.ctx, agent, state)
      if (disposers.length > 0) this.modeRestrictions.set(sessionId, disposers)
    }
    this.ctx.emit('subagent-team/mode-selected', sessionId, state)
  }
}

export default Teams
