/**
 * The `agent/pre-step` handler: the four-stage timing model end-to-end.
 * Verifies first-turn snapshot+L1, pre-compression no-injection, compression
 * point switching, and post-compression per-turn L1.
 */

import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import type { Session, UserMessage } from '@deepseek-ai/dsh-session'
import { createPreStepHandler } from '../../src/injection/pre-step.ts'
import { createCompressionCoordinator } from '../../src/injection/compaction.ts'
import { StageLedger } from '../../src/injection/stage.ts'
import type { Summarizer } from '../../src/compaction/types.ts'

const terseSummarizer: Summarizer = {
  async summarize(span) {
    return { text: `sum<${span.range.join('-')}>`, tokens: 2, model: 'test' }
  },
}

interface PreStepPayload {
  agent: { session: Session; ctx: Context }
  signal: AbortSignal
  messages: UserMessage[]
}

async function makeSession(): Promise<Session> {
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  return ctx.sessions.create(SessionId('s-pre'))
}

function userMsg(text: string): UserMessage {
  return createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } })
}

function handlerPayload(session: Session, signal = new AbortController().signal, messages: UserMessage[] = [userMsg('hi')]): PreStepPayload {
  return {
    agent: { session, ctx: new Context() },
    signal,
    messages,
  }
}

function nextReturning(messages: UserMessage[]) {
  return async () => ({ kind: 'enter' as const, messages })
}

/** Extract the text of the first injected message (plugin memory source). */
function injectedTexts(messages: UserMessage[]): string[] {
  return messages
    .filter((m) => (m.source as { plugin?: string }).plugin === 'memory')
    .map((m) => m.content.filter((b) => b.type === 'text').map((b) => b.text).join(''))
}

describe('createPreStepHandler — four stages', () => {
  it('stage 1 (first turn): injects snapshot + L1 recall', async () => {
    const session = await makeSession()
    const ledger = new StageLedger()
    const handler = createPreStepHandler({
      recall: async () => ({ prependContext: 'L1', appendSystemContext: 'L3L2' }),
      compression: createCompressionCoordinator({ summarizer: terseSummarizer, windowOverride: 10000 }),
      ledger,
      autoCompress: false,
    })
    const decision = await handler(handlerPayload(session), nextReturning([userMsg('hi')]))
    expect(decision.kind).toBe('enter')
    if (decision.kind !== 'enter') return
    const injected = injectedTexts(decision.messages)
    // Snapshot first, then L1.
    expect(injected).toEqual(['L3L2', 'L1'])
    // After the first turn, the stage advances to pre-compression.
    expect(ledger.get(String(session.id))).toBe('pre-compression')
  })

  it('stage 2 (pre-compression): injects nothing (system stays constant)', async () => {
    const session = await makeSession()
    const ledger = new StageLedger()
    // Simulate a session already past first turn: seed a user message.
    session.append('user/message', userMsg('previous'), { surfaceOp: 'append' })
    const handler = createPreStepHandler({
      recall: async () => ({ prependContext: 'L1', appendSystemContext: 'L3L2' }),
      compression: createCompressionCoordinator({ summarizer: terseSummarizer, windowOverride: 10000 }),
      ledger,
      autoCompress: false,
    })
    // Advance to pre-compression (as if first turn already ran).
    ledger.enterPreCompression(String(session.id))
    const decision = await handler(handlerPayload(session), nextReturning([userMsg('hi')]))
    expect(decision.kind).toBe('enter')
    if (decision.kind !== 'enter') return
    // No memory injection in pre-compression; messages unchanged.
    expect(injectedTexts(decision.messages)).toEqual([])
    expect(decision.messages.map((m) => textOf(m))).toEqual(['hi'])
  })

  it('stage 3 (compression point): compresses, then injects only the latest snapshot', async () => {
    const session = await makeSession()
    // Seed a large history so compression triggers.
    for (let i = 0; i < 5; i += 1) {
      session.append('user/message', userMsg('x'.repeat(2000)), { surfaceOp: 'append' })
    }
    const ledger = new StageLedger()
    const handler = createPreStepHandler({
      recall: async () => ({ prependContext: 'L1', appendSystemContext: 'SNAP' }),
      compression: createCompressionCoordinator({ summarizer: terseSummarizer, windowOverride: 2000 }),
      ledger,
      autoCompress: true,
    })
    const decision = await handler(handlerPayload(session), nextReturning([userMsg('hi')]))
    expect(decision.kind).toBe('enter')
    if (decision.kind !== 'enter') return
    // After compression, the snapshot is injected (not L1), and the stage
    // becomes post-compression.
    expect(injectedTexts(decision.messages)).toEqual(['SNAP'])
    expect(ledger.get(String(session.id))).toBe('post-compression')
  })

  it('stage 4 (post-compression): injects L1 every turn', async () => {
    const session = await makeSession()
    session.append('user/message', userMsg('prev'), { surfaceOp: 'append' })
    const ledger = new StageLedger()
    ledger.enterPostCompression(String(session.id))
    const handler = createPreStepHandler({
      recall: async () => ({ prependContext: 'L1', appendSystemContext: 'L3L2' }),
      compression: createCompressionCoordinator({ summarizer: terseSummarizer, windowOverride: 10000 }),
      ledger,
      autoCompress: false,
    })
    const decision = await handler(handlerPayload(session), nextReturning([userMsg('hi')]))
    expect(decision.kind).toBe('enter')
    if (decision.kind !== 'enter') return
    expect(injectedTexts(decision.messages)).toEqual(['L1'])
  })

  it('is aborted-safe: returns next() unchanged on abort', async () => {
    const session = await makeSession()
    const ledger = new StageLedger()
    const handler = createPreStepHandler({
      recall: async () => ({ prependContext: 'L1', appendSystemContext: 'L3L2' }),
      compression: createCompressionCoordinator({ summarizer: terseSummarizer, windowOverride: 10000 }),
      ledger,
      autoCompress: false,
    })
    const controller = new AbortController()
    controller.abort()
    const next = nextReturning([userMsg('hi')])
    const decision = await handler(handlerPayload(session, controller.signal), next)
    expect(decision.kind).toBe('enter')
    if (decision.kind !== 'enter') return
    // Aborted → messages pass through unchanged, no memory injection.
    expect(decision.messages.map((m) => textOf(m))).toEqual(['hi'])
  })
})

function textOf(message: UserMessage): string {
  return message.content.filter((b) => b.type === 'text').map((b) => b.text).join('')
}
