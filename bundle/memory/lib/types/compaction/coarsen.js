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
import { CoarseningFloorError, } from "./types.js";
/** Projected total token budget of the summaries the engine would present. */
export function summaryBudget(layers) {
    return layers.reduce((total, layer) => total + layer.tokens, 0);
}
/**
 * Select the two layers to coarsen: the finest condensation and the one
 * immediately coarser. Returns `null` when fewer than two summary layers exist
 * or when the only candidates are raw level-0 content (raw is never coarsened).
 * @param layers - current summary layers, ordered by level ascending.
 * @param excludedCoarse - coarse-layer indexes already known un-mergeable.
 * @returns the [fineIndex, coarseIndex] pair to merge, or `null`.
 */
export function pickCoarsenPair(layers, excludedCoarse) {
    if (layers.length < 2)
        return null;
    // Walk from the end toward the front, skipping coarse indexes we already know
    // cannot be coarsened (a refused prior attempt).
    let coarseIndex = layers.length - 1;
    while (coarseIndex >= 1 && excludedCoarse?.has(coarseIndex))
        coarseIndex -= 1;
    if (coarseIndex < 1)
        return null;
    // Find the finest condensation (highest-level) non-raw layer below the coarse.
    let fineIndex = coarseIndex - 1;
    while (fineIndex >= 0 && layers[fineIndex].level === 0)
        fineIndex -= 1;
    if (fineIndex < 0)
        return null;
    // We never coarsen raw level-0 content into a summary — raw stays raw.
    if (layers[coarseIndex].level === 0)
        return null;
    return [fineIndex, coarseIndex];
}
/**
 * Whether the combined summaries budget is within `capTokens`.
 */
export function withinCap(summaries, capTokens) {
    return summaryBudget(summaries) <= capTokens;
}
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
export async function recursiveCoarsen(layers, capTokens, summarize) {
    let current = [...layers];
    if (withinCap(current, capTokens))
        return current;
    // Coarse-layer indexes that refused a merge this round; cleared on a success.
    let refusedCoarse = new Set();
    for (;;) {
        if (withinCap(current, capTokens))
            return current;
        const pair = pickCoarsenPair(current, refusedCoarse);
        if (pair === null) {
            // Honest boundary: no mergeable summary pair remains; stop and signal.
            throw new CoarseningFloorError(summaryBudget(current), capTokens);
        }
        const [fineIndex, coarseIndex] = pair;
        const fine = current[fineIndex];
        const coarse = current[coarseIndex];
        const mergedRange = [
            Math.min(fine.range[0], coarse.range[0]),
            Math.max(fine.range[1], coarse.range[1]),
        ];
        const mergedLevel = Math.max(fine.level, coarse.level);
        const span = materializeSpan(fine, coarse);
        const produced = await summarize.summarize(span, mergedLevel);
        const combinedTokens = fine.tokens + coarse.tokens;
        if (produced === null || produced.tokens >= combinedTokens) {
            // The summarizer could not make this pair genuinely smaller — do not drop
            // any layer (information must not be lost); mark the pair and try the next
            // coarser one.
            refusedCoarse.add(coarseIndex);
            continue;
        }
        const mergedLayer = {
            level: mergedLevel,
            range: mergedRange,
            text: produced.text,
            tokens: produced.tokens,
            generatedAt: new Date().toISOString(),
            ...(produced.model === undefined ? {} : { model: produced.model }),
            nonDistillable: true,
        };
        // Replace both layers with the single merged one.
        current.splice(coarseIndex, 1);
        current.splice(fineIndex, 1);
        current.push(mergedLayer);
        current.sort((a, b) => a.level - b.level);
        // A fresh merged layer may itself be coarsenable again; reset the refusal set.
        refusedCoarse = new Set();
    }
}
/**
 * Materialize the raw messages covered by two layers as a single raw span for
 * re-condensation, by feeding the summarizer the two prior summaries so the
 * coarsening is itself a re-condensation of prior summaries.
 */
function materializeSpan(fine, coarse) {
    const range = [
        Math.min(fine.range[0], coarse.range[0]),
        Math.max(fine.range[1], coarse.range[1]),
    ];
    return {
        range,
        messages: [
            { seq: fine.range[0], tokens: fine.tokens, text: fine.text, role: 'user' },
            { seq: coarse.range[0], tokens: coarse.tokens, text: coarse.text, role: 'user' },
        ],
    };
}
//# sourceMappingURL=coarsen.js.map