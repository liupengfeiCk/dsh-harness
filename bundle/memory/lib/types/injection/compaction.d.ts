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
import type { Session } from '@deepseek-ai/dsh-session';
import { CompactionEngine, FileSummaryStorage } from '../compaction/index.ts';
import type { CompactionConfig, LayerSummary, Summarizer } from '../compaction/types.ts';
import type { LlmStream } from '../compaction/summarizer.ts';
/**
 * A summarizer that reuses the routed conversation's prefix (system/tools and
 * leading messages) so the provider's KV cache is not invalidated — built on
 * the T8 prefix-aligned summarizer with a route resolver that follows the
 * session's latest routed provider/model.
 */
export declare function routedSummarizer(llm: LlmStream, session: Session): Summarizer;
/** The compression trigger seam: everything the pre-step handler needs. */
export interface CompressionCoordinator {
    readonly engine: CompactionEngine;
    readonly storage: FileSummaryStorage;
    /** Resolve the effective context window for budget resolution. */
    resolveWindow(session: Session): number;
    /** Whether the session's raw history has crossed the compression line. */
    shouldCompress(session: Session): boolean;
    /** Run hierarchical compression over the session's raw history. */
    compress(session: Session): Promise<{
        layers: readonly LayerSummary[];
        windowTokens: number;
    }>;
}
/** Assemble a `CompressionCoordinator` for live sessions. */
export declare function createCompressionCoordinator(options: {
    readonly summarizer?: Summarizer;
    readonly config?: Partial<CompactionConfig>;
    readonly storageBase?: string;
    readonly windowOverride?: number;
}): CompressionCoordinator;
//# sourceMappingURL=compaction.d.ts.map