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

import type {
  CompactionConfig,
  CompactionMessage,
  LayerSummary,
  RawStore,
  Summarizer,
  SummaryStorage,
} from './types.ts'
import { NoCompressibleHistoryError, NoCoverageError } from './types.ts'
import {
  partitionLayers,
  resolveBudgets,
  selectCompressibleRange,
} from './select.ts'
import { recursiveCoarsen, withinCap } from './coarsen.ts'
import { DEFAULT_COMPACTION_CONFIG } from './types.ts'

/** The result of one compression pass over a raw span. */
export interface CompressionResult {
  /** The produced summary layers, ordered by level ascending. */
  readonly layers: readonly LayerSummary[]
  /** The raw seq range that was folded into summaries. */
  readonly compressedRange: readonly [start: number, end: number]
  /** Total tokens retained verbatim in the recent tail. */
  readonly retainedTokens: number
}

/** Public engine surface. */
export interface CompactionEngineLike {
  checkTrigger(historyTokens: number, windowTokens: number): boolean
  compress(sessionId: string, history: readonly CompactionMessage[], windowTokens: number): Promise<CompressionResult>
  coarsen(sessionId: string, summaries: readonly LayerSummary[], crossSessionMemoryTokens: number, windowTokens: number): Promise<LayerSummary[]>
  retrieve(sessionId: string, seq: number): Promise<LayerSummary[]>
}

/** Constructor inputs: config + injected seams. */
export interface CompactionEngineDeps {
  readonly config?: Partial<CompactionConfig>
  readonly summarizer: Summarizer
  readonly storage: SummaryStorage
  readonly rawStore: RawStore
}

/**
 * Plain-object engine over injected seams.
 */
export class CompactionEngine implements CompactionEngineLike {
  readonly config: CompactionConfig

  constructor(private readonly deps: CompactionEngineDeps) {
    this.config = { ...DEFAULT_COMPACTION_CONFIG, ...deps.config }
  }

  /** The absolute injection cap tokens for a given window. */
  injectionCapTokens(windowTokens: number): number {
    return Math.floor(windowTokens * this.config.injectionCapRatio)
  }

  /**
   * Whether raw history has crossed the compression line.
   * @param historyTokens - current raw-history token count.
   * @param windowTokens  - context window capacity.
   */
  checkTrigger(historyTokens: number, windowTokens: number): boolean {
    const { compressionLineTokens } = resolveBudgets(
      windowTokens,
      this.config.compressionLineRatio,
      this.config.retentionRatio,
    )
    return historyTokens >= compressionLineTokens
  }

  /**
   * Compress old raw history into layered summaries (near = detailed, far =
   * coarse), retaining a recent tail verbatim, and persist every layer.
   * @param sessionId - the session's id (also its storage key).
   * @param history   - the session's ordered raw messages (surface order).
   * @param windowTokens - context window capacity for budget resolution.
   * @returns the produced layers and the compressed/retained split.
   */
  async compress(
    sessionId: string,
    history: readonly CompactionMessage[],
    windowTokens: number,
  ): Promise<CompressionResult> {
    const { retentionTokens } = resolveBudgets(
      windowTokens,
      this.config.compressionLineRatio,
      this.config.retentionRatio,
    )
    const span = selectCompressibleRange(history, retentionTokens)
    if (span === null) {
      throw new NoCompressibleHistoryError('no compressible raw span (history empty or fully retained)')
    }
    const levels = this.config.maxLevel ?? defaultLevels(span)
    const bands = partitionLayers(history, span, levels)

    // Produce one summary layer per band, from the coarsest (far) to the
    // finest (near). Each band becomes a summary at a distinct level.
    const layers: LayerSummary[] = []
    for (let index = 0; index < bands.length; index += 1) {
      const band = bands[index]!
      const bandMessages = history.slice(band.startIndex, band.endIndex + 1)
      const produced = await this.deps.summarizer.summarize(
        {
          range: [bandMessages[0]!.seq, bandMessages[bandMessages.length - 1]!.seq],
          messages: bandMessages,
        },
        // Finer bands (near end, later in the partition) get higher levels.
        index + 1,
      )
      if (produced === null) continue
      const layer: LayerSummary = {
        level: index + 1,
        range: [bandMessages[0]!.seq, bandMessages[bandMessages.length - 1]!.seq],
        text: produced.text,
        tokens: produced.tokens,
        generatedAt: new Date().toISOString(),
        ...(produced.model === undefined ? {} : { model: produced.model }),
        nonDistillable: true,
      }
      layers.push(layer)
      await this.deps.storage.save(sessionId, layer)
    }

    const compressedRange: [number, number] = [
      history[0]!.seq,
      history[Math.max(0, span[1])]!.seq,
    ]
    return {
      layers,
      compressedRange,
      retainedTokens: retentionTokens,
    }
  }

  /**
   * Recursively coarsen summaries so summaries + cross-session memory fit the
   * injection cap, persisting any merged layers.
   * @throws {CoarseningFloorError} when the coarsest layer still exceeds the cap.
   */
  async coarsen(
    sessionId: string,
    summaries: readonly LayerSummary[],
    crossSessionMemoryTokens: number,
    windowTokens: number,
  ): Promise<LayerSummary[]> {
    const cap = this.injectionCapTokens(windowTokens)
    // Only summaries contribute to the budget that can be reduced; cross-session
    // memory is fixed. So the summaries themselves must fit (cap - memory).
    const summaryCap = Math.max(0, cap - crossSessionMemoryTokens)
    if (withinCap(summaries, summaryCap)) return [...summaries]
    const coarsened = await recursiveCoarsen(summaries, summaryCap, this.deps.summarizer)
    // Persist the changed set (idempotent re-save).
    await this.deps.storage.clear(sessionId)
    for (const layer of coarsened) await this.deps.storage.save(sessionId, layer)
    return coarsened
  }

  /**
   * Retrieve the finest stored summary layers covering the message at `seq` —
   * the coarse→fine→L0 refine (recall) chain entry point.
   * @returns layers covering `seq`, ordered by level descending (finest first).
   * @throws {NoCoverageError} when no layer covers the requested seq.
   */
  async retrieve(sessionId: string, seq: number): Promise<LayerSummary[]> {
    const layers = await this.deps.storage.load(sessionId)
    const covering = layers
      .filter((layer) => layer.range[0] <= seq && seq <= layer.range[1])
      .sort((a, b) => b.level - a.level)
    if (covering.length === 0) {
      throw new NoCoverageError(`no summary layer covers seq ${seq} in session ${sessionId}`)
    }
    return covering
  }
}

/** Default layer count: grows with span size, capped for stability. */
function defaultLevels(span: readonly [number, number]): number {
  const count = span[1] - span[0] + 1
  if (count <= 2) return 1
  if (count <= 8) return 2
  if (count <= 24) return 3
  return 4
}
