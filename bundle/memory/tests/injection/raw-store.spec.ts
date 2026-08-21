/**
 * Real `RawStore` over the session event log: event → `CompactionMessage`
 * projection, token estimation, and range reads.
 */

import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { createMessage, createUserMessage } from '@deepseek-ai/dsh-llm'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import type { Session } from '@deepseek-ai/dsh-session'
import { compactionRole, estimateTokens, projectEvent, sessionRawStore, textOfMessage } from '../../src/injection/raw-store.ts'
import type { CompactionMessage } from '../../src/compaction/types.ts'

async function makeSession(): Promise<Session> {
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  return ctx.sessions.create(SessionId('s-raw'))
}

function userText(session: Session, text: string): number {
  return session.append('user/message', createUserMessage({
    content: [{ type: 'text', text }],
    source: { kind: 'user' },
  }), { surfaceOp: 'append' }).seq
}

function assistantText(session: Session, text: string): number {
  return session.append('assistant/message', {
    turn: 1,
    step: 1,
    message: createMessage({
      role: 'assistant',
      content: [{ type: 'text', text }],
      source: { kind: 'model', provider: 'mock', model: 'mock' },
    }),
  }, { surfaceOp: 'append' }).seq
}

describe('estimateTokens', () => {
  it('estimates ~4 chars per token, minimum 1', () => {
    expect(estimateTokens('abcd')).toBe(1)
    expect(estimateTokens('abcdefgh')).toBe(2)
    expect(estimateTokens('')).toBe(1)
  })
})

describe('textOfMessage / compactionRole', () => {
  it('joins text blocks and maps roles', () => {
    const message = createMessage({
      role: 'user',
      content: [{ type: 'text', text: 'a' }, { type: 'text', text: 'b' }],
      source: { kind: 'user' },
    })
    expect(textOfMessage(message)).toBe('ab')
    expect(compactionRole(message)).toBe('user')
  })

  it('maps a model assistant to assistant role', () => {
    const message = createMessage({
      role: 'assistant',
      content: [{ type: 'text', text: 'x' }],
      source: { kind: 'model', provider: 'mock', model: 'mock' },
    })
    expect(compactionRole(message)).toBe('assistant')
  })
})

describe('projectEvent / sessionRawStore', () => {
  it('projects surface events and skips non-surface ones', async () => {
    const session = await makeSession()
    const userSeq = userText(session, 'hello world') // 11 chars → 3 tokens
    const nonSurface = session.append('step/start', { turn: 1, step: 1 }).seq

    const projected = projectEvent(session, session.events.find((e) => e.seq === userSeq)!)
    expect(projected).not.toBeNull()
    expect(projected!.seq).toBe(userSeq)
    expect(projected!.role).toBe('user')
    expect(projected!.tokens).toBe(estimateTokens('hello world'))

    const skipped = projectEvent(session, session.events.find((e) => e.seq === nonSurface)!)
    expect(skipped).toBeNull()
  })

  it('reads a contiguous range in surface order', async () => {
    const session = await makeSession()
    const s1 = userText(session, 'first')
    const s2 = assistantText(session, 'reply')
    const s3 = userText(session, 'third')
    const store = sessionRawStore(session)
    const read = await store.read([s1, s3])
    expect(read).toHaveLength(3)
    expect(read.map((m) => m.seq)).toEqual([s1, s2, s3])
    expect(read[1]!.role).toBe('assistant')
  })

  it('reports whether history exists at or below a seq', async () => {
    const session = await makeSession()
    const s1 = userText(session, 'x')
    const store = sessionRawStore(session)
    // The exact message seq has history.
    expect(await store.has(s1)).toBe(true)
    // A seq beyond the earliest history still "has history at or below it".
    expect(await store.has(s1 + 1000)).toBe(true)
    // A seq strictly below the earliest history (s1 is the first event) has none.
    expect(await store.has(s1 - 1)).toBe(false)
  })

  it('produces CompactionMessage-shaped projections', async () => {
    const session = await makeSession()
    userText(session, 'projected')
    const event = session.events[0]!
    const projected = projectEvent(session, event)
    const asMessage: CompactionMessage = projected!
    expect(asMessage.seq).toBe(event.seq)
    expect(typeof asMessage.tokens).toBe('number')
    expect(typeof asMessage.text).toBe('string')
  })
})
