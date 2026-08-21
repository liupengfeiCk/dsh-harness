/**
 * Session-internal hierarchical compaction engine — the public API surface
 * that T9 (unified injection) and T10 (tool recall/refine) build on.
 *
 * The engine wires the pure selection/partition/coarsen policies to the
 * injected summarizer and storage seams, and exposes:
 *   - `checkTrigger` — has raw history crossed the compression line?
 *   - `compress`    — fold old raw history into layered summaries, persist each.
 *   - `coarsen`     — recursively coarsen summaries under the injection cap.
 *   - `retrieve`    — pull back a fine layer / raw text for a covered interval.
 *
 * The engine is deliberately NOT a cordis Service — it is a plain object
 * constructed with injected seams, so it is trivially unit-testable and T9 can
 * construct it inside its own agent/request wiring. (Skeleton: the host entry
 * may later construct this engine; this module has no cordis dependency.)
 *
 * @module dsh-harness-memory-bundle/compaction/engine
 */
import type { CompactionConfig, CompactionMessage, LayerSummary, RawStore, Summarizer, SummaryStorage } from './types.ts';
/** The result of one compression pass over a raw span. */
export interface CompressionResult {
    /** The produced summary layers, ordered by level ascending. */
    readonly layers: readonly LayerSummary[];
    /** The raw seq range that was folded into summaries. */
    readonly compressedRange: readonly [start: number, end: number];
    /** Total tokens retained verbatim in the recent tail. */
    readonly retainedTokens: number;
}
/** Public engine surface. */
export interface CompactionEngineLike {
    checkTrigger(historyTokens: number, windowTokens: number): boolean;
    compress(sessionId: string, history: readonly CompactionMessage[], windowTokens: number): Promise<CompressionResult>;
    coarsen(sessionId: string, summaries: readonly LayerSummary[], crossSessionMemoryTokens: number, windowTokens: number): Promise<LayerSummary[]>;
    retrieve(sessionId: string, seq: number): Promise<LayerSummary[]>;
}
/** Constructor inputs: config + injected seams. */
export interface CompactionEngineDeps {
    readonly config?: Partial<CompactionConfig>;
    readonly summarizer: Summarizer;
    readonly storage: SummaryStorage;
    readonly rawStore: RawStore;
}
/**
 * Plain-object engine over injected seams.
 */
export declare class CompactionEngine implements CompactionEngineLike {
    private readonly deps;
    readonly config: CompactionConfig;
    constructor(deps: CompactionEngineDeps);
    /** The absolute injection cap tokens for a given window. */
    injectionCapTokens(windowTokens: number): number;
    /**
     * Whether raw history has crossed the compression line.
     * @param historyTokens - current raw-history token count.
     * @param windowTokens  - context window capacity.
     */
    checkTrigger(historyTokens: number, windowTokens: number): boolean;
    /**
     * Compress old raw history into layered summaries (near = detailed, far =
     * coarse), retaining a recent tail verbatim, and persist every layer.
     * @param sessionId - the session's id (also its storage key).
     * @param history   - the session's ordered raw messages (surface order).
     * @param windowTokens - context window capacity for budget resolution.
     * @returns the produced layers and the compressed/retained split.
     */
    compress(sessionId: string, history: readonly CompactionMessage[], windowTokens: number): Promise<CompressionResult>;
    /**
     * Recursively coarsen summaries so summaries + cross-session memory fit the
     * injection cap, persisting any merged layers.
     * @throws {CoarseningFloorError} when the coarsest layer still exceeds the cap.
     */
    coarsen(sessionId: string, summaries: readonly LayerSummary[], crossSessionMemoryTokens: number, windowTokens: number): Promise<LayerSummary[]>;
    /**
     * Retrieve the finest stored summary layers covering the message at `seq` —
     * the coarse→fine→L0 refine (recall) chain entry point.
     * @returns layers covering `seq`, ordered by level descending (finest first).
     * @throws {NoCoverageError} when no layer covers the requested seq.
     */
    retrieve(sessionId: string, seq: number): Promise<LayerSummary[]>;
}
//# sourceMappingURL=engine.d.ts.map