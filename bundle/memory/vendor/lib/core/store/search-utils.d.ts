/**
 * Search utilities — shared helpers for memory search across backends.
 *
 * Contains:
 * - RRF (Reciprocal Rank Fusion) merge — used by SQLite hybrid search
 *   (eliminates the 3x duplication in auto-recall, memory-search, conversation-search)
 * - FTS query building — re-exported from sqlite for convenience
 */
/**
 * Standard RRF constant from the original RRF paper.
 * Higher k → more weight on lower-ranked items (smoother distribution).
 */
export declare const RRF_K = 60;
/**
 * Merge multiple ranked lists via Reciprocal Rank Fusion.
 *
 * Each item's RRF score = sum over all lists of 1/(k + rank + 1).
 * Items appearing in multiple lists get their scores summed.
 *
 * @param lists   Array of ranked lists. Each list must have items with an `id` field.
 * @param k       RRF constant (default: 60).
 * @returns       Merged list sorted by descending RRF score, with `rrfScore` attached.
 *
 * @example
 * ```ts
 * const merged = rrfMerge(
 *   [ftsResults, vecResults],
 *   (item) => item.record_id,
 * );
 * ```
 */
export declare function rrfMerge<T>(lists: T[][], getId: (item: T) => string, k?: number): Array<T & {
    rrfScore: number;
}>;
