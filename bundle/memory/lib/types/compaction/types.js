/**
 * Session-internal hierarchical compaction subsystem — shared types, data
 * model, and the injected dependency interfaces.
 *
 * This is the self-built (non-vendor) compaction mechanism for §4.3 of the
 * memory-system design: when the session's raw history crosses the compression
 * line, the old raw text is folded into layered summaries (near = detailed,
 * far = coarse). The summaries plus cross-session memory share one injection
 * cap; when that cap is hit, summaries are recursively coarsened — information
 * is never dropped, only granularity is lost. Each layer is persisted so a
 * resumed session can reuse it and a coarser layer can be refined back from
 * storage.
 *
 * The core is intentionally a PURE data model over plain message/token data
 * (no cordis/Session runtime), so every policy is unit-testable in isolation.
 * The volatile seam (an LLM summarizer) and the durable seams (summary storage,
 * raw-text store) are injected interfaces.
 *
 * @module dsh-harness-memory-bundle/compaction/types
 */
/** Defaults per the design (independent ratios, no mutual derivation). */
export const DEFAULT_COMPACTION_CONFIG = {
    compressionLineRatio: 0.8,
    retentionRatio: 0.16,
    injectionCapRatio: 0.2,
};
/** Domain errors thrown by the compaction subsystem. */
export class CompactionError extends Error {
}
/** A config ratio is out of range or a window/context is unusable. */
export class CompactionConfigError extends CompactionError {
}
/** The compaction engine is asked to operate on an empty or invalid history. */
export class NoCompressibleHistoryError extends CompactionError {
}
/** A persisted layer could not be recovered (missing/corrupt), non-fatal. */
export class LayerRecoveryError extends CompactionError {
}
/** A requested raw/summary retrieval range has no stored coverage. */
export class NoCoverageError extends CompactionError {
}
/**
 * Honest-boundary signal: summaries reached the coarsest useful layer but
 * still exceed the injection cap. Per §4.3 we stop and rely on L0 storage plus
 * the refine (recall) chain rather than distorting further.
 */
export class CoarseningFloorError extends CompactionError {
    remainingTokens;
    capTokens;
    constructor(
    /** The projected token count that still exceeds the cap. */
    remainingTokens, 
    /** The cap the remaining tokens were measured against. */
    capTokens) {
        super(`coarsening floor reached with ${remainingTokens} tokens still above the ${capTokens} injection cap; `
            + 'rely on L0 storage and the refine chain instead of further distortion');
        this.remainingTokens = remainingTokens;
        this.capTokens = capTokens;
    }
}
//# sourceMappingURL=types.js.map