/**
 * Isolation Context — three-dimensional tenancy for L0/L1/Profile data.
 *
 * Every write into L0_conversations / l1_records / profiles MUST carry a
 * full IsolationContext (user_id, agent_id, session_id). Every query MUST
 * accept an IsolationFilter so the caller controls which dimensions are
 * narrowed.
 *
 * See `docs/l0l3-tenant-isolation-design.md` for the full design rationale.
 */
/** Default bucket used when caller does not provide explicit isolation fields. */
export declare const DEFAULT_ISOLATION_ID = "default";
/** Placeholder used when migrating legacy data that has no user/agent assignment. */
export declare const LEGACY_ISOLATION_PLACEHOLDER = "default";
/**
 * Full isolation context required for any write into L0/L1/Profile.
 *
 * - `userId` / `agentId` / `sessionId` are MANDATORY. Empty strings are
 *   rejected unless legacy_compat_mode is enabled (see `assertIsolation`).
 * - `taskId` is an optional business dimension for L0/L1 filtering. It must
 *   never replace sessionId/sessionKey because L1 extraction is session-based.
 */
export interface IsolationContext {
    teamId?: string;
    userId: string;
    agentId: string;
    sessionId: string;
    taskId?: string;
    /** Optional secondary aggregation key kept for legacy callers. */
    sessionKey?: string;
}
/**
 * Isolation filter for queries. Any unset / undefined field means "do not
 * narrow on this dimension". This matches the SQL convention of `WHERE x = ?`
 * being skipped when the parameter is absent.
 */
export interface IsolationFilter {
    teamId?: string;
    userId?: string;
    agentId?: string;
    sessionId?: string;
    taskId?: string;
    sessionKey?: string;
}
/** Runtime config governing isolation enforcement. */
export interface IsolationConfig {
    /** When true (default) writes without full IsolationContext throw. */
    enforce: boolean;
    /** When true the writer fills missing fields with `__legacy__` instead of throwing. */
    legacyCompatMode: boolean;
    /** Placeholder used when legacyCompatMode fills missing fields. */
    legacyPlaceholder: string;
}
export declare const DEFAULT_ISOLATION_CONFIG: IsolationConfig;
/**
 * Validate (and optionally repair) an IsolationContext.
 *
 * @returns A normalised context with `userId/agentId/sessionId` guaranteed
 *          non-empty.
 * @throws  When `enforce=true` and `legacyCompatMode=false` and any of the
 *          three mandatory fields is empty/missing.
 */
export declare function assertIsolation(ctx: Partial<IsolationContext> | undefined, config?: IsolationConfig): IsolationContext;
export declare class IsolationError extends Error {
    readonly missingFields: string[];
    constructor(message: string, missingFields: string[]);
}
/**
 * Build a SQL WHERE clause fragment + params for IsolationFilter.
 *
 * Returns:
 *   - `clause`: e.g. `user_id = ? AND agent_id = ?` (no leading WHERE / AND)
 *   - `params`: positional bindings in the same order as the clause
 *
 * Pass `tablePrefix` (e.g. "l1.") if joining multiple tables.
 */
export declare function buildIsolationWhere(filter: IsolationFilter | undefined, tablePrefix?: string): {
    clause: string;
    params: string[];
};
/**
 * Check whether a row honours an IsolationFilter (post-retrieve re-check).
 * Used as a safety net after vector / FTS recall, in case the underlying
 * store cannot push the filter down (e.g. older TCVDB collection).
 */
export declare function rowMatchesIsolation(row: {
    team_id?: string;
    user_id?: string;
    agent_id?: string;
    session_id?: string;
    task_id?: string;
    session_key?: string;
}, filter: IsolationFilter | undefined): boolean;
