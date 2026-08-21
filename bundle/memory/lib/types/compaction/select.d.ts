/**
 * Pure selection policies: which raw span to compress, how to partition it
 * into hierarchical layers (near = detailed, far = coarse), and how to keep
 * cuts on message/tool-pair boundaries.
 *
 * All functions here are pure over the plain `CompactionMessage` model — no
 * cordis or Session runtime — so every policy is unit-testable.
 *
 * @module dsh-harness-memory-bundle/compaction/select
 */
import type { CompactionMessage } from './types.ts';
/** Whether `messages[index]` is a safe cut: it does not split a tool pair. */
export declare function isBalancedBoundary(messages: readonly CompactionMessage[], index: number): boolean;
/**
 * Select the compactable raw span: keep a recent tail of at least
 * `retainTokens` verbatim (cut only at a balanced message boundary), and return
 * everything before that tail as the compressible span.
 *
 * Matching the official `selectCompactableRange` semantics, we accumulate from
 * the tail backward until we reach `retainTokens`, then back up to a balanced
 * boundary so the compression never splits a tool-call/result pair.
 * @param messages - ordered raw messages (surface order).
 * @param retainTokens - minimum recent-tail token budget kept verbatim.
 * @returns the inclusive message-index span [startIndex, endIndex] to compress,
 *   or `null` when nothing may be compressed (empty, all retained, or the whole
 *   history is one indivisible block).
 */
export declare function selectCompressibleRange(messages: readonly CompactionMessage[], retainTokens: number): readonly [startIndex: number, endIndex: number] | null;
/** One partition band: a contiguous inclusive message-index slice and its total tokens. */
export interface LayerBand {
    readonly startIndex: number;
    readonly endIndex: number;
    readonly tokens: number;
}
/**
 * Partition a compressible message-index span into hierarchical layer bands,
 * near = detailed (one message per final band, dense) and far = coarse (fewer,
 * bigger bands). Higher `level` covers a larger (coarser) span.
 *
 * The partition is deterministic: near-end messages occupy the finest level
 * (level 1, one message each conceptually) and bands grow coarser as the
 * span's age increases. We derive the coarsest band first from the far end,
 * then progressively finer bands toward the near end, so the boundary between
 * fine and coarse is smooth rather than abrupt.
 *
 * @param messages - ordered raw messages.
 * @param span - inclusive [startIndex, endIndex] from `selectCompressibleRange`.
 * @param levels - number of summary layers to produce (>= 1). When the span is
 *   too short to meaningfully subdivide, we degrade to a single level.
 * @returns the ordered layer bands, coarsest (highest level) first.
 */
export declare function partitionLayers(messages: readonly CompactionMessage[], span: readonly [startIndex: number, endIndex: number], levels: number): readonly LayerBand[];
/**
 * Convert the design's ratios into concrete token budgets against a window.
 * @param windowTokens - the context window capacity (must be > 0).
 * @param compressionLineRatio - fraction at which raw history triggers compression.
 * @param retentionRatio - fraction of recent raw text kept verbatim.
 * @returns the absolute token budgets.
 * @throws {CompactionConfigError} when the window or ratios are unusable.
 */
export declare function resolveBudgets(windowTokens: number, compressionLineRatio: number, retentionRatio: number): {
    readonly compressionLineTokens: number;
    readonly retentionTokens: number;
};
//# sourceMappingURL=select.d.ts.map