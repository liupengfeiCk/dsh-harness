/**
 * Regression: the `subagent` identity projection must classify a harness
 * authored (version-3, extra `subagent`/`team`/`role` fields) descriptor as a
 * healthy identity — NOT the `null` sentinel that the UI reads as "会话记录损坏"
 * (corrupt). The harness writes version-3 descriptors for every in-process
 * child, while the official fold only accepts version-2; folding only the
 * official version would misreport every healthy harness child as corrupt.
 */

import { describe, expect, it } from 'vitest'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { subagentIdentityProjectionDefinition } from '../../src/in-process/upstream/projection.ts'

function descriptorEvent(over: Record<string, unknown>, seq = 0): SessionEvent {
  return {
    id: 'e0',
    seq,
    sessionId: 's0',
    origin: 'self',
    type: 'subagent/descriptor',
    data: over,
  } as SessionEvent
}

function applyOne(over: Record<string, unknown>, seq = 0): unknown {
  const state = subagentIdentityProjectionDefinition.apply(
    subagentIdentityProjectionDefinition.init(),
    descriptorEvent(over, seq),
  )
  return subagentIdentityProjectionDefinition.view(state)
}

describe('subagent identity projection (harness descriptor version)', () => {
  it('classifies a version-3 continuable descriptor (harness team/lead) as continuable, not corrupt', () => {
    const view = applyOne({
      version: 3,
      mode: 'continuable',
      provider: 'spawn',
      label: '组长汇报工作内容',
      persona: 'subagent',
      subagent: 'runner',
      team: 'demo',
      role: 'lead',
    })
    expect(view).toMatchObject({ mode: 'continuable', label: '组长汇报工作内容', seq: 0 })
  })

  it('classifies a version-3 one-shot descriptor as one-shot, not corrupt', () => {
    const view = applyOne({
      version: 3,
      mode: 'one-shot',
      provider: 'spawn',
      label: '侦察兵汇报工作内容',
      persona: 'subagent',
    })
    expect(view).toMatchObject({ mode: 'one-shot', label: '侦察兵汇报工作内容', seq: 0 })
  })

  it('still classifies an official version-2 continuable descriptor', () => {
    const view = applyOne({
      version: 2,
      mode: 'continuable',
      provider: 'spawn',
      label: 'official continuation',
      persona: 'subagent',
    })
    expect(view).toMatchObject({ mode: 'continuable', label: 'official continuation', seq: 0 })
  })

  it('still classifies an official version-2 one-shot descriptor without a label', () => {
    const view = applyOne({
      version: 2,
      mode: 'one-shot',
      provider: 'spawn',
    })
    expect(view).toMatchObject({ mode: 'one-shot', seq: 0 })
    // the schema keeps the label key out of the view entirely when absent
    expect(Object.prototype.hasOwnProperty.call(view as object, 'label')).toBe(false)
  })

  it('reports unknown versions as corrupt (null) rather than throwing', () => {
    const view = applyOne({ version: 99, mode: 'continuable', provider: 'spawn', label: 'x' })
    expect(view).toBeNull()
  })
})
