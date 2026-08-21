/**
 * Host wiring for T9 unified injection: install the `agent/pre-step` handler
 * on the root context using the memory service's recall + the T8 compaction
 * coordinator. Scope-filtered dispatch delivers agent-scoped pre-step events
 * to this root listener for every live agent.
 *
 * @module dsh-harness-memory-bundle/injection/host
 */
import { createCompressionCoordinator } from "./compaction.js";
import { createOverflowRescueHandler } from "./overflow.js";
import { createPreStepHandler } from "./pre-step.js";
import { StageLedger } from "./stage.js";
/**
 * Install the pre-step injection handler on `ctx`. Returns the disposer.
 * The handler reads the per-session stage ledger and, on each step:
 *   - runs hierarchical compaction when the raw history crosses the line,
 *   - injects the snapshot (L3/L2) and/or L1 recall per the stage,
 *   - prefixes the step's messages with the injected content.
 */
export function installInjection(ctx, recall, options = {}) {
    const ledger = new StageLedger();
    const compression = createCompressionCoordinator({
        ...(options.compactionConfig === undefined ? {} : { config: options.compactionConfig }),
        ...(options.storageBase === undefined ? {} : { storageBase: options.storageBase }),
        ...(options.windowOverride === undefined ? {} : { windowOverride: options.windowOverride }),
        // Compression is the cache-invalidating moment for the inherited public
        // section: forward the event so T12 refreshes every live child's shared
        // public memory. Fire-and-forget (not awaited) — refresh is best-effort.
        ...(options.onCompressed === undefined ? {} : { onCompressed: options.onCompressed }),
    });
    const handler = createPreStepHandler({
        recall: (text, key) => recall.recall(text, key),
        compression,
        ledger,
        autoCompress: options.autoCompress ?? true,
        log: (level, message) => {
            if (level === 'warn')
                ctx.logger.warn(message);
            else
                ctx.logger.info(message);
        },
    });
    ctx.on('agent/pre-step', handler);
    // T11 context-overflow rescue (agent/request-error, CONTEXT_WINDOW_EXCEEDED):
    // coarsen deeper and retry, with a bounded budget that resets on success/idle.
    const overflow = createOverflowRescueHandler({
        compression,
        ...(options.overflowRetries === undefined ? {} : { maxOverflowRetries: options.overflowRetries }),
        log: (level, message) => {
            if (level === 'warn')
                ctx.logger.warn(message);
            else
                ctx.logger.info(message);
        },
    });
    ctx.on('agent/request-error', overflow.handler);
    ctx.on('agent/status', (payload) => {
        if (payload.status === 'idle')
            overflow.clear(payload.agent);
    });
    ctx.on('session/event', (session, event) => {
        if (event.type === 'assistant/message')
            overflow.clearBySession(session);
    });
    return () => {
        // The ledger holds per-session state; nothing to dispose beyond the
        // listeners, which cordis removes with the ctx. Keep the disposer explicit
        // for symmetry with the effect lifecycle.
    };
}
//# sourceMappingURL=host.js.map