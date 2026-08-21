/**
 * Four-stage injection timing model (§4.2): the stage ledger transitions and
 * the per-stage injection plan.
 */

import { describe, expect, it } from 'vitest'
import { INITIAL_STAGE, planForStage, StageLedger, STAGE_ORDER } from '../../src/injection/stage.ts'

describe('StageLedger', () => {
  it('starts at the first-turn stage', () => {
    const ledger = new StageLedger()
    expect(ledger.get('s1')).toBe('first-turn')
    expect(INITIAL_STAGE).toBe('first-turn')
  })

  it('advances to pre-compression after the first turn', () => {
    const ledger = new StageLedger()
    ledger.enterPreCompression('s1')
    expect(ledger.get('s1')).toBe('pre-compression')
  })

  it('a compression advances to post-compression', () => {
    const ledger = new StageLedger()
    ledger.enterPostCompression('s1')
    expect(ledger.get('s1')).toBe('post-compression')
  })

  it('never regresses a post-compression session back to pre-compression', () => {
    const ledger = new StageLedger()
    ledger.enterPostCompression('s1')
    ledger.enterPreCompression('s1')
    expect(ledger.get('s1')).toBe('post-compression')
  })

  it('clear removes per-session state', () => {
    const ledger = new StageLedger()
    ledger.enterPostCompression('s1')
    ledger.clear('s1')
    expect(ledger.get('s1')).toBe('first-turn')
  })

  it('tracks sessions independently', () => {
    const ledger = new StageLedger()
    ledger.enterPostCompression('a')
    ledger.enterPreCompression('b')
    expect(ledger.get('a')).toBe('post-compression')
    expect(ledger.get('b')).toBe('pre-compression')
  })
})

describe('planForStage', () => {
  const recall = {
    prependContext: 'L1 fact',
    appendSystemContext: 'L3 persona + L2 nav',
  }

  it('stage order is the documented four phases', () => {
    expect(STAGE_ORDER).toEqual(['first-turn', 'pre-compression', 'compression', 'post-compression'])
  })

  it('first-turn: snapshot + first L1', () => {
    expect(planForStage('first-turn', recall)).toEqual({
      snapshot: { text: 'L3 persona + L2 nav' },
      l1: { text: 'L1 fact' },
    })
  })

  it('pre-compression: injects nothing (system stays constant)', () => {
    expect(planForStage('pre-compression', recall)).toEqual({})
  })

  it('compression: refresh snapshot only, no L1', () => {
    expect(planForStage('compression', recall)).toEqual({
      snapshot: { text: 'L3 persona + L2 nav' },
    })
  })

  it('post-compression: L1 every turn, no snapshot', () => {
    expect(planForStage('post-compression', recall)).toEqual({
      l1: { text: 'L1 fact' },
    })
  })

  it('omits empty/whitespace-only content', () => {
    expect(planForStage('first-turn', { prependContext: '   ', appendSystemContext: '' })).toEqual({})
    expect(planForStage('post-compression', {})).toEqual({})
    expect(planForStage('compression', { appendSystemContext: undefined })).toEqual({})
  })
})
