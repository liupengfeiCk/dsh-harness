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

/** A model-visible message the compaction engine reasons about. */
export interface CompactionMessage {
  /**
   * Durable sequence number, unique and increasing across the session.
   * Used as the immutable coordinate for covered ranges and persistence.
   */
  readonly seq: number
  /** Heuristic token price of this exact message. */
  readonly tokens: number
  /** Raw text to be condensed (or kept verbatim in the retained tail). */
  readonly text: string
  /** Message kind used to keep tool-call/result pairs intact on boundaries. */
  readonly role: 'user' | 'assistant' | 'tool'
  /**
   * When present, this assistant message is a tool call and
   * `toolResultSeq` names the tool-result message it must stay paired with.
   */
  readonly toolCallId?: string
  /** When present, this tool message answers the assistant call with this id. */
  readonly toolResultForCallId?: string
}

/**
 * One persisted (or in-memory) layer of the hierarchical summary covering a
 * contiguous span of the session's raw history. `level` 0 is the raw original
 * text (L0); higher levels are progressively coarser condensations.
 */
export interface LayerSummary {
  /** Absolute layer depth: 0 = raw original, 1 = first condensation, ... */
  readonly level: number
  /** Inclusive raw-message seq span this layer represents. */
  readonly range: readonly [start: number, end: number]
  /** The layer's own content (raw text at level 0, summary text above). */
  readonly text: string
  /** Heuristic token price of this layer's content. */
  readonly tokens: number
  /** ISO-8601 timestamp of when this layer was produced. */
  readonly generatedAt: string
  /** Provider/model that produced this layer, when known. */
  readonly model?: string
  /** True when the content must not be re-distilled by an async pipeline. */
  readonly nonDistillable: boolean
}

/**
 * A view of one compactable raw span together with its current raw text.
 * The engine reads raw history through this to build summarization input.
 */
export interface RawSpan {
  /** Inclusive message seq span of the raw history. */
  readonly range: readonly [start: number, end: number]
  /** The ordered raw messages in the span, in surface order. */
  readonly messages: readonly CompactionMessage[]
}

/** Injected summarizer seam: turns a raw/summary span into a summary layer. */
export interface Summarizer {
  /**
   * Condense `span` into a summary layer one level coarser than `fromLevel`.
   * Implementations may reuse the real request's prefix (system/tools) so the
   * provider KV cache is not invalidated. May return `null` to signal that no
   * meaningful reduction was possible.
   */
  summarize(
    span: RawSpan,
    fromLevel: number,
    ctx?: { readonly system?: string; readonly tools?: unknown },
  ): Promise<Pick<LayerSummary, 'text' | 'tokens' | 'model'> | null>
}

/** Durable seam for reading the session's raw original history (L0). */
export interface RawStore {
  /** Read the ordered raw messages covering `range` (inclusive). */
  read(range: readonly [start: number, end: number]): Promise<readonly CompactionMessage[]>
  /** Whether any raw history exists at or below `seq`. */
  has(seq: number): Promise<boolean>
}

/** Durable seam for persisting and recovering summary layers. */
export interface SummaryStorage {
  /** Persist one summary layer for `sessionId`. */
  save(sessionId: string, layer: LayerSummary): Promise<void>
  /** Load all persisted layers for `sessionId`, ordered by level ascending. */
  load(sessionId: string): Promise<LayerSummary[]>
  /** Delete all layers for `sessionId` (used when history is reset). */
  clear(sessionId: string): Promise<void>
}

/** Compactable configuration, all ratios independent (user-decided). */
export interface CompactionConfig {
  /**
   * Fraction of the context window at which raw history triggers compaction.
   * Default 0.80 (compression line).
   */
  readonly compressionLineRatio: number
  /**
   * Fraction of the window of recent raw text kept verbatim when compressing.
   * Default 0.16 (retention line). Cuts only at message boundaries.
   */
  readonly retentionRatio: number
  /**
   * Fraction of the window that layered summaries + cross-session memory may
   * occupy (the unified injection cap). Default 0.20. Recursive coarsening
   * keeps summaries under this when combined with cross-session memory.
   */
  readonly injectionCapRatio: number
  /**
   * Optional maximum layer depth. `undefined` allows unbounded coarsening up
   * to the honest-boundary floor.
   */
  readonly maxLevel?: number
}

/** Defaults per the design (independent ratios, no mutual derivation). */
export const DEFAULT_COMPACTION_CONFIG: CompactionConfig = {
  compressionLineRatio: 0.8,
  retentionRatio: 0.16,
  injectionCapRatio: 0.2,
}

/** Domain errors thrown by the compaction subsystem. */
export class CompactionError extends Error {}

/** A config ratio is out of range or a window/context is unusable. */
export class CompactionConfigError extends CompactionError {}

/** The compaction engine is asked to operate on an empty or invalid history. */
export class NoCompressibleHistoryError extends CompactionError {}

/** A persisted layer could not be recovered (missing/corrupt), non-fatal. */
export class LayerRecoveryError extends CompactionError {}

/** A requested raw/summary retrieval range has no stored coverage. */
export class NoCoverageError extends CompactionError {}

/**
 * Honest-boundary signal: summaries reached the coarsest useful layer but
 * still exceed the injection cap. Per §4.3 we stop and rely on L0 storage plus
 * the refine (recall) chain rather than distorting further.
 */
export class CoarseningFloorError extends CompactionError {
  constructor(
    /** The projected token count that still exceeds the cap. */
    public readonly remainingTokens: number,
    /** The cap the remaining tokens were measured against. */
    public readonly capTokens: number,
  ) {
    super(
      `coarsening floor reached with ${remainingTokens} tokens still above the ${capTokens} injection cap; `
      + 'rely on L0 storage and the refine chain instead of further distortion',
    )
  }
}
