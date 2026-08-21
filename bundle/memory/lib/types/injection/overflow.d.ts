/**
 * Context-overflow rescue (T11): the `agent/request-error` handler that takes
 * over the retired official compaction's second trigger point.
 *
 * When a model request fails with `CONTEXT_WINDOW_EXCEEDED`, the handler:
 *   - runs the hierarchical compression (fold raw → layers) and recursively
 *     coarsens the summaries deeper so the session can retry within the window,
 *   - returns `{ kind: 'retry' }` when a durable reduction happened, letting the
 *     agent loop retry the step on the replacement surface,
 *   - delegates (`next()`) when the failure is not an overflow, the turn is
 *     aborted, no durable reduction was possible, or the retry budget is spent.
 *
 * Retry counting is per-agent and reset on a successful assistant message or an
 * idle agent, so a fresh turn does not inherit a spent budget. This mirrors the
 * official compaction-basic overflow-recovery semantics but on the memory
 * bundle's hierarchical engine.
 *
 * @module dsh-harness-memory-bundle/injection/overflow
 */
import type { RequestErrorAction } from '@deepseek-ai/dsh-agent';
import type { Session } from '@deepseek-ai/dsh-session';
import type { CompressionCoordinator } from './compaction.ts';
/** Default overflow-recovery retry budget (bounded to avoid a retry loop). */
export declare const DEFAULT_MAX_OVERFLOW_RETRIES = 2;
/** The agent-facing surface the overflow rescue needs off the payload. */
export interface OverflowAgentLike {
    readonly session: Session;
}
/** Everything the overflow-rescue handler needs from the host. */
export interface OverflowRescueDeps {
    /** The hierarchical compression coordinator (stage 3 engine). */
    readonly compression: CompressionCoordinator;
    /** Bounded overflow-recovery retry budget. Defaults to 2. */
    readonly maxOverflowRetries?: number;
    /** Logger seam for overflow-recovery observability. */
    log?(level: 'info' | 'warn', message: string): void;
}
/** The handler's public surface: the request-error listener + retry-budget reset. */
export interface OverflowRescueHandler {
    /**
     * The `agent/request-error` listener. Returns `{ kind: 'retry' }` when it
     * performed a durable reduction on a context overflow, or calls `next()`.
     */
    handler(payload: {
        agent: OverflowAgentLike;
        failure: {
            readonly code?: string;
        };
        signal: AbortSignal;
    }, next: () => Promise<RequestErrorAction>): Promise<RequestErrorAction>;
    /** Reset the retry budget for an agent (called on success / idle). */
    clear(agent: object): void;
    /** Reset the retry budget for the agent owning a session (success message). */
    clearBySession(session: Session): void;
}
/**
 * Build the context-overflow rescue handler bound to its deps. Returns the
 * handler plus the retry-budget reset seams the host wires to `agent/status`
 * and successful `assistant/message` events.
 */
export declare function createOverflowRescueHandler(deps: OverflowRescueDeps): OverflowRescueHandler;
//# sourceMappingURL=overflow.d.ts.map