/**
 * dsh-harness-memory-bundle/ingestion/attribution — derive the DSH identity
 * coordinates (design §3.4 三维正交, §4.1 归属坐标系) for one live session.
 *
 * The vendor engine groups conversations by `sessionKey` and tags L1 records
 * with `teamId`/`agentId`/`taskId`. On the DSH side those coordinates come from
 * the live session's own context, not from a plugin config:
 *
 *   - `team`    — folded from the session's durable `subagent-team/mode` event
 *     (the same fold the subagent bundle uses); defaults to `'default'`.
 *   - `role`    — the roster role the session runs as: a subagent child reads
 *     its role from the task association's `roleId`, else the main session is
 *     the primary-agent identity `'main'`.
 *   - `project` — the session's absolute working directory (`header.cwd`).
 *   - `task`    — the task this session is associated with (via the tasks
 *     registry's `task_sessions` ledger), when any.
 *   - `session` — the session id.
 *   - `user`    — the single-user harness identity.
 *
 * This module deliberately does NOT value-import the subagent bundle: it folds
 * the `subagent-team/mode` session event structurally (the event carries
 * `ignorable: true` and never enters the model transcript), keeping the memory
 * bundle self-contained. The derived coordinates are plain data, so T6's scope
 * routing (once its architecture is chosen) only needs to change
 * {@link encodeSessionKey} / how the coordinates feed the engine.
 *
 * @module dsh-harness-memory-bundle/ingestion/attribution
 */
import type { Context } from '@deepseek-ai/cordis';
import type { Session, SessionEvent } from '@deepseek-ai/dsh-session';
/** The single-user harness identity for attribution. */
export declare const DEFAULT_USER_ID = "default_user";
/** The primary-agent role identity for a top-level (main) session. */
export declare const MAIN_AGENT_ROLE = "main";
/** The fallback team when a session has no `subagent-team/mode` event. */
export declare const DEFAULT_TEAM = "default";
/**
 * The derived identity coordinates for one session. Plain data — T6 may extend
 * this with scope-routing fields once its architecture is settled.
 */
export interface TurnAttribution {
    /** Folded team id (`subagent-team/mode`), or {@link DEFAULT_TEAM}. */
    readonly team: string;
    /** Roster role, or {@link MAIN_AGENT_ROLE} for a main session. */
    readonly role: string;
    /** Absolute working directory, or `''` when the session has none. */
    readonly project: string;
    /** Associated task id, or `undefined`. */
    readonly task?: string;
    /** The session id. */
    readonly session: string;
    /** The single-user harness identity. */
    readonly user: string;
}
/**
 * Fold the last `subagent-team/mode` event from a session's event log.
 * @param events - the session's event log.
 * @returns the selected team id, or {@link DEFAULT_TEAM}.
 */
export declare function foldTeamMode(events: readonly SessionEvent[]): string;
/** The tasks-registry surface the attribution needs (structural, not imported). */
export interface TasksLike {
    list(filter?: {
        includeCompleted?: boolean;
    }): readonly {
        id: string;
        sessions: readonly {
            sessionId: string;
            roleId?: string;
        }[];
    }[];
}
/**
 * Derive the attribution coordinates for a live session.
 * @param ctx - the harness context (provides the tasks registry structurally).
 * @param session - the live session (header + event log).
 * @returns the derived coordinates.
 */
export declare function deriveTurnAttribution(ctx: Context, session: Session): TurnAttribution;
/**
 * Encode an attribution into the vendor `sessionKey` (L0/L1 grouping + pipeline
 * session identity). The encoding is the single place the DSH identity maps to
 * the vendor's session grouping, so T6's scope routing changes only here.
 * @param attribution - the derived coordinates.
 * @returns the vendor session key.
 */
export declare function encodeSessionKey(attribution: TurnAttribution): string;
//# sourceMappingURL=attribution.d.ts.map