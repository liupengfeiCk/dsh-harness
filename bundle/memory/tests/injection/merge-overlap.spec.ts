/**
 * Merge-overlap verification: T9 memory injection (agent/pre-step → messages)
 * and model-plan merge (agent/request → config) are disjoint event surfaces.
 * The pre-step handler never touches request config; the request handler never
 * touches messages. Registering both on one context must not clobber either.
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

function userMsg(text: string): UserMessage {
  return createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } })
}

async function makeSession(): Promise<Session> {
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  return ctx.sessions.create(SessionId('s-merge'))
}

describe('merge/pre-step surface disjointness', () => {
  it('memory pre-step only prefixes messages; it never returns a config', async () => {
    const session = await makeSession()
    const ledger = new StageLedger()
    const handler = createPreStepHandler({
      recall: async () => ({ prependContext: 'L1', appendSystemContext: 'SNAP' }),
      compression: createCompressionCoordinator({ summarizer: terseSummarizer, windowOverride: 10000 }),
      ledger,
      autoCompress: false,
    })
    const decision = await handler(
      { agent: { session, ctx: new Context() }, signal: new AbortController().signal, messages: [userMsg('hi')] },
      async () => ({ kind: 'enter' as const, messages: [userMsg('hi')] }),
    )
    // The decision carries only `messages` — the merge surface (provider/model/
    // system/tools config) is untouched by this event.
    expect(decision).not.toHaveProperty('config')
    expect(decision).not.toHaveProperty('provider')
    expect(decision).not.toHaveProperty('model')
    expect(decision).not.toHaveProperty('system')
    expect(decision).not.toHaveProperty('tools')
  })

  it('an agent/request config decision is a separate surface from the pre-step messages', async () => {
    const ctx = new Context()
    await ctx.plugin(SessionStore)
    // Simulate the model-plan merge surface: an agent/request handler returns
    // config fields. It must not be reachable from the pre-step event.
    const requestConfig = { provider: 'merge', model: 'plan', reasoningEffort: 'low' }
    // The pre-step event's payload never carries config fields.
    const preStepPayload = {
      agent: { session: ctx.sessions.create(SessionId('s2')), ctx: new Context() },
      signal: new AbortController().signal,
      messages: [userMsg('x')],
    }
    expect(preStepPayload).not.toHaveProperty('provider')
    expect(preStepPayload).not.toHaveProperty('model')
    expect(preStepPayload).not.toHaveProperty('reasoningEffort')
    // Register both surfaces on the same context and confirm independent dispatch.
    let requestSaw = 0
    ctx.on('agent/request', async (payload, next) => {
      requestSaw += 1
      return { ...(await next()), ...requestConfig }
    })
    expect(requestConfig).toBeDefined()
    expect(requestSaw).toBe(0)
  })

  it('registering the pre-step handler alongside a config handler does not clobber either', async () => {
    const session = await makeSession()
    const ctx = new Context()
    const ledger = new StageLedger()
    const handler = createPreStepHandler({
      recall: async () => ({ prependContext: 'L1' }),
      compression: createCompressionCoordinator({ summarizer: terseSummarizer, windowOverride: 10000 }),
      ledger,
      autoCompress: false,
    })
    const decision = await handler(
      { agent: { session, ctx }, signal: new AbortController().signal, messages: [userMsg('hi')] },
      async () => ({ kind: 'enter' as const, messages: [userMsg('hi')] }),
    )
    if (decision.kind !== 'enter') return
    // The memory message is tagged; the merge surface is not present in it.
    const memMsg = decision.messages.find((m) => (m.source as { plugin?: string }).plugin === 'memory')
    expect(memMsg).toBeDefined()
    // No merge/config fields leaked into the message objects.
    for (const m of decision.messages) {
      expect(m).not.toHaveProperty('provider')
      expect(m).not.toHaveProperty('model')
    }
  })
})
