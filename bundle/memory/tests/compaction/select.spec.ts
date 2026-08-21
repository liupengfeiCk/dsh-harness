/**
 * Selection policies: compression-range selection (retention by message
 * boundary, no tool-pair split), layer partitioning (near = detailed, far =
 * coarse), and budget resolution (independent ratios).
 */

import { describe, expect, it } from 'vitest'
import {
  isBalancedBoundary,
  partitionLayers,
  resolveBudgets,
  selectCompressibleRange,
} from '../../src/compaction/select.ts'
import type { CompactionMessage } from '../../src/compaction/types.ts'
import { CompactionConfigError } from '../../src/compaction/types.ts'

function msg(seq: number, text: string, role: CompactionMessage['role'], extra?: Partial<CompactionMessage>): CompactionMessage {
  return { seq, text, tokens: text.length, role, ...extra }
}

describe('selectCompressibleRange', () => {
  it('returns null on empty history', () => {
    expect(selectCompressibleRange([], 100)).toBeNull()
  })

  it('returns null when the retention tail covers the whole history', () => {
    const messages = [msg(1, 'aaaa'), msg(2, 'bbbb')]
    // retainTokens large enough that the whole history is retained.
    expect(selectCompressibleRange(messages, 1000)).toBeNull()
  })

  it('keeps a recent tail of at least retainTokens and returns the span before it', () => {
    const messages = [
      msg(1, '111'), // 3 tokens
      msg(2, '222'), // 3
      msg(3, '333'), // 3
      msg(4, '444'), // 3
      msg(5, '555'), // 3
    ]
    // retain 6 tokens from the tail → messages 4-5 (6 tokens) kept; 1-3 compressible.
    const span = selectCompressibleRange(messages, 6)
    expect(span).not.toBeNull()
    expect(span).toEqual([0, 2])
  })

  it('backs the boundary up to keep the whole tool-call/result pair intact', () => {
    // Force equal token prices so the budget math is deterministic.
    const messages = [
      msg(1, 'user q', 'user', { tokens: 4 }),
      msg(2, 'call', 'assistant', { toolCallId: 'tc1', tokens: 4 }),
      msg(3, 'result', 'tool', { toolResultForCallId: 'tc1', tokens: 4 }),
      msg(4, 'tail', 'user', { tokens: 4 }),
    ]
    // retainTokens = 4 keeps only the last message (index 3). The naive boundary
    // before index 3 is the tool-result message (index 2), which is unbalanced, so
    // the boundary must back up past the whole pair to index 0 (user, balanced).
    // The compressible range is then just message 0, and the tool pair stays verbatim.
    const span = selectCompressibleRange(messages, 4)
    expect(span).toEqual([0, 0])
  })

  it('keeps a tool result glued to its assistant tool call in the retained tail', () => {
    const messages = [
      msg(1, 'a', 'user', { tokens: 5 }),
      msg(2, 'call', 'assistant', { toolCallId: 'tc1', tokens: 5 }),
      msg(3, 'result', 'tool', { toolResultForCallId: 'tc1', tokens: 5 }),
      msg(4, 'b', 'user', { tokens: 5 }),
      msg(5, 'c', 'user', { tokens: 5 }),
    ]
    // retainTokens = 10 accumulates messages 5 and 4 (10 tokens). The boundary
    // before index 3 is the tool-result message, so it backs up past the whole
    // tool pair to index 0 (user, balanced). The pair (messages 2-3) stays
    // verbatim in the retained tail; only message 1 is compressed.
    const span = selectCompressibleRange(messages, 10)
    expect(span).toEqual([0, 0])
  })
})

describe('isBalancedBoundary', () => {
  it('rejects a cut on a tool-result message', () => {
    const messages = [
      msg(1, 'call', 'assistant', { toolCallId: 'tc' }),
      msg(2, 'result', 'tool', { toolResultForCallId: 'tc' }),
    ]
    expect(isBalancedBoundary(messages, 1)).toBe(false)
  })

  it('rejects a cut on an assistant tool-call message', () => {
    const messages = [
      msg(1, 'call', 'assistant', { toolCallId: 'tc' }),
    ]
    expect(isBalancedBoundary(messages, 0)).toBe(false)
  })

  it('accepts a cut on an ordinary user message', () => {
    const messages = [msg(1, 'hi', 'user')]
    expect(isBalancedBoundary(messages, 0)).toBe(true)
  })
})

describe('partitionLayers', () => {
  it('degrades to a single band when the span is too short', () => {
    const messages = [msg(1, 'a', 'user'), msg(2, 'b', 'user')]
    const bands = partitionLayers(messages, [0, 1], 3)
    expect(bands).toHaveLength(1)
    expect(bands[0]).toEqual({ startIndex: 0, endIndex: 1, tokens: 2 })
  })

  it('produces progressively coarser bands toward the far end', () => {
    const messages = Array.from({ length: 12 }, (_, i) => msg(i + 1, 'x', 'user'))
    const bands = partitionLayers(messages, [0, 11], 3)
    expect(bands).toHaveLength(3)
    // Total covered span must be [0,11].
    expect(bands[0]!.startIndex).toBe(0)
    expect(bands[2]!.endIndex).toBe(11)
    // Bands are contiguous and non-overlapping.
    expect(bands[0]!.endIndex + 1).toBe(bands[1]!.startIndex)
    expect(bands[1]!.endIndex + 1).toBe(bands[2]!.startIndex)
  })

  it('throws on an empty span', () => {
    expect(() => partitionLayers([], [0, -1], 2)).toThrow()
  })
})

describe('resolveBudgets', () => {
  it('computes independent budgets from the window and ratios', () => {
    const { compressionLineTokens, retentionTokens } = resolveBudgets(1000, 0.8, 0.16)
    expect(compressionLineTokens).toBe(800)
    expect(retentionTokens).toBe(160)
  })

  it('rejects a non-positive window', () => {
    expect(() => resolveBudgets(0, 0.8, 0.16)).toThrow(CompactionConfigError)
  })

  it('rejects retention above the compression line', () => {
    expect(() => resolveBudgets(1000, 0.5, 0.6)).toThrow(CompactionConfigError)
  })

  it('rejects an out-of-range compression ratio', () => {
    expect(() => resolveBudgets(1000, 1.2, 0.1)).toThrow(CompactionConfigError)
  })
})
