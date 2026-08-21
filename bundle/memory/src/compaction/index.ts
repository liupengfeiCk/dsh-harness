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

export {
  CompactionEngine,
  type CompactionEngineDeps,
  type CompactionEngineLike,
  type CompressionResult,
} from './engine.ts'

export {
  partitionLayers,
  resolveBudgets,
  selectCompressibleRange,
  isBalancedBoundary,
  type LayerBand,
} from './select.ts'

export {
  recursiveCoarsen,
  summaryBudget,
  withinCap,
  pickCoarsenPair,
} from './coarsen.ts'

export {
  LlmSummarizer,
  createPrefixAlignedSummarizer,
  type LlmStream,
} from './summarizer.ts'

export {
  FileSummaryStorage,
  sanitizeSessionId,
  layerFileName,
  summariesRoot,
} from './storage.ts'

export {
  NON_DISTILLABLE_SOURCE,
  SUMMARY_SOURCE_TAG,
  isNonDistillable,
  summarySourceMetadata,
} from './tag.ts'

export {
  DEFAULT_COMPACTION_CONFIG,
  CoarseningFloorError,
  CompactionConfigError,
  CompactionError,
  LayerRecoveryError,
  NoCompressibleHistoryError,
  NoCoverageError,
  type CompactionConfig,
  type CompactionMessage,
  type LayerSummary,
  type RawSpan,
  type RawStore,
  type Summarizer,
  type SummaryStorage,
} from './types.ts'
