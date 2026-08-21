/**
 * T11 context-overflow rescue: the `agent/request-error` handler that takes
 * over the retired official compaction's overflow trigger. Verifies retry on a
 * durable reduction, delegation for non-overflow/abort/no-reduction/budget-spent,
 * and the retry-budget reset seams.
 */

import { describe, expect, it } from 'vitest'
import type { Session } from '@deepseek-ai/dsh-session'
import { CONTEXT_WINDOW_EXCEEDED_CODE } from '@deepseek-ai/dsh-llm'
import { createOverflowRescueHandler, DEFAULT_MAX_OVERFLOW_RETRIES } from '../../src/injection/overflow.ts'
import type { CompressionCoordinator } from '../../src/injection/compaction.ts'
import type { LayerSummary } from '../../src/compaction/types.ts'

/** A fake agent carrying only the session the handler reads. */
function fakeAgent(session: Session): { session: Session } {
  return { session }
}

/** A fake session object (the handler only needs its identity). */
function fakeSession(id: string): Session {
  return { id } as unknown as Session
}

function overflowFailure(message = 'provider overflow'): { readonly code?: string } {
  return Object.assign(new Error(message), { code: CONTEXT_WINDOW_EXCEEDED_CODE })
}

function otherFailure(message = 'rate limited'): { readonly code?: string } {
  return Object.assign(new Error(message), { code: 'RATE_LIMIT' })
}

const layer: LayerSummary = {
  level: 1,
  range: [1, 3],
  text: 'summary',
  tokens: 2,
  generatedAt: new Date().toISOString(),
  nonDistillable: true,
}

/** A controllable compression coordinator. */
function makeCompression(result: readonly LayerSummary[] | null | Error): CompressionCoordinator {
  return {
    engine: undefined as never,
    storage: undefined as never,
    resolveWindow: () => 1000,
    shouldCompress: () => false,
    compress: async () => ({ layers: [], windowTokens: 1000 }),
    coarsenForOverflow: async () => {
      if (result instanceof Error) throw result
      return result
    },
  }
}

describe('createOverflowRescueHandler — agent/request-error', () => {
  it('delegates downstream for a non-overflow failure', async () => {
    const overflow = createOverflowRescueHandler({ compression: makeCompression([layer]) })
    let delegations = 0
    const decision = await overflow.handler(
      { agent: fakeAgent(fakeSession('s')), failure: otherFailure(), signal: new AbortController().signal },
      async () => { delegations += 1; return undefined },
    )
    expect(decision).toBeUndefined()
    expect(delegations).toBe(1)
  })

  it('delegates downstream when the turn is aborted', async () => {
    const overflow = createOverflowRescueHandler({ compression: makeCompression([layer]) })
    const controller = new AbortController()
    controller.abort()
    let delegations = 0
    const decision = await overflow.handler(
      { agent: fakeAgent(fakeSession('s')), failure: overflowFailure(), signal: controller.signal },
      async () => { delegations += 1; return undefined },
    )
    expect(decision).toBeUndefined()
    expect(delegations).toBe(1)
  })

  it('retries after a durable reduction on context overflow', async () => {
    const overflow = createOverflowRescueHandler({ compression: makeCompression([layer]) })
    const decision = await overflow.handler(
      { agent: fakeAgent(fakeSession('s')), failure: overflowFailure(), signal: new AbortController().signal },
      async () => { throw new Error('should not delegate') },
    )
    expect(decision).toEqual({ kind: 'retry' })
  })

  it('delegates downstream when no durable reduction was possible', async () => {
    const overflow = createOverflowRescueHandler({ compression: makeCompression(null) })
    let delegations = 0
    const decision = await overflow.handler(
      { agent: fakeAgent(fakeSession('s')), failure: overflowFailure(), signal: new AbortController().signal },
      async () => { delegations += 1; return undefined },
    )
    expect(decision).toBeUndefined()
    expect(delegations).toBe(1)
  })

  it('preserves the original error when recovery throws', async () => {
    const overflow = createOverflowRescueHandler({
      compression: makeCompression(new Error('summary unavailable')),
    })
    let delegations = 0
    const decision = await overflow.handler(
      { agent: fakeAgent(fakeSession('s')), failure: overflowFailure(), signal: new AbortController().signal },
      async () => { delegations += 1; return undefined },
    )
    expect(decision).toBeUndefined()
    expect(delegations).toBe(1)
  })

  it('stops retrying once the bounded budget is spent', async () => {
    const overflow = createOverflowRescueHandler({
      compression: makeCompression([layer]),
      maxOverflowRetries: 1,
    })
    const agent = fakeAgent(fakeSession('s'))
    const signal = new AbortController().signal
    // First overflow retries.
    expect(await overflow.handler({ agent, failure: overflowFailure(), signal }, async () => undefined))
      .toEqual({ kind: 'retry' })
    // Second overflow spends the budget → delegates.
    let delegations = 0
    const decision = await overflow.handler(
      { agent, failure: overflowFailure(), signal },
      async () => { delegations += 1; return undefined },
    )
    expect(decision).toBeUndefined()
    expect(delegations).toBe(1)
  })

  it('resets the budget via clear (agent idle / success)', async () => {
    const overflow = createOverflowRescueHandler({
      compression: makeCompression([layer]),
      maxOverflowRetries: 1,
    })
    const agent = fakeAgent(fakeSession('s'))
    const signal = new AbortController().signal
    expect(await overflow.handler({ agent, failure: overflowFailure(), signal }, async () => undefined))
      .toEqual({ kind: 'retry' })
    // Budget spent → delegate.
    expect(await overflow.handler({ agent, failure: overflowFailure(), signal }, async () => undefined))
      .toBeUndefined()
    // Reset → retry again.
    overflow.clear(agent)
    expect(await overflow.handler({ agent, failure: overflowFailure(), signal }, async () => undefined))
      .toEqual({ kind: 'retry' })
  })

  it('resets the budget via clearBySession after a successful assistant message', async () => {
    const overflow = createOverflowRescueHandler({
      compression: makeCompression([layer]),
      maxOverflowRetries: 1,
    })
    const session = fakeSession('s')
    const agent = fakeAgent(session)
    const signal = new AbortController().signal
    expect(await overflow.handler({ agent, failure: overflowFailure(), signal }, async () => undefined))
      .toEqual({ kind: 'retry' })
    expect(await overflow.handler({ agent, failure: overflowFailure(), signal }, async () => undefined))
      .toBeUndefined()
    overflow.clearBySession(session)
    expect(await overflow.handler({ agent, failure: overflowFailure(), signal }, async () => undefined))
      .toEqual({ kind: 'retry' })
  })

  it('defaults the retry budget to the exported constant', () => {
    expect(DEFAULT_MAX_OVERFLOW_RETRIES).toBe(2)
  })
})
