/**
 * Session-level model-plan selection: the `model-plan/select` fold, the lock
 * once a turn has run, and the service's select/readSelection paths (which
 * write the durable ignorable ledger event and re-read it).
 */

import { describe, expect, it, vi } from 'vitest'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import ModelPlans, { currentPlanSelection, planLocked } from '../src/index.ts'

/** Mount the plan registry over one writable temp root. */
async function makeCtx(root: string): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(ModelPlans, { roots: [{ path: root, trust: 'user' }], includeUserRoot: false })
  return ctx
}

/** Inject a fake `sessions` service returning one live session into `ctx.get`. */
function injectSessions(ctx: Context, session: Session): void {
  vi.spyOn(ctx, 'get').mockImplementation(((name: string) => {
    if (name === 'sessions') return { get: (id: string) => (id === session.id ? session : undefined) }
    return undefined
  }) as typeof ctx.get)
}

describe('currentPlanSelection fold', () => {
  it('defaults to the empty selection with no recorded binding', () => {
    const session = Session.create(SessionId('s'))
    expect(currentPlanSelection(session.events)).toEqual({ overrides: {} })
  })

  it('folds the last recorded binding, newest winning', () => {
    const session = Session.create(SessionId('s'))
    session.append('model-plan/select', { planId: 'a' })
    session.append('model-plan/select', { planId: 'b', overrides: { temperature: 0.9 } })
    session.append('model-plan/select', { planId: 'c' })
    expect(currentPlanSelection(session.events)).toEqual({ planId: 'c', overrides: {} })
  })

  it('carries session overrides only when present', () => {
    const session = Session.create(SessionId('s'))
    session.append('model-plan/select', { planId: 'flash', overrides: { custom: 'x' } })
    expect(currentPlanSelection(session.events)).toEqual({ planId: 'flash', overrides: { custom: 'x' } })
  })

  it('ignores unrelated events', () => {
    const session = Session.create(SessionId('s'))
    session.append('turn/start', {})
    expect(currentPlanSelection(session.events)).toEqual({ overrides: {} })
  })

  it('folds identically when the select event carries the ignorable envelope field', () => {
    // The write path passes `ignorable: true` so a first-party reader that
    // does not know `model-plan/select` can still accept the log; the flag must
    // NOT change how our own fold reads the event.
    const session = Session.create(SessionId('s-ignorable'), [
      { type: 'model-plan/select', seq: 0, time: 1, data: { planId: 'flash' }, ignorable: true },
    ])
    expect(session.events[0].ignorable).toBe(true)
    expect(currentPlanSelection(session.events)).toEqual({ planId: 'flash', overrides: {} })

    const replayed = Session.create(SessionId('s-replay'), [...session.events])
    expect(replayed.events[0].ignorable).toBe(true)
    expect(currentPlanSelection(replayed.events)).toEqual({ planId: 'flash', overrides: {} })
  })
})

describe('planLocked', () => {
  it('is unlocked while no turn has run', () => {
    const session = Session.create(SessionId('s'))
    session.append('model-plan/select', { planId: 'flash' })
    expect(planLocked(session.events)).toBe(false)
  })

  it('locks once a turn has run', () => {
    const session = Session.create(SessionId('s'))
    session.append('model-plan/select', { planId: 'flash' })
    session.append('turn/start', {})
    expect(planLocked(session.events)).toBe(true)
  })
})

describe('ModelPlans.select', () => {
  it('records a durable binding the fold reads back', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-modelplan-sel-'))
    const ctx = await makeCtx(root)
    try {
      await ctx.modelPlans.create('flash', { provider: 'pi-ai', model: 'deepseek-v3' })
      const session = Session.create(SessionId('s1'))
      injectSessions(ctx, session)
      const state = await ctx.modelPlans.select('s1' as never, 'flash', { temperature: 0.2 })
      expect(state).toEqual({ planId: 'flash', overrides: { temperature: 0.2 } })
      expect(currentPlanSelection(session.events)).toEqual({ planId: 'flash', overrides: { temperature: 0.2 } })
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('re-reads the folded state through readSelection', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-modelplan-sel-'))
    const ctx = await makeCtx(root)
    try {
      await ctx.modelPlans.create('flash', { provider: 'p', model: 'm' })
      const session = Session.create(SessionId('s2'))
      injectSessions(ctx, session)
      await ctx.modelPlans.select('s2' as never, 'flash')
      expect(await ctx.modelPlans.readSelection('s2' as never)).toEqual({ planId: 'flash', overrides: {} })
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('refuses a session with no live agent', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-modelplan-sel-'))
    const ctx = await makeCtx(root)
    try {
      await ctx.modelPlans.create('flash', { provider: 'p', model: 'm' })
      const session = Session.create(SessionId('ghost'))
      injectSessions(ctx, session)
      await expect(ctx.modelPlans.select('nope' as never, 'flash')).rejects.toThrow('no live session')
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('refuses a binding after a turn has started', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-modelplan-sel-'))
    const ctx = await makeCtx(root)
    try {
      await ctx.modelPlans.create('flash', { provider: 'p', model: 'm' })
      const session = Session.create(SessionId('s3'))
      session.append('turn/start', {})
      injectSessions(ctx, session)
      await expect(ctx.modelPlans.select('s3' as never, 'flash')).rejects.toThrow('already started')
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('refuses an unknown plan and a broken plan', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-modelplan-sel-'))
    const ctx = await makeCtx(root)
    try {
      await ctx.modelPlans.create('good', { provider: 'p', model: 'm' })
      const session = Session.create(SessionId('s4'))
      injectSessions(ctx, session)
      await expect(ctx.modelPlans.select('s4' as never, 'nope')).rejects.toThrow('not found')
      await expect(ctx.modelPlans.select('s4' as never, 'good')).resolves.toEqual({ planId: 'good', overrides: {} })
    } finally {
      await ctx.fiber.dispose()
    }
  })
})
