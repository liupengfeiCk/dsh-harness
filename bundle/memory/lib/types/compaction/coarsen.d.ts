/**
 * Recursive coarsening: when layered summaries plus cross-session memory exceed
 * the unified injection cap, merge the finest summary layer into the next
 * coarser one — information is never dropped, only granularity is lost.
 *
 * Pure over `LayerSummary` data. Coarsening merges adjacent layers by joining
 * their covered ranges and delegating the actual re-condensation to an injected
 * `Summarizer`. A pair is merged only when the summarizer produces a genuinely
 * smaller layer; otherwise that pair is skipped for the next-coarser one. When
 * no further meaningful coarsening is possible yet the cap is still exceeded,
 * we throw `CoarseningFloorError` — the honest §4.3 boundary, after which the
 * caller relies on L0 storage plus the refine chain.
 *
 * @module dsh-harness-memory-bundle/compaction/coarsen
 */
import { type LayerSummary, type Summarizer } from './types.ts';
/** Projected total token budget of the summaries the engine would present. */
export declare function summaryBudget(layers: readonly LayerSummary[]): number;
/**
 * Select the two layers to coarsen: the finest condensation and the one
 * immediately coarser. Returns `null` when fewer than two summary layers exist
 * or when the only candidates are raw level-0 content (raw is never coarsened).
 * @param layers - current summary layers, ordered by level ascending.
 * @param excludedCoarse - coarse-layer indexes already known un-mergeable.
 * @returns the [fineIndex, coarseIndex] pair to merge, or `null`.
 */
export declare function pickCoarsenPair(layers: readonly LayerSummary[], excludedCoarse?: ReadonlySet<number>): readonly [fineIndex: number, coarseIndex: number] | null;
/**
 * Whether the combined summaries budget is within `capTokens`.
 */
export declare function withinCap(summaries: readonly LayerSummary[], capTokens: number): boolean;
/**
 * Recursively coarsen until the summaries budget fits `capTokens`, or no
 * mergeable pair remains.
 *
 * @param layers - current summary layers, ordered by level ascending.
 * @param capTokens - the unified injection cap (summary + cross-session memory).
 * @param summarize - injected re-condensation seam.
 * @returns the coarsened layers ordered by level ascending.
 * @throws {CoarseningFloorError} when the coarsest layer still exceeds the cap.
 */
export declare function recursiveCoarsen(layers: readonly LayerSummary[], capTokens: number, summarize: Summarizer): Promise<LayerSummary[]>;
//# sourceMappingURL=coarsen.d.ts.map