/**
 * Session-internal hierarchical compaction subsystem — public surface.
 *
 * T8 of the memory-system plan: the self-built (non-vendor) mechanism that
 * folds a session's old raw history into layered summaries (near = detailed,
 * far = coarse), keeps a recent tail verbatim, recursively coarsens when the
 * injection cap is exceeded, persists every layer, and supports the coarse←
 * fine←L0 refine (recall) chain. T9 (unified injection) and T10 (tool recall)
 * import the engine from here.
 *
 * @module dsh-harness-memory-bundle/compaction
 */
export { CompactionEngine, } from "./engine.js";
export { partitionLayers, resolveBudgets, selectCompressibleRange, isBalancedBoundary, } from "./select.js";
export { recursiveCoarsen, summaryBudget, withinCap, pickCoarsenPair, } from "./coarsen.js";
export { LlmSummarizer, createPrefixAlignedSummarizer, } from "./summarizer.js";
export { FileSummaryStorage, sanitizeSessionId, layerFileName, summariesRoot, } from "./storage.js";
export { NON_DISTILLABLE_SOURCE, SUMMARY_SOURCE_TAG, isNonDistillable, summarySourceMetadata, } from "./tag.js";
export { DEFAULT_COMPACTION_CONFIG, CoarseningFloorError, CompactionConfigError, CompactionError, LayerRecoveryError, NoCompressibleHistoryError, NoCoverageError, } from "./types.js";
//# sourceMappingURL=index.js.map