/**
 * Summarizer seam: the default LLM-backed implementation replays the span's
 * messages then appends the condensation instruction, rejects an empty output,
 * and honors the resolved provider/model route.
 */

import { describe, expect, it } from 'vitest'
import { createPrefixAlignedSummarizer } from '../../src/compaction/summarizer.ts'
import type { CompactionMessage } from '../../src/compaction/types.ts'

function msg(seq: number, text: string, role: CompactionMessage['role'] = 'user'): CompactionMessage {
  return { seq, text, tokens: text.length, role }
}

describe('createPrefixAlignedSummarizer', () => {
  it('replays span messages then appends the condensation instruction', async () => {
    let receivedMessages: unknown[] | undefined
    const llm = {
      async *stream(options: { messages: unknown[] }) {
        receivedMessages = options.messages
        yield { type: 'text', text: 'condensed summary' }
      },
    }
    const summarizer = createPrefixAlignedSummarizer(llm, () => ({ provider: 'p', model: 'm', maxTokens: 128 }))
    const result = await summarizer.summarize(
      {
        range: [1, 2],
        messages: [msg(1, 'hello', 'user'), msg(2, 'assistant reply', 'assistant')],
      },
      1,
    )
    expect(result).not.toBeNull()
    expect(result!.text).toContain('condensed summary')
    expect(result!.model).toBe('m')
    expect(receivedMessages).toBeDefined()
    expect(receivedMessages!.length).toBe(3) // 2 replayed + 1 instruction
    expect((receivedMessages![2] as { role: string }).role).toBe('user')
  })

  it('returns null on empty model output', async () => {
    const llm = {
      async *stream() {
        // No text chunks.
      },
    }
    const summarizer = createPrefixAlignedSummarizer(llm, () => ({ provider: 'p', model: 'm', maxTokens: 128 }))
    const result = await summarizer.summarize(
      { range: [1, 1], messages: [msg(1, 'hi')] },
      1,
    )
    expect(result).toBeNull()
  })
})
