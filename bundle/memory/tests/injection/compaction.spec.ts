/**
 * Compression-point wiring: trigger detection against a live session's raw
 * history and hierarchical compression over the real raw store.
 */

import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import type { Session } from '@deepseek-ai/dsh-session'
import { createCompressionCoordinator } from '../../src/injection/compaction.ts'
import type { Summarizer } from '../../src/compaction/types.ts'

/** Isolated summary-storage base so tests never collide on `~/.dsh/memory`. */
function isolatedStorageBase(tag: string): string {
  return join(tmpdir(), `dsh-memory-overflow-${tag}`)
}

/** Deterministic summarizer that condenses any span. */
const terseSummarizer: Summarizer = {
  async summarize(span) {
    const [start, end] = span.range
    return { text: `sum<${start}-${end}>`, tokens: 2, model: 'test' }
  },
}

async function makeSession(historyTexts: string[]): Promise<Session> {
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  const session = ctx.sessions.create(SessionId('s-compact'))
  for (const text of historyTexts) {
    session.append('user/message', createUserMessage({
      content: [{ type: 'text', text }],
      source: { kind: 'user' },
    }), { surfaceOp: 'append' })
  }
  return session
}

describe('createCompressionCoordinator', () => {
  it('does not trigger below the compression line', async () => {
    const session = await makeSession(['short history'])
    // window 1000 → compression line 800 tokens; tiny history never crosses it.
    const coordinator = createCompressionCoordinator({ summarizer: terseSummarizer, windowOverride: 1000 })
    expect(coordinator.shouldCompress(session)).toBe(false)
  })

  it('triggers once raw history crosses the compression line', async () => {
    // Each message ~2000 chars → ~500 tokens. 3 messages → ~1500 tokens over
    // a 1000-token window's 800 line.
    const longText = 'x'.repeat(2000)
    const session = await makeSession([longText, longText, longText])
    const coordinator = createCompressionCoordinator({ summarizer: terseSummarizer, windowOverride: 1000 })
    expect(coordinator.shouldCompress(session)).toBe(true)
  })

  it('compresses the session raw history into persisted layers', async () => {
    const longText = 'x'.repeat(2000)
    const session = await makeSession([longText, longText, longText, longText, longText])
    const coordinator = createCompressionCoordinator({ summarizer: terseSummarizer, windowOverride: 2000 })
    const result = await coordinator.compress(session)
    expect(result.layers.length).toBeGreaterThanOrEqual(1)
    // Layers are persisted and recoverable.
    const loaded = await coordinator.storage.load(String(session.id))
    expect(loaded.length).toBe(result.layers.length)
  })

  it('resolves the window from the routed context when no override is given', async () => {
    const session = await makeSession(['x'])
    // No request/context event → falls back to DEFAULT_CONTEXT_WINDOW.
    const coordinator = createCompressionCoordinator({ summarizer: terseSummarizer })
    const window = coordinator.resolveWindow(session)
    expect(window).toBeGreaterThan(0)
  })

  it('coarsens for overflow: folds raw history then deepens layers', async () => {
    const longText = 'x'.repeat(2000)
    // A window tight enough that compression triggers and coarsening must run.
    const session = await makeSession([longText, longText, longText, longText, longText])
    const coordinator = createCompressionCoordinator({
      summarizer: terseSummarizer,
      windowOverride: 1000,
      storageBase: isolatedStorageBase('fold'),
    })
    const layers = await coordinator.coarsenForOverflow(session)
    expect(layers).not.toBeNull()
    // Layers were durably persisted and recoverable.
    const loaded = await coordinator.storage.load(String(session.id))
    expect(loaded.length).toBe(layers?.length)
  })

  it('coarsens for overflow returns null when nothing is compressible', async () => {
    const session = await makeSession(['tiny'])
    const coordinator = createCompressionCoordinator({
      summarizer: terseSummarizer,
      windowOverride: 10000,
      storageBase: isolatedStorageBase('none'),
    })
    const layers = await coordinator.coarsenForOverflow(session)
    expect(layers).toBeNull()
  })
})
