/**
 * Per-layer persistence and recovery: atomic save, load ordered by level,
 * session-id sanitization (path-injection defence), and corrupt-file tolerance.
 */

import { describe, expect, it } from 'vitest'
import { mkdtemp, readdir, rm, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { FileSummaryStorage, layerFileName, sanitizeSessionId, summariesRoot } from '../../src/compaction/storage.ts'
import { LayerRecoveryError, type LayerSummary } from '../../src/compaction/types.ts'

function layer(level: number, range: [number, number], text: string, tokens = text.length): LayerSummary {
  return { level, range, text, tokens, generatedAt: '2026-01-01T00:00:00.000Z', model: 'test', nonDistillable: true }
}

describe('sanitizeSessionId', () => {
  it('rejects empty and path-traversing ids', () => {
    expect(() => sanitizeSessionId('')).toThrow(LayerRecoveryError)
    expect(() => sanitizeSessionId('../evil')).toThrow(LayerRecoveryError)
    expect(() => sanitizeSessionId('a/b')).toThrow(LayerRecoveryError)
    expect(() => sanitizeSessionId('a\\b')).toThrow(LayerRecoveryError)
  })

  it('accepts a normal id', () => {
    expect(sanitizeSessionId('session-abc-123')).toBe('session-abc-123')
  })
})

describe('FileSummaryStorage', () => {
  it('saves and loads layers ordered by level ascending', async () => {
    const base = await mkdtemp(join(tmpdir(), 'dsh-mem-compact-'))
    try {
      const storage = new FileSummaryStorage(base)
      await storage.save('s1', layer(2, [10, 30], 'coarse'))
      await storage.save('s1', layer(1, [1, 15], 'fine'))
      const loaded = await storage.load('s1')
      expect(loaded.map((l) => l.level)).toEqual([1, 2])
      expect(loaded[0]!.range).toEqual([1, 15])
      expect(loaded[0]!.nonDistillable).toBe(true)
    } finally {
      await rm(base, { recursive: true, force: true })
    }
  })

  it('returns an empty list for a session with no persisted layers', async () => {
    const base = await mkdtemp(join(tmpdir(), 'dsh-mem-compact-'))
    try {
      const storage = new FileSummaryStorage(base)
      expect(await storage.load('missing')).toEqual([])
    } finally {
      await rm(base, { recursive: true, force: true })
    }
  })

  it('skips corrupt layer files during recovery without failing the rest', async () => {
    const base = await mkdtemp(join(tmpdir(), 'dsh-mem-compact-'))
    try {
      const storage = new FileSummaryStorage(base)
      await storage.save('s1', layer(1, [1, 5], 'good'))
      // Corrupt file written directly.
      const dir = join(base, '.dsh', 'memory', 'summaries', 's1')
      await writeFile(join(dir, 'l2.6-10.json'), 'not-json{{{', 'utf8')
      const loaded = await storage.load('s1')
      // The corrupt layer is skipped; the valid one survives.
      expect(loaded.map((l) => l.level)).toEqual([1])
    } finally {
      await rm(base, { recursive: true, force: true })
    }
  })

  it('writes each layer to a separate file whose name encodes level and range', async () => {
    const base = await mkdtemp(join(tmpdir(), 'dsh-mem-compact-'))
    try {
      const storage = new FileSummaryStorage(base)
      const l = layer(2, [10, 30], 'coarse')
      await storage.save('s1', l)
      const names = await readdir(join(base, '.dsh', 'memory', 'summaries', 's1'))
      expect(names).toContain(layerFileName(l))
      // The file content is the JSON payload.
      const raw = await readFile(join(base, '.dsh', 'memory', 'summaries', 's1', layerFileName(l)), 'utf8')
      const parsed = JSON.parse(raw) as { level: number; range: number[] }
      expect(parsed.level).toBe(2)
      expect(parsed.range).toEqual([10, 30])
    } finally {
      await rm(base, { recursive: true, force: true })
    }
  })

  it('clear removes all layers for a session', async () => {
    const base = await mkdtemp(join(tmpdir(), 'dsh-mem-compact-'))
    try {
      const storage = new FileSummaryStorage(base)
      await storage.save('s1', layer(1, [1, 5], 'x'))
      await storage.clear('s1')
      expect(await storage.load('s1')).toEqual([])
    } finally {
      await rm(base, { recursive: true, force: true })
    }
  })
})

describe('summariesRoot', () => {
  it('resolves under the given base', () => {
    expect(summariesRoot('/tmp/base')).toBe('/tmp/base/.dsh/memory/summaries')
  })
})
