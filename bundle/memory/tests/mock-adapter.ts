/**
 * A scripted `LlmAdapter` for memory adapter unit tests.
 *
 * Self-contained copy of the agent-loop test pattern (verbatim upstream
 * approach): registers a provider route on `ctx.llm`, records every request,
 * and streams a scripted `StreamChunk` sequence so `DshLLMRunner.run` can be
 * asserted to collect the streamed text.
 *
 * @module dsh-harness-memory-bundle/tests/mock-adapter
 */

import type { GenerateOptions, LlmModelReasoningInfo, LlmResolvedModelInfo, StreamChunk } from '@deepseek-ai/dsh-llm'
import { LlmAdapter } from '@deepseek-ai/dsh-llm'

/** Stream a single text block, char by char. */
export function textResponse(text: string): StreamChunk[] {
  return [
    { type: 'block-start', index: 0, blockType: 'text' },
    ...Array.from(text, (char): StreamChunk => ({ type: 'text-delta', index: 0, text: char })),
    { type: 'block-end', index: 0, block: { type: 'text', text } },
    { type: 'usage', usage: { inputTokens: 10, outputTokens: text.length } },
    { type: 'finish', reason: { kind: 'stop' } },
  ]
}

/**
 * Scripted adapter: each model call consumes the next entry (a chunk list or a
 * function of the request). Records every request for assertions.
 */
export class MockAdapter extends LlmAdapter {
  requests: GenerateOptions[] = []

  constructor(
    private readonly script: (StreamChunk[] | ((options: GenerateOptions) => StreamChunk[]))[],
    private readonly reasoning?: LlmModelReasoningInfo,
  ) {
    super()
  }

  override resolveModel(
    provider: string,
    model: string,
  ): Promise<LlmResolvedModelInfo> {
    return Promise.resolve({
      provider,
      id: model,
      name: model,
      ...this.reasoning === undefined ? {} : { reasoning: this.reasoning },
    })
  }

  async * stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    this.requests.push(options)
    const entry = this.script.shift()
    if (entry === undefined) throw new Error('MockAdapter: script exhausted')
    const chunks = typeof entry === 'function' ? entry(options) : entry
    for (const chunk of chunks) {
      if (options.signal?.aborted) throw new Error('aborted')
      yield chunk
    }
  }
}
