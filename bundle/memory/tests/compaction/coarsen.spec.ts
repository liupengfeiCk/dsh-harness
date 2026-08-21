/**
 * Recursive coarsening: merging the finest summary into the next coarser one
 * until the summaries budget fits the injection cap, and the honest
 * `CoarseningFloorError` when the coarsest layer still exceeds the cap.
 */

import { describe, expect, it } from 'vitest'
import { pickCoarsenPair, recursiveCoarsen, summaryBudget, withinCap } from '../../src/compaction/coarsen.ts'
import { CoarseningFloorError, type LayerSummary, type Summarizer } from '../../src/compaction/types.ts'

function layer(level: number, range: [number, number], tokens: number, text = `L${level}`): LayerSummary {
  return { level, range, text, tokens, generatedAt: '2026-01-01T00:00:00.000Z', nonDistillable: true }
}

/** A summarizer that halves tokens on merge, refusing below 1. */
const halvingSummarizer: Summarizer = {
  async summarize(span, fromLevel) {
    const base = span.messages.reduce((sum, m) => sum + m.tokens, 0)
    const tokens = Math.max(1, Math.floor(base / 2))
    return { text: `merged L${fromLevel}`, tokens, model: 'test' }
  },
}

describe('summaryBudget / withinCap', () => {
  it('sums layer tokens', () => {
    expect(summaryBudget([layer(1, [1, 3], 10), layer(2, [1, 3], 4)])).toBe(14)
  })

  it('withinCap compares against the cap', () => {
    expect(withinCap([layer(1, [1, 1], 5)], 10)).toBe(true)
    expect(withinCap([layer(1, [1, 1], 15)], 10)).toBe(false)
  })
})

describe('pickCoarsenPair', () => {
  it('returns null with fewer than two layers', () => {
    expect(pickCoarsenPair([layer(1, [1, 2], 5)])).toBeNull()
    expect(pickCoarsenPair([])).toBeNull()
  })

  it('selects the finest condensation and its next-coarser layer', () => {
    const layers = [layer(1, [1, 4], 20), layer(2, [1, 4], 8)]
    const pair = pickCoarsenPair(layers)
    expect(pair).toEqual([0, 1])
  })
})

describe('recursiveCoarsen', () => {
  it('returns the input unchanged when already within cap', async () => {
    const layers = [layer(1, [1, 4], 5)]
    const result = await recursiveCoarsen(layers, 10, halvingSummarizer)
    expect(result).toHaveLength(1)
    expect(result[0]!.text).toBe('L1')
  })

  it('merges the finest layer into the coarser one until within cap', async () => {
    // 3 layers, total 14 tokens, cap 7 → must merge.
    const layers = [layer(1, [1, 4], 6), layer(2, [1, 4], 4), layer(3, [1, 4], 4)]
    const result = await recursiveCoarsen(layers, 7, halvingSummarizer)
    expect(summaryBudget(result)).toBeLessThanOrEqual(7)
    // The merge happened: fewer layers remain.
    expect(result.length).toBeLessThan(3)
    // Every surviving layer is non-distillable.
    for (const l of result) expect(l.nonDistillable).toBe(true)
  })

  it('throws CoarseningFloorError when the coarsest layer still exceeds the cap', async () => {
    // Single layer of 50 tokens, cap 10, but summarizer refuses (returns null
    // would make progress by dropping, but a single coarse layer of 50 > cap).
    const single = [layer(1, [1, 4], 50)]
    await expect(recursiveCoarsen(single, 10, halvingSummarizer)).rejects.toThrow(CoarseningFloorError)
  })

  it('throws CoarseningFloorError when merging cannot reduce below the cap', async () => {
    // Two layers whose merged floor is still above the cap.
    const layers = [layer(1, [1, 4], 40), layer(2, [1, 4], 40)]
    const cap = 5
    // First merge: 40+40=80 → halve to 40. Still >5, no finer pair left → floor.
    await expect(recursiveCoarsen(layers, cap, halvingSummarizer)).rejects.toThrow(CoarseningFloorError)
  })

  it('throws CoarseningFloorError when the summarizer refuses every merge', async () => {
    const refusing: Summarizer = {
      async summarize() {
        return null // refuse every merge — no layer may be reduced
      },
    }
    const layers = [layer(1, [1, 4], 8), layer(2, [1, 4], 8)]
    // No pair can be coarsened and the budget still exceeds the cap → honest floor.
    await expect(recursiveCoarsen(layers, 5, refusing)).rejects.toThrow(CoarseningFloorError)
  })
})
