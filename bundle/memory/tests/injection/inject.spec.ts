/**
 * Memory message assembly: an injection plan becomes logged `UserMessage`s
 * tagged as memory-sourced, in the design splice order (snapshot then L1),
 * with byte-for-byte recall text (no dynamic fields mixed in).
 */

import { describe, expect, it } from 'vitest'
import { assembleInjectionMessages, MEMORY_PLUGIN, memorySource } from '../../src/injection/inject.ts'

describe('assembleInjectionMessages', () => {
  it('produces a snapshot message then an L1 message, both memory-tagged', () => {
    const messages = assembleInjectionMessages({
      snapshot: { text: 'L3 persona\nL2 nav' },
      l1: { text: 'L1 fact' },
    })
    expect(messages).toHaveLength(2)
    // Order: snapshot first, L1 second.
    expect(textOf(messages[0]!)).toBe('L3 persona\nL2 nav')
    expect(textOf(messages[1]!)).toBe('L1 fact')
    for (const message of messages) {
      expect(message.role).toBe('user')
      const source = message.source as { kind: string; plugin: string }
      expect(source.kind).toBe('plugin')
      expect(source.plugin).toBe(MEMORY_PLUGIN)
    }
  })

  it('injects only the L1 prefix for post-compression', () => {
    const messages = assembleInjectionMessages({ l1: { text: 'fact' } })
    expect(messages).toHaveLength(1)
    expect(textOf(messages[0]!)).toBe('fact')
  })

  it('injects only the snapshot for compression', () => {
    const messages = assembleInjectionMessages({ snapshot: { text: 'nav' } })
    expect(messages).toHaveLength(1)
    expect(textOf(messages[0]!)).toBe('nav')
  })

  it('produces no messages for an empty plan', () => {
    expect(assembleInjectionMessages({})).toEqual([])
  })

  it('memorySource stamps the recall form', () => {
    expect(memorySource()).toEqual({ kind: 'plugin', plugin: 'memory', form: 'recall' })
  })
})

function textOf(message: { content: { type: string; text: string }[] }): string {
  return message.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('')
}
