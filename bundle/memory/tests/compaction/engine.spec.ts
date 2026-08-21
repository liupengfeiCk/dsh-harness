/**
 * Engine end-to-end over injected seams: compression trigger, hierarchical
 * layer production + persistence, recursive coarsening under the injection cap,
 * and the refine (recall) retrieval interface.
 */

import { describe, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CompactionEngine } from '../../src/compaction/engine.ts'
import { FileSummaryStorage } from '../../src/compaction/storage.ts'
import {
  NoCompressibleHistoryError,
  NoCoverageError,
  type CompactionMessage,
  type RawStore,
  type Summarizer,
} from '../../src/compaction/types.ts'

function msg(seq: number, text: string, role: CompactionMessage['role'] = 'user'): CompactionMessage {
  return { seq, text, tokens: 4, role }
}

/** Deterministic summarizer: emits a short summary for any span. */
const terseSummarizer: Summarizer = {
  async summarize(span, level) {
    const [start, end] = span.range
    const tokens = Math.max(1, Math.ceil((end - start + 1) / 2))
    return { text: `summary<${start}-${end}>L${level}`, tokens, model: 'test' }
  },
}

/** Raw store backed by a fixed in-memory history map. */
function rawStoreOf(history: readonly CompactionMessage[]): RawStore {
  return {
    async read(range) {
      return history.filter((m) => m.seq >= range[0] && m.seq <= range[1])
    },
    async has(seq) {
      return history.some((m) => m.seq <= seq)
    },
  }
}

async function makeEngine(history: readonly CompactionMessage[], config?: { injectionCapRatio?: number }) {
  const base = await mkdtemp(join(tmpdir(), 'dsh-mem-engine-'))
  const engine = new CompactionEngine({
    config,
    summarizer: terseSummarizer,
    storage: new FileSummaryStorage(base),
    rawStore: rawStoreOf(history),
  })
  return { engine, base }
}

describe('CompactionEngine.checkTrigger', () => {
  it('crosses the compression line at the configured ratio', async () => {
    const { engine, base } = await makeEngine([])
    try {
      // window 1000 → compression line 800.
      expect(engine.checkTrigger(799, 1000)).toBe(false)
      expect(engine.checkTrigger(800, 1000)).toBe(true)
    } finally {
      await rm(base, { recursive: true, force: true })
    }
  })
})

describe('CompactionEngine.compress', () => {
  it('folds old raw history into layered summaries and persists each', async () => {
    const history = Array.from({ length: 20 }, (_, i) => msg(i + 1, `m${i + 1}`))
    const { engine, base } = await makeEngine(history)
    try {
      // window 1000, retention 16% → 160 tokens. Each message = 4 tokens, so
      // retention covers 40 messages — far more than 20 → nothing compressible.
      // Use a small window so retention is small: window 100 → retention 16 tokens
      // (~4 messages), compression line 80.
      const result = await engine.compress('s1', history, 100)
      expect(result.layers.length).toBeGreaterThanOrEqual(1)
      // Persisted layers are recoverable.
      const storage = new FileSummaryStorage(base)
      const loaded = await storage.load('s1')
      expect(loaded.length).toBe(result.layers.length)
      // Every produced layer is non-distillable.
      for (const l of result.layers) expect(l.nonDistillable).toBe(true)
    } finally {
      await rm(base, { recursive: true, force: true })
    }
  })

  it('throws when there is no compressible raw span', async () => {
    const history = [msg(1, 'only')]
    const { engine, base } = await makeEngine(history)
    try {
      await expect(engine.compress('s1', history, 100)).rejects.toThrow(NoCompressibleHistoryError)
    } finally {
      await rm(base, { recursive: true, force: true })
    }
  })
})

describe('CompactionEngine.coarsen', () => {
  it('coarsens summaries under the injection cap accounting for cross-session memory', async () => {
    const { engine, base } = await makeEngine([])
    try {
      const summaries = [
        { level: 1, range: [1, 10], text: 'a', tokens: 30, generatedAt: '2026-01-01T00:00:00.000Z', nonDistillable: true },
        { level: 2, range: [1, 10], text: 'b', tokens: 30, generatedAt: '2026-01-01T00:00:00.000Z', nonDistillable: true },
      ]
      // window 200 → injection cap 40. cross-session memory 10 → summaries must
      // fit 30. Two 30-token layers (60) exceed 30 → coarsen.
      const coarsened = await engine.coarsen('s1', summaries, 10, 200)
      const total = coarsened.reduce((sum, l) => sum + l.tokens, 0)
      expect(total).toBeLessThanOrEqual(30)
    } finally {
      await rm(base, { recursive: true, force: true })
    }
  })
})

describe('CompactionEngine.retrieve', () => {
  it('returns the finest covering layers for a seq (coarse→fine chain)', async () => {
    const { engine, base } = await makeEngine([])
    try {
      const storage = new FileSummaryStorage(base)
      await storage.save('s1', { level: 1, range: [1, 20], text: 'fine', tokens: 5, generatedAt: '2026-01-01T00:00:00.000Z', nonDistillable: true })
      await storage.save('s1', { level: 2, range: [1, 20], text: 'coarse', tokens: 3, generatedAt: '2026-01-01T00:00:00.000Z', nonDistillable: true })
      const covering = await engine.retrieve('s1', 10)
      // Finest first (level descending).
      expect(covering.map((l) => l.level)).toEqual([2, 1])
    } finally {
      await rm(base, { recursive: true, force: true })
    }
  })

  it('throws NoCoverageError when no layer covers the seq', async () => {
    const { engine, base } = await makeEngine([])
    try {
      await expect(engine.retrieve('s1', 999)).rejects.toThrow(NoCoverageError)
    } finally {
      await rm(base, { recursive: true, force: true })
    }
  })
})
