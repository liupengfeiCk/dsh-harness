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

import type { CompactionMessage } from './types.ts'
import { CompactionConfigError, NoCompressibleHistoryError } from './types.ts'

/** Whether `messages[index]` is a safe cut: it does not split a tool pair. */
export function isBalancedBoundary(
  messages: readonly CompactionMessage[],
  index: number,
): boolean {
  if (index < 0 || index >= messages.length) return false
  const message = messages[index]!
  // A tool-result message must stay glued to its assistant tool call.
  if (message.role === 'tool' && message.toolResultForCallId !== undefined) return false
  // An assistant tool call must stay glued to its tool result.
  if (message.role === 'assistant' && message.toolCallId !== undefined) return false
  return true
}

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
export function selectCompressibleRange(
  messages: readonly CompactionMessage[],
  retainTokens: number,
): readonly [startIndex: number, endIndex: number] | null {
  if (messages.length === 0) return null
  // Accumulate retained tail tokens from the end.
  let accumulated = 0
  let keepFromIndex = messages.length
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    accumulated += messages[index]!.tokens
    keepFromIndex = index
    if (accumulated >= retainTokens) break
  }
  // Everything is retained (retention covers the head) → nothing to compress.
  if (keepFromIndex === 0) return null

  // Back the boundary up to a balanced cut so a tool pair is never split.
  while (keepFromIndex > 0 && !isBalancedBoundary(messages, keepFromIndex - 1)) {
    keepFromIndex -= 1
  }
  // The whole retained history is one indivisible block → nothing to compress.
  if (keepFromIndex === 0) return null

  const startIndex = 0
  const endIndex = keepFromIndex - 1
  if (startIndex > endIndex) return null
  return [startIndex, endIndex]
}

/** One partition band: a contiguous inclusive message-index slice and its total tokens. */
export interface LayerBand {
  readonly startIndex: number
  readonly endIndex: number
  readonly tokens: number
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
export function partitionLayers(
  messages: readonly CompactionMessage[],
  span: readonly [startIndex: number, endIndex: number],
  levels: number,
): readonly LayerBand[] {
  const [startIndex, endIndex] = span
  const count = endIndex - startIndex + 1
  if (count <= 0) throw new NoCompressibleHistoryError('cannot partition an empty span')
  const effectiveLevels = Math.max(1, Math.floor(levels))
  if (effectiveLevels === 1 || count <= effectiveLevels) {
    // Degrade to a single band covering the whole span.
    const tokens = sliceTokens(messages, startIndex, endIndex)
    return [{ startIndex, endIndex, tokens }]
  }

  // Distribute bands: coarsest band gets the far-end chunk, then each finer
  // band gets a progressively smaller chunk until the near end is left to the
  // finest single-message band. Use a geometric-ish split favoring more bands
  // near the end.
  const bands: LayerBand[] = []
  let cursor = startIndex
  // We produce `effectiveLevels` bands. The finest band (last) is the single
  // near-end message; every prior band is a contiguous coarser slice.
  for (let band = 0; band < effectiveLevels - 1; band += 1) {
    const remainingBands = effectiveLevels - band - 1
    // Remaining messages after reserving one for each not-yet-allocated finer band.
    const remaining = endIndex - cursor + 1 - remainingBands
    if (remaining <= 0) break
    // First (coarsest) band spans a larger share; later bands shrink.
    const share = Math.max(1, Math.ceil(remaining / (remainingBands + 1)))
    const bandEnd = cursor + share - 1
    bands.push({ startIndex: cursor, endIndex: bandEnd, tokens: sliceTokens(messages, cursor, bandEnd) })
    cursor = bandEnd + 1
  }
  // The near-end finest band.
  if (cursor <= endIndex) {
    bands.push({ startIndex: cursor, endIndex, tokens: sliceTokens(messages, cursor, endIndex) })
  }
  return bands
}

/** Sum message tokens over an inclusive index range. */
function sliceTokens(messages: readonly CompactionMessage[], startIndex: number, endIndex: number): number {
  let total = 0
  for (let index = startIndex; index <= endIndex; index += 1) total += messages[index]!.tokens
  return total
}

/**
 * Convert the design's ratios into concrete token budgets against a window.
 * @param windowTokens - the context window capacity (must be > 0).
 * @param compressionLineRatio - fraction at which raw history triggers compression.
 * @param retentionRatio - fraction of recent raw text kept verbatim.
 * @returns the absolute token budgets.
 * @throws {CompactionConfigError} when the window or ratios are unusable.
 */
export function resolveBudgets(
  windowTokens: number,
  compressionLineRatio: number,
  retentionRatio: number,
): { readonly compressionLineTokens: number; readonly retentionTokens: number } {
  if (!Number.isFinite(windowTokens) || windowTokens <= 0) {
    throw new CompactionConfigError(`context window must be a positive finite number, got ${windowTokens}`)
  }
  if (!Number.isFinite(compressionLineRatio) || compressionLineRatio <= 0 || compressionLineRatio > 1) {
    throw new CompactionConfigError(`compressionLineRatio must be in (0,1], got ${compressionLineRatio}`)
  }
  if (!Number.isFinite(retentionRatio) || retentionRatio < 0 || retentionRatio > 1) {
    throw new CompactionConfigError(`retentionRatio must be in [0,1], got ${retentionRatio}`)
  }
  if (retentionRatio > compressionLineRatio) {
    throw new CompactionConfigError(
      `retentionRatio (${retentionRatio}) must not exceed compressionLineRatio (${compressionLineRatio})`,
    )
  }
  return {
    compressionLineTokens: Math.floor(windowTokens * compressionLineRatio),
    retentionTokens: Math.floor(windowTokens * retentionRatio),
  }
}
