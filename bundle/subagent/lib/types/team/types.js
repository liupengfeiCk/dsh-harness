/**
 * Team vocabulary shared by discovery, registry, and consumers.
 *
 * A team ("编制表") is a user-authored roster of roles. Each role binds a
 * prompt (role: id、职责描述、独立提示词) to a subagent (a user-defined subagent id
 * that bounds the role's capability surface). The subagent is a hard constraint
 * on what the role may do; the prompt is a soft constraint on how it behaves.
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
/**
 * The minimum authority a role carries in the team hierarchy. Level 1 is the
 * default and the only level that can NEVER delegate — it can only be delegated
 * to. A role at level >= 2 automatically receives the delegation tool and may
 * delegate to strictly-lower-level roles on the same team. The main agent (the
 * boss) is treated as the top level and is unrestricted. Strictly decreasing
 * levels along a delegation chain is what prevents cycles (the tool's maxDepth
 * stays as a second line of defence). This is a PROGRAM property: the gates
 * live in code, behaviour lives in the prompt.
 */
export const ROLE_LEVEL_DEFAULT = 1;
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