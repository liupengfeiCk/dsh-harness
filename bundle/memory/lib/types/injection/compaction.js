/**
 * Compression-point wiring (stage 3): run the T8 `CompactionEngine` against a
 * live session's real raw store, with an injectable summarizer and storage.
 *
 * This module assembles the engine once (with the durable `sessionRawStore`
 * and `FileSummaryStorage`) and exposes:
 *   - `shouldCompress` — has the session's raw history crossed the compression
 *     line against the resolved window?
 *   - `compress`       — execute the hierarchical compression and persist layers.
 *
 * The window capacity is resolved from the routed model's advertised context
 * window (`session.requestContext()?.contextWindow`), falling back to a
 * configurable default. The summarizer is injectable so tests run without a
 * live LLM; production passes a prefix-aligned `ctx.llm.stream` summarizer.
 *
 * @module dsh-harness-memory-bundle/injection/compaction
 */
import { CompactionEngine, FileSummaryStorage, createPrefixAlignedSummarizer } from "../compaction/index.js";
import { projectEvent } from "./raw-store.js";
/** Fallback context window when the routed model advertises none. */
const DEFAULT_CONTEXT_WINDOW = 64 * 1024;
/**
 * A summarizer that reuses the routed conversation's prefix (system/tools and
 * leading messages) so the provider's KV cache is not invalidated — built on
 * the T8 prefix-aligned summarizer with a route resolver that follows the
 * session's latest routed provider/model.
 */
export function routedSummarizer(llm, session) {
    return createPrefixAlignedSummarizer(llm, () => {
        const routed = session.requestContext();
        return {
            provider: routed?.provider ?? '',
            model: routed?.model ?? '',
            maxTokens: 512,
            sessionId: session.id,
        };
    });
}
/** Assemble a `CompressionCoordinator` for live sessions. */
export function createCompressionCoordinator(options) {
    const storage = new FileSummaryStorage(options.storageBase);
    // The summarizer is injected (tests) or absent; without one the engine gets a
    // refusal summarizer so no content is silently distorted.
    const summarizer = options.summarizer ?? neverSummarizer();
    const engine = new CompactionEngine({
        ...(options.config === undefined ? {} : { config: options.config }),
        summarizer,
        storage,
        rawStore: {
            async read() { return []; },
            async has() { return false; },
        },
    });
    const windowOverride = options.windowOverride;
    return {
        engine,
        storage,
        resolveWindow(session) {
            if (windowOverride !== undefined)
                return windowOverride;
            return session.requestContext()?.contextWindow ?? DEFAULT_CONTEXT_WINDOW;
        },
        shouldCompress(session) {
            const windowTokens = this.resolveWindow(session);
            return engine.checkTrigger(rawHistoryTokens(session), windowTokens);
        },
        async compress(session) {
            const windowTokens = this.resolveWindow(session);
            const result = await engine.compress(session.id, readRawHistory(session), windowTokens);
            return { layers: result.layers, windowTokens };
        },
    };
}
/** A summarizer that never reduces — used only when no LLM seam is present. */
function neverSummarizer() {
    return { async summarize() { return null; } };
}
/** Measure raw-history tokens via the real raw store projection. */
function rawHistoryTokens(session) {
    return readRawHistory(session).reduce((sum, m) => sum + m.tokens, 0);
}
/** Project the session's raw history into `CompactionMessage[]` (surface order). */
function readRawHistory(session) {
    const messages = [];
    for (const event of session.events) {
        const projected = projectEvent(session, event);
        if (projected !== null)
            messages.push(projected);
    }
    return messages;
}
//# sourceMappingURL=compaction.js.map