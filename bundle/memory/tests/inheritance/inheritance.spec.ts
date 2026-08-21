/**
 * T12 child-session inheritance — acceptance tests.
 *
 * Covers the two modes of §4.4:
 *   - inheritance mode: a subagent child gets the main conversation's summary
 *     as a shared public section, byte-identical across children of the same
 *     main session; the section refreshes when the main compresses;
 *   - non-inheritance mode: a role with `inheritMainSummaries: false` drops the
 *     section once its descriptor lands.
 *   - orthogonality with the role `memory` policy: inheritance is decided
 *     solely by `inheritMainSummaries`, independent of one-shot/persistent.
 */

import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import {
  assemblePublicSection,
  INHERITED_MAIN_ORDER,
  INHERITED_MAIN_SECTION,
  installInheritance,
} from '../../src/inheritance/index.ts'
import type { LayerSummary } from '../../src/compaction/types.ts'

/** A minimal session-like object the wiring consumes. */
interface SessionLike {
  readonly id: string
  readonly header: {
    readonly origin?: 'subagent'
    readonly parentSession?: string
  }
  readonly events: readonly { type: string; data?: unknown }[]
}

/** A minimal agent-like object: a session plus a scoped system prompt. */
interface AgentLike {
  readonly session: SessionLike
  readonly ctx: { systemPrompt: { section: (s: unknown) => () => void } }
}

/** A session-backed child (origin subagent with a parent). */
function childSession(id: string, mainId: string, events: SessionLike['events'] = []): SessionLike {
  return { id, header: { origin: 'subagent', parentSession: mainId }, events }
}

/** A top-level session (no parent). */
function mainSession(id: string): SessionLike {
  return { id, header: {}, events: [] }
}

/** Build a mock agent whose section registrations are recorded. */
function mockAgent(session: SessionLike, records: Array<{ name: string; order: number; text: () => string }>) {
  const agent: AgentLike = {
    session,
    ctx: {
      systemPrompt: {
        section: (s) => {
          const { name, order, text } = s as { name: string; order: number; text: () => string }
          records.push({ name, order, text })
          // Disposer: remove the recorded entry.
          return () => {
            const index = records.findIndex(r => r.name === name)
            if (index >= 0) records.splice(index, 1)
          }
        },
      },
    },
  }
  return agent
}

function layer(level: number, text: string): LayerSummary {
  return { level, range: [0, 1], text, tokens: 1, generatedAt: 't', nonDistillable: false }
}

describe('assemblePublicSection', () => {
  it('renders layers coarse-to-fine and is byte-stable for the same input', () => {
    const input = [layer(1, 'detail'), layer(3, 'overview'), layer(2, 'mid')]
    const a = assemblePublicSection(input)
    const b = assemblePublicSection(input)
    expect(a).toBe(b)
    // Coarse (level 3) first, then 2, then 1.
    expect(a.indexOf('overview')).toBeLessThan(a.indexOf('mid'))
    expect(a.indexOf('mid')).toBeLessThan(a.indexOf('detail'))
  })

  it('returns an empty string for no layers (nothing to inherit)', () => {
    expect(assemblePublicSection([])).toBe('')
  })

  it('drops empty/whitespace layer text', () => {
    expect(assemblePublicSection([layer(2, ''), layer(3, '  '), layer(1, 'x')])).toContain('x')
  })
})

describe('installInheritance — inheritance mode (default)', () => {
  it('registers the inherited-main section on a subagent child at agent/created', async () => {
    const ctx = new Context()
    const records: Array<{ name: string; order: number; text: () => string }> = []
    const loadLayers = vi.fn(async () => [layer(1, 'main progress')])
    const refresh = installInheritance(ctx, { loadLayers })

    const child = mockAgent(childSession('c1', 'm1'), records)
    ctx.emit('agent/created' as never, { agent: child } as never)
    // Allow the async layer load to populate the cache.
    await refresh('m1')

    expect(records).toHaveLength(1)
    expect(records[0].name).toBe(INHERITED_MAIN_SECTION)
    expect(records[0].order).toBe(INHERITED_MAIN_ORDER)
    expect(records[0].text()).toContain('main progress')
    expect(loadLayers).toHaveBeenCalledWith('m1')
  })

  it('does not register on a top-level (main) session', async () => {
    const ctx = new Context()
    const records: Array<{ name: string; order: number; text: () => string }> = []
    const refresh = installInheritance(ctx, { loadLayers: async () => [] })

    const main = mockAgent(mainSession('m1'), records)
    ctx.emit('agent/created' as never, { agent: main } as never)
    await refresh('m1')

    expect(records).toHaveLength(0)
  })

  it('keeps the section byte-identical across two children of the same main', async () => {
    const ctx = new Context()
    const records: Array<{ name: string; order: number; text: () => string }> = []
    const refresh = installInheritance(ctx, { loadLayers: async () => [layer(2, 'shared'), layer(1, 'detail')] })

    const c1 = mockAgent(childSession('c1', 'm1'), records)
    const c2 = mockAgent(childSession('c2', 'm1'), records)
    ctx.emit('agent/created' as never, { agent: c1 } as never)
    ctx.emit('agent/created' as never, { agent: c2 } as never)
    await refresh('m1')

    // Two registrations, same cached text (prefix sharing).
    const texts = records.filter(r => r.name === INHERITED_MAIN_SECTION).map(r => r.text())
    expect(texts).toHaveLength(2)
    expect(texts[0]).toBe(texts[1])
    expect(texts[0]).toContain('shared')
  })

  it('refreshes the public section when the main session compresses', async () => {
    const ctx = new Context()
    const records: Array<{ name: string; order: number; text: () => string }> = []
    let mainLayers = [layer(1, 'v1 summary')]
    const refresh = installInheritance(ctx, { loadLayers: async () => mainLayers })

    const child = mockAgent(childSession('c1', 'm1'), records)
    ctx.emit('agent/created' as never, { agent: child } as never)
    await refresh('m1')
    const before = records[0].text()
    expect(before).toContain('v1 summary')

    // Main compresses → its summary changes → refresh reloads the cache.
    mainLayers = [layer(1, 'v2 summary after compression')]
    await refresh('m1')

    const after = records[0].text()
    expect(after).toContain('v2 summary after compression')
    expect(after).not.toBe(before)
  })
})

describe('installInheritance — non-inheritance mode', () => {
  it('removes the section when the role disables inheritMainSummaries', async () => {
    const ctx = new Context()
    const records: Array<{ name: string; order: number; text: () => string }> = []
    const refresh = installInheritance(ctx, {
      loadLayers: async () => [layer(1, 'main progress')],
      teams: () => ({
        resolveRole: async () => ({ inheritMainSummaries: false }),
      }),
    })

    // The child's events already carry the descriptor (its team/role) — the
    // real runtime folds the same shape once appended.
    const session = childSession('c1', 'm1', [
      { type: 'subagent/descriptor', data: { team: 't', role: 'r' } },
    ])
    const child = mockAgent(session, records)
    ctx.emit('agent/created' as never, { agent: child } as never)
    await refresh('m1')
    // The descriptor landing fires a `session/event`; the wiring resolves the
    // role's inheritance switch from `session.events`.
    ctx.emit('session/event' as never, session, { type: 'subagent/descriptor' } as never)
    // Allow the async role-resolution (and disposer) to settle.
    await new Promise(resolve => setTimeout(resolve, 0))

    // Section was registered at creation, then removed once the descriptor's
    // role was resolved as non-inheriting.
    expect(records).toHaveLength(0)
  })

  it('keeps the section when the role inherits (default true)', async () => {
    const ctx = new Context()
    const records: Array<{ name: string; order: number; text: () => string }> = []
    const refresh = installInheritance(ctx, {
      loadLayers: async () => [layer(1, 'main progress')],
      teams: () => ({
        resolveRole: async () => ({ inheritMainSummaries: true }),
      }),
    })

    const session = childSession('c1', 'm1', [
      { type: 'subagent/descriptor', data: { team: 't', role: 'r' } },
    ])
    const child = mockAgent(session, records)
    ctx.emit('agent/created' as never, { agent: child } as never)
    await refresh('m1')
    ctx.emit('session/event' as never, session, { type: 'subagent/descriptor' } as never)
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(records).toHaveLength(1)
  })
})
