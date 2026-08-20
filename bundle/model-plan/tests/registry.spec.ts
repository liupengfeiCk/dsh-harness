/**
 * Model-plan registry: dual-root discovery (system read-only + user-writable),
 * the default marker, and reference semantics (editing a plan file changes what
 * a bound session uses on its next request — the registry re-reads files).
 */

import { describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, readFile as readFilePromise, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import ModelPlans, {
  InvalidPlanIdError, PlanExistsError, PlanNotWritableError, PlanRouteInvalidError,
} from '../src/index.ts'

/** Mount the plan registry over one writable temp root (no harness-home user root). */
async function makeCtx(root: string, extra?: { system?: string[] }): Promise<Context> {
  const ctx = new Context()
  const roots = [
    ...(extra?.system ?? []).map(path => ({ path, trust: 'system' as const })),
    { path: root, trust: 'user' as const },
  ]
  await ctx.plugin(ModelPlans, { roots, includeUserRoot: false })
  return ctx
}

/** A second temp root used as the shipped (system) set. */
async function systemRoot(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'dsh-modelplan-sys-'))
}

describe('dsh-harness-model-plan registry', () => {
  it('creates a plan and its plan.yml from initial fields', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-modelplan-reg-'))
    const ctx = await makeCtx(root)
    try {
      await ctx.modelPlans.create('flash', { provider: 'pi-ai', model: 'deepseek-v3', params: { temperature: 0.2, custom: 'x' } })
      const plans = await ctx.modelPlans.list()
      expect(plans).toHaveLength(1)
      const plan = plans[0]!
      expect(plan.id).toBe('flash')
      expect(plan.trust).toBe('user')
      expect(plan.provider).toBe('pi-ai')
      expect(plan.model).toBe('deepseek-v3')
      expect(plan.params).toEqual({ temperature: 0.2, custom: 'x' })
      expect(plan.broken).toBeUndefined()
      const file = await readFilePromise(join(root, 'flash', 'plan.yml'), 'utf8')
      expect(file).toContain('provider: pi-ai')
      expect(file).toContain('model: deepseek-v3')
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('refuses an id that is not a valid directory name', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-modelplan-reg-'))
    const ctx = await makeCtx(root)
    try {
      await expect(ctx.modelPlans.create('../escape', { provider: 'p', model: 'm' })).rejects.toThrow(InvalidPlanIdError)
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('refuses a create whose id is already taken', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-modelplan-reg-'))
    const ctx = await makeCtx(root)
    try {
      await ctx.modelPlans.create('flash', { provider: 'p', model: 'm' })
      await expect(ctx.modelPlans.create('flash', { provider: 'p', model: 'm2' })).rejects.toThrow(PlanExistsError)
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('refuses a plan that does not pin a provider or model', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-modelplan-reg-'))
    const ctx = await makeCtx(root)
    try {
      await expect(ctx.modelPlans.create('bad', { provider: '', model: 'm' })).rejects.toThrow(PlanRouteInvalidError)
      await expect(ctx.modelPlans.create('bad', { provider: 'p', model: '' })).rejects.toThrow(PlanRouteInvalidError)
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('merges dual roots first-root-wins per id (system then user)', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-modelplan-reg-'))
    const sys = await systemRoot()
    // A shipped plan file authored directly into the system root.
    await mkdir(join(sys, 'ship'), { recursive: true })
    await writeFile(join(sys, 'ship', 'plan.yml'), 'provider: p1\nmodel: m1\n', 'utf8')
    const ctx = await makeCtx(root, { system: [sys] })
    try {
      await ctx.modelPlans.create('ship', { provider: 'p2', model: 'm2' })
      const plans = await ctx.modelPlans.list()
      // The system plan wins the duplicate id over the user one.
      const ship = plans.find(plan => plan.id === 'ship')!
      expect(ship.trust).toBe('system')
      expect(ship.provider).toBe('p1')
      // The user root remains authorable and its own plans list.
      expect(ctx.modelPlans.authorable).toBe(true)
    } finally {
      await ctx.fiber.dispose()
      await rm(sys, { recursive: true, force: true })
    }
  })

  it('refuses to rewrite or delete a system (shipped) plan', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-modelplan-reg-'))
    const sys = await systemRoot()
    await mkdir(join(sys, 'ship'), { recursive: true })
    await writeFile(join(sys, 'ship', 'plan.yml'), 'provider: p1\nmodel: m1\n', 'utf8')
    const ctx = await makeCtx(root, { system: [sys] })
    try {
      await expect(ctx.modelPlans.update('ship', { provider: 'pX' })).rejects.toThrow(PlanNotWritableError)
      await expect(ctx.modelPlans.remove('ship')).rejects.toThrow(PlanNotWritableError)
      await expect(ctx.modelPlans.setDefault('ship')).rejects.toThrow(PlanNotWritableError)
    } finally {
      await ctx.fiber.dispose()
      await rm(sys, { recursive: true, force: true })
    }
  })

  it('reports a malformed or route-less plan file as a broken roster row, not an error', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-modelplan-reg-'))
    const ctx = await makeCtx(root)
    try {
      await mkdir(join(root, 'broken'), { recursive: true })
      await writeFile(join(root, 'broken', 'plan.yml'), 'not: [valid yaml\n', 'utf8')
      await mkdir(join(root, 'noroute'), { recursive: true })
      await writeFile(join(root, 'noroute', 'plan.yml'), 'name: no route\n', 'utf8')
      const plans = await ctx.modelPlans.list()
      const broken = plans.find(plan => plan.id === 'broken')!
      expect(broken.broken).toBeDefined()
      const noroute = plans.find(plan => plan.id === 'noroute')!
      expect(noroute.broken).toContain('provider')
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('marks a default, clearing any other default in the same trust', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-modelplan-reg-'))
    const ctx = await makeCtx(root)
    try {
      await ctx.modelPlans.create('a', { provider: 'p', model: 'm', default: true })
      await ctx.modelPlans.create('b', { provider: 'p', model: 'm' })
      await ctx.modelPlans.setDefault('b')
      const plans = await ctx.modelPlans.list()
      const a = plans.find(plan => plan.id === 'a')!
      const b = plans.find(plan => plan.id === 'b')!
      expect(a.isDefault).toBe(false)
      expect(b.isDefault).toBe(true)
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('enforces reference semantics: editing a plan file changes the next read', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-modelplan-reg-'))
    const ctx = await makeCtx(root)
    try {
      await ctx.modelPlans.create('flash', { provider: 'pi-ai', model: 'deepseek-v3' })
      const first = (await ctx.modelPlans.resolve('flash'))!
      expect(first.model).toBe('deepseek-v3')
      // A tool edits the file directly (simulating a plan edit while running).
      await writeFile(join(root, 'flash', 'plan.yml'), 'provider: venus\nmodel: deepseek-v4\n', 'utf8')
      const second = (await ctx.modelPlans.resolve('flash'))!
      expect(second.provider).toBe('venus')
      expect(second.model).toBe('deepseek-v4')
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('update rewrites a whole user plan', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-modelplan-reg-'))
    const ctx = await makeCtx(root)
    try {
      await ctx.modelPlans.create('flash', { provider: 'p1', model: 'm1', params: { temperature: 0.2 } })
      await ctx.modelPlans.update('flash', { provider: 'p2', params: { topP: 0.9 } })
      const plan = (await ctx.modelPlans.resolve('flash'))!
      expect(plan.provider).toBe('p2')
      expect(plan.model).toBe('m1') // untouched
      expect(plan.params).toEqual({ topP: 0.9 })
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('remove deletes a user plan', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-modelplan-reg-'))
    const ctx = await makeCtx(root)
    try {
      await ctx.modelPlans.create('flash', { provider: 'p', model: 'm' })
      await ctx.modelPlans.remove('flash')
      await expect(ctx.modelPlans.resolve('flash')).rejects.toThrow()
      expect(await ctx.modelPlans.list()).toHaveLength(0)
    } finally {
      await ctx.fiber.dispose()
    }
  })
})
