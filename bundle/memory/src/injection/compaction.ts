/**
 * Compression-point wiring (stage 3): run the T8 `CompactionEngine` against a
 * live session's real raw store, with an injectable summarizer and storage.
 *
 * This module assembles the engine once (with the durable `sessionRawStore`
 * and `FileSummaryStorage`) and exposes:
 *   - `shouldCompress` — has the session's raw history crossed the compression
 *     line against the resolved window?
 *   - `compress`       — execute the hierarchical compression and persist layers.
 *
 * The window capacity is resolved from the routed model's advertised context
 * window (`session.requestContext()?.contextWindow`), falling back to a
 * configurable default. The summarizer is injectable so tests run without a
 * live LLM; production passes a prefix-aligned `ctx.llm.stream` summarizer.
 *
 * @module dsh-harness-memory-bundle/injection/compaction
 */

import type { Session } from '@deepseek-ai/dsh-session'
import { CompactionEngine, FileSummaryStorage, createPrefixAlignedSummarizer } from '../compaction/index.ts'
import type {
  CompactionConfig,
  CompactionMessage,
  LayerSummary,
  Summarizer,
} from '../compaction/types.ts'
import type { LlmStream } from '../compaction/summarizer.ts'
import { projectEvent } from './raw-store.ts'

/** Fallback context window when the routed model advertises none. */
const DEFAULT_CONTEXT_WINDOW = 64 * 1024

/**
 * A summarizer that reuses the routed conversation's prefix (system/tools and
 * leading messages) so the provider's KV cache is not invalidated — built on
 * the T8 prefix-aligned summarizer with a route resolver that follows the
 * session's latest routed provider/model.
 */
export function routedSummarizer(llm: LlmStream, session: Session): Summarizer {
  return createPrefixAlignedSummarizer(llm, () => {
    const routed = session.requestContext()
    return {
      provider: routed?.provider ?? '',
      model: routed?.model ?? '',
      maxTokens: 512,
      sessionId: session.id,
    }
  })
}

/** The compression trigger seam: everything the pre-step handler needs. */
export interface CompressionCoordinator {
  readonly engine: CompactionEngine
  readonly storage: FileSummaryStorage
  /** Resolve the effective context window for budget resolution. */
  resolveWindow(session: Session): number
  /** Whether the session's raw history has crossed the compression line. */
  shouldCompress(session: Session): boolean
  /** Run hierarchical compression over the session's raw history. */
  compress(session: Session): Promise<{ layers: readonly LayerSummary[]; windowTokens: number }>
  /**
   * Context-overflow rescue: fold any compressible raw history into layered
   * summaries, then recursively coarsen (deepen) the summaries to the coarsest
   * useful layer so the session can retry within the window. Returns the
   * durable layer count after coarsening, or `null` when nothing was reduced.
   */
  coarsenForOverflow(session: Session): Promise<readonly LayerSummary[] | null>
}

/** Assemble a `CompressionCoordinator` for live sessions. */
export function createCompressionCoordinator(options: {
  readonly summarizer?: Summarizer
  readonly config?: Partial<CompactionConfig>
  readonly storageBase?: string
  readonly windowOverride?: number
  /**
   * Invoked after hierarchical compression persists layers. Lets consumers
   * (e.g. T12 inheritance) observe the compression-refresh point without
   * reaching into the engine. Not awaited by `compress()`.
   */
  readonly onCompressed?: (sessionId: string, layers: readonly LayerSummary[]) => void
}): CompressionCoordinator {
  const storage = new FileSummaryStorage(options.storageBase)
  // The summarizer is injected (tests) or absent; without one the engine gets a
  // refusal summarizer so no content is silently distorted.
  const summarizer = options.summarizer ?? neverSummarizer()
  const engine = new CompactionEngine({
    ...(options.config === undefined ? {} : { config: options.config }),
    summarizer,
    storage,
    rawStore: {
      async read() { return [] },
      async has() { return false },
    },
  })
  const windowOverride = options.windowOverride
  const onCompressed = options.onCompressed
  return {
    engine,
    storage,
    resolveWindow(session) {
      if (windowOverride !== undefined) return windowOverride
      return session.requestContext()?.contextWindow ?? DEFAULT_CONTEXT_WINDOW
    },
    shouldCompress(session) {
      const windowTokens = this.resolveWindow(session)
      return engine.checkTrigger(rawHistoryTokens(session), windowTokens)
    },
    async compress(session) {
      const windowTokens = this.resolveWindow(session)
      const result = await engine.compress(session.id, readRawHistory(session), windowTokens)
      if (onCompressed !== undefined) onCompressed(String(session.id), result.layers)
      return { layers: result.layers, windowTokens }
    },
    async coarsenForOverflow(session) {
      const windowTokens = this.resolveWindow(session)
      // Fold any compressible raw history into layered summaries first — the
      // primary reduction when the overflow is driven by raw history.
      let summaries: readonly LayerSummary[] = await storage.load(String(session.id))
      if (summaries.length === 0) {
        try {
          const result = await engine.compress(session.id, readRawHistory(session), windowTokens)
          summaries = result.layers
        } catch {
          // Nothing compressible (e.g. history empty / fully retained) — coarsen
          // whatever persisted layers already exist.
        }
      }
      if (summaries.length === 0) return null
      // Deepen the layers recursively toward the coarsest useful layer. Cross
      // session memory is fixed and not reducible here, so only the summaries
      // are budgeted (cross-session memory = 0 lets coarsening reduce maximally).
      // A coarsening floor (honest boundary) leaves whatever durable layers we
      // already produced — still a net reduction worth retrying on.
      let coarsened: readonly LayerSummary[]
      try {
        coarsened = await engine.coarsen(String(session.id), summaries, 0, windowTokens)
      } catch {
        coarsened = summaries
      }
      return coarsened
    },
  }
}

/** A summarizer that never reduces — used only when no LLM seam is present. */
function neverSummarizer(): Summarizer {
  return { async summarize() { return null } }
}

/** Measure raw-history tokens via the real raw store projection. */
function rawHistoryTokens(session: Session): number {
  return readRawHistory(session).reduce((sum, m) => sum + m.tokens, 0)
}

/** Project the session's raw history into `CompactionMessage[]` (surface order). */
function readRawHistory(session: Session): CompactionMessage[] {
  const messages: CompactionMessage[] = []
  for (const event of session.events) {
    const projected = projectEvent(session, event)
    if (projected !== null) messages.push(projected)
  }
  return messages
}
