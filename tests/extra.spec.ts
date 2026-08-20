import { afterEach, describe, expect, it, vi } from 'vitest'
import type { StreamChunk } from '@deepseek-ai/dsh-llm'

// This bundle's headline capability: the `LlmCallConfig.extra` passthrough bag
// (model-plan custom params such as `top_p`) must reach the wire request top
// level. The adapter forwards it through pi-ai's sanctioned `onPayload` hook,
// which sees the fully built provider payload just before it is sent.
//
// These specs mock the SDK boundary the same way the official
// `sdk-options.spec.ts` does: a hand-declared route is built by `createProvider`
// over the protocol table in `src/provider.ts`, so the table's lazy api module
// is the observable SDK boundary. The mock captures the `SimpleStreamOptions`
// (the third argument to `streamSimple`) so the test can inspect `onPayload`
// and invoke it against a representative provider payload.

const streamSimple = vi.hoisted(() => vi.fn())

vi.mock('@earendil-works/pi-ai/api/openai-completions.lazy', () => ({
  openAICompletionsApi: () => ({ stream: streamSimple, streamSimple }),
}))

import { PiAiAdapter } from '../src/adapter.ts'
import { resolveProfiles } from '../src/config.ts'

afterEach(() => { streamSimple.mockReset() })

/** A hand-declared OpenAI-compatible route with one fully described model. */
function gatewayAdapter(): PiAiAdapter {
  return new PiAiAdapter({
    profiles: () => resolveProfiles({
      'local-gateway': {
        api: 'openai-completions',
        baseURL: 'http://127.0.0.1:9/v1',
        models: [{ id: 'local-model', contextWindow: 8192, maxTokens: 1024 }],
      },
    }),
    resolveApiKey: () => Promise.resolve('test-key'),
  })
}

/**
 * A terminating event stream: the adapter's `toStreamChunks` expects a
 * `done` or `error` terminal event, so a bare empty stream throws
 * `STREAM_CLOSED`. Emitting an in-stream `error` terminal (pi-ai's own
 * sanctioned style for a setup failure) lets the adapter drain to an error
 * finish cleanly — all we care about here is that `streamSimple` was reached
 * and its `onPayload` captured.
 */
function terminatingStream(): AsyncIterable<unknown> {
  return {
    async *[Symbol.asyncIterator]() {
      yield {
        type: 'error',
        reason: 'error',
        error: {
          role: 'assistant',
          content: [],
          usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
          stopReason: 'error',
          timestamp: Date.now(),
        },
      }
    },
  }
}

async function drain(adapter: PiAiAdapter, options: Record<string, unknown>): Promise<StreamChunk[]> {
  const chunks: StreamChunk[] = []
  for await (const chunk of adapter.stream({
    provider: 'local-gateway',
    model: 'local-model',
    messages: [],
    ...options,
  })) chunks.push(chunk)
  return chunks
}

describe('llm-pi-ai-extra onPayload forwarding', () => {
  it('injects the extra bag into the wire request top level', async () => {
    let seen: unknown
    streamSimple.mockImplementation((_model: unknown, _context: unknown, options: { onPayload?: (payload: unknown) => unknown }) => {
      seen = options.onPayload
      return terminatingStream()
    })

    await drain(gatewayAdapter(), {
      // Read via the runtime escape hatch: the published GenerateOptions type
      // has no `extra`, but the model-plan merge interceptor supplies it.
      extra: { top_p: 0.8, frequency_penalty: 0.5 },
    })

    expect(seen).toBeTypeOf('function')
    const payload = (seen as (payload: unknown) => unknown)({
      model: 'local-model',
      messages: [],
      temperature: 0.2,
    })
    expect(payload).toMatchObject({
      model: 'local-model',
      temperature: 0.2,
      top_p: 0.8,
      frequency_penalty: 0.5,
    })
  })

  it('keeps native payload fields winning a collision with the extra bag', async () => {
    let seen: unknown
    streamSimple.mockImplementation((_model: unknown, _context: unknown, options: { onPayload?: (payload: unknown) => unknown }) => {
      seen = options.onPayload
      return terminatingStream()
    })

    await drain(gatewayAdapter(), {
      // `temperature` collides with a native field the SDK already placed on
      // the payload; `top_p` does not. Native must win the collision.
      extra: { temperature: 0.9, top_p: 0.8 },
    })

    expect(seen).toBeTypeOf('function')
    const payload = (seen as (payload: unknown) => unknown)({
      model: 'local-model',
      messages: [],
      temperature: 0.2,
    })
    expect(payload).toMatchObject({
      temperature: 0.2, // the SDK-built native value survives
      top_p: 0.8,       // the non-colliding extra key is injected
    })
  })

  it('omits onPayload entirely when the extra bag is empty or absent', async () => {
    let seen: unknown = 'sentinel'
    streamSimple.mockImplementation((_model: unknown, _context: unknown, options: { onPayload?: (payload: unknown) => unknown }) => {
      seen = options.onPayload
      return terminatingStream()
    })

    // No `extra` at all.
    await drain(gatewayAdapter(), {})
    expect(seen).toBeUndefined()

    // An empty extra bag is the same as none: zero SDK disturbance.
    await drain(gatewayAdapter(), { extra: {} })
    expect(seen).toBeUndefined()
  })
})
