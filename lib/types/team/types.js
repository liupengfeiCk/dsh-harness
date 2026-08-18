/**
 * Team vocabulary shared by discovery, registry, and consumers.
 *
 * A team ("编制表") is a user-authored roster of roles. Each role binds a
 * "soul" (role: id、职责描述、独立提示词) to a "body" (a user-defined subagent id
 * that bounds the role's capability surface). The body is a hard constraint on
 * what the role may do; the soul is a soft constraint on how it behaves.
 * Teams ship under the same dual-root trust model as subagents: `config/teams/`
 * is read-only (`system`), `$DSH_HOME/.dsh/teams` is where a person authors
 * their own (`user`).
 */
/**
 * Ids a team directory may use. A team id becomes a path segment, so this is a
 * containment boundary (same rationale as `SUBAGENT_ID`): `..`, a separator, or
 * an absolute-looking name would place the team file outside the root the
 * deployment authorised.
 */
export const TEAM_ID = /^[a-z0-9][a-z0-9-]*$/;
/** No configured root supplies the requested team. */
export class UnknownTeamError extends Error {
    teamId;
    available;
    constructor(
    /** The team id that was requested. */
    teamId, 
    /** Ids the roster does supply, for the caller to offer instead. */
    available) {
        super(`team-presets: team "${teamId}" not found (available: ${available.join(', ') || 'none'})`);
        this.teamId = teamId;
        this.available = available;
    }
}
/** A team exists but carries no usable role with the requested id. */
export class UnknownTeamRoleError extends Error {
    teamId;
    roleId;
    available;
    constructor(
    /** The team id. */
    teamId, 
    /** The role id that was requested. */
    roleId, 
    /** Roles the team does supply, for the caller to offer instead. */
    available) {
        super(`team-presets: team "${teamId}" has no role "${roleId}" (available: ${available.join(', ') || 'none'})`);
        this.teamId = teamId;
        this.roleId = roleId;
        this.available = available;
    }
}
//# sourceMappingURL=types.js.map