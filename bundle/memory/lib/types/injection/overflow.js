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
import { CONTEXT_WINDOW_EXCEEDED_CODE } from '@deepseek-ai/dsh-llm';
/** Default overflow-recovery retry budget (bounded to avoid a retry loop). */
export const DEFAULT_MAX_OVERFLOW_RETRIES = 2;
/**
 * Build the context-overflow rescue handler bound to its deps. Returns the
 * handler plus the retry-budget reset seams the host wires to `agent/status`
 * and successful `assistant/message` events.
 */
export function createOverflowRescueHandler(deps) {
    const maxRetries = deps.maxOverflowRetries ?? DEFAULT_MAX_OVERFLOW_RETRIES;
    // Per-agent overflow retry budget (bounded; reset on success/idle).
    const retries = new WeakMap();
    // session → agent, so a successful assistant message can reset the owner.
    const owners = new WeakMap();
    return {
        clear(agent) {
            retries.delete(agent);
        },
        clearBySession(session) {
            const agent = owners.get(session);
            if (agent !== undefined)
                retries.delete(agent);
        },
        async handler(payload, next) {
            const { agent, failure, signal } = payload;
            if (failure.code !== CONTEXT_WINDOW_EXCEEDED_CODE || signal.aborted)
                return next();
            const owner = agent;
            owners.set(agent.session, owner);
            const used = retries.get(owner) ?? 0;
            if (used >= maxRetries) {
                deps.log?.('warn', `[memory] context overflow: retry budget spent (${used}/${maxRetries}); preserving the original error`);
                return next();
            }
            let layers;
            try {
                layers = await deps.compression.coarsenForOverflow(agent.session);
            }
            catch (error) {
                deps.log?.('warn', `[memory] context-overflow recovery failed; preserving the original error: ${error instanceof Error ? error.message : String(error)}`);
                return next();
            }
            if (layers === null || layers.length === 0) {
                deps.log?.('warn', '[memory] context overflow: no durable reduction possible; preserving the original error');
                return next();
            }
            retries.set(owner, used + 1);
            deps.log?.('info', `[memory] context overflow: coarsened into ${layers.length} summary layers, retrying`);
            return { kind: 'retry' };
        },
    };
}
//# sourceMappingURL=overflow.js.map