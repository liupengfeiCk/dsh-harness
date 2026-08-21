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
import type { TeamMetadata } from './metadata.ts';
/** Where a team's file came from; mirrors `SubagentTrust`. */
export type TeamTrust = 'system' | 'user';
/**
 * Ids a team directory may use. A team id becomes a path segment, so this is a
 * containment boundary (same rationale as `SUBAGENT_ID`): `..`, a separator, or
 * an absolute-looking name would place the team file outside the root the
 * deployment authorised.
 */
export declare const TEAM_ID: RegExp;
/**
 * A role's memory policy.
 * - `one-shot`: every call is a fresh child; the role dissolves after the task.
 * - `persistent`: the role keeps a durable continuable child that remembers
 *   earlier work and can be resumed in later turns.
 */
export type TeamRoleMemory = 'one-shot' | 'persistent';
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
export declare const ROLE_LEVEL_DEFAULT = 1;
/** One role on a team roster. */
export interface TeamRole {
    /** Stable role id within the team. */
    readonly id: string;
    /** One sentence on what this role is for. */
    readonly description?: string;
    /** The role's independent prompt injected as the child's persona. */
    readonly prompt?: string;
    /** The subagent id this role is bound to: the capability surface. */
    readonly subagent: string;
    /**
     * The role's position in the team hierarchy (a positive integer, default 1).
     * Level 1 can only be delegated to; level >= 2 may delegate to lower levels.
     * Fully orthogonal to {@link TeamRoleMemory}: a level-2 role may be one-shot
     * (a warning is raised, but it is not refused).
     */
    readonly level: number;
    /** Memory policy: one-shot or persistent. */
    readonly memory: TeamRoleMemory;
    /**
     * Whether the child inherits the main conversation's hierarchical summary as
     * shared public memory (T12 inheritance mode). Default `true`; fully
     * orthogonal to {@link TeamRoleMemory}: a one-shot role may still inherit the
     * main's public memory without sedimenting its own role memory.
     */
    readonly inheritMainSummaries: boolean;
    /**
     * Why this role cannot be delegated, absent when it can. A role whose bound
     * subagent is missing, broken, or disabled is marked broken while the rest of
     * the team stays usable.
     */
    readonly broken?: string;
}
/** One discovered team ("编制表"). */
export interface Team {
    /** Stable identifier; the team directory's name. */
    readonly id: string;
    /** Trust recorded from the root this team was discovered under. */
    readonly trust: TeamTrust;
    /** Absolute path of the team's `team.yml` file. */
    readonly path: string;
    /** Display and product metadata (name/description/enabled). */
    readonly metadata: TeamMetadata;
    /** The roster of roles, each possibly individually broken. */
    readonly roles: readonly TeamRole[];
    /**
     * Why this whole team cannot be used, absent when it can. A broken team stays
     * on the roster (its directory occupies the id), but every resolution/role
     * path refuses it up front.
     */
    readonly broken?: string;
}
/** One directory scanned for team directories. */
export interface TeamRoot {
    /** Directory holding one subdirectory per team; a leading `~` expands. */
    path: string;
    /** Trust recorded on every team discovered under this root. */
    trust: TeamTrust;
}
/** Plugin config: which roots supply teams. */
export interface Config {
    /** Scanned roots in precedence order; an earlier root wins a duplicate id. */
    roots: TeamRoot[];
    /** Append the harness home's `USER_TEAM_DIR` as a `user` root, after every configured root. */
    includeUserRoot: boolean;
}
/** No configured root supplies the requested team. */
export declare class UnknownTeamError extends Error {
    /** The team id that was requested. */
    readonly teamId: string;
    /** Ids the roster does supply, for the caller to offer instead. */
    readonly available: readonly string[];
    constructor(
    /** The team id that was requested. */
    teamId: string, 
    /** Ids the roster does supply, for the caller to offer instead. */
    available: readonly string[]);
}
/** A team exists but carries no usable role with the requested id. */
export declare class UnknownTeamRoleError extends Error {
    /** The team id. */
    readonly teamId: string;
    /** The role id that was requested. */
    readonly roleId: string;
    /** Roles the team does supply, for the caller to offer instead. */
    readonly available: readonly string[];
    constructor(
    /** The team id. */
    teamId: string, 
    /** The role id that was requested. */
    roleId: string, 
    /** Roles the team does supply, for the caller to offer instead. */
    available: readonly string[]);
}
//# sourceMappingURL=types.d.ts.map