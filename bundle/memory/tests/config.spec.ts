/**
 * Memory engine config bridging tests (T7 提炼流水线).
 *
 * Verifies that `buildMemoryTdaiConfig` enables extraction when any extraction
 * route is resolvable: an explicit `llm`, a pinned `modelPlanId`, or the
 * default `followCurrentRoute` (T7 "跟随当前路由" — resolved at call time from
 * `ctx.agentDefaultModel.currentSelection()`), and keeps the engine storage-only
 * when `followCurrentRoute` is explicitly disabled and nothing is pinned.
 *
 * The vendor `parseConfig` is mocked to an identity so the build-and-bridge
 * logic is exercised without pulling the (node-gated) vendor package into the
 * vitest graph — the same technique the rest of the bundle's tests use for the
 * vendor seam.
 *
 * @module dsh-harness-memory-bundle/tests/config
 */

import { describe, expect, it, vi } from 'vitest'
import { buildMemoryTdaiConfig } from '../src/adapters/config.ts'

// `parseConfig` applies vendor defaults and validates. For the bridge tests we
// only care how the host-facing flags are folded into the raw config, so mock
// it as the identity: the returned object reflects exactly what we built.
vi.mock('@tencentdb-agent-memory/memory-core-vendor/config', () => ({
  parseConfig: (cfg: Record<string, unknown>) => cfg,
}))

describe('buildMemoryTdaiConfig extraction routing (T7)', () => {
  it('enables extraction when an explicit llm route is pinned', () => {
    const cfg = buildMemoryTdaiConfig({ llm: { provider: 'mock', model: 'm' } })
    expect(cfg.extraction.enabled).toBe(true)
  })

  it('enables extraction when a modelPlanId is pinned', () => {
    const cfg = buildMemoryTdaiConfig({ modelPlanId: 'plan-a' })
    expect(cfg.extraction.enabled).toBe(true)
  })

  it('enables extraction by default (followCurrentRoute defaults true)', () => {
    const cfg = buildMemoryTdaiConfig({})
    expect(cfg.extraction.enabled).toBe(true)
  })

  it('keeps the engine storage-only when followCurrentRoute is disabled and nothing is pinned', () => {
    const cfg = buildMemoryTdaiConfig({ followCurrentRoute: false })
    expect(cfg.extraction.enabled).toBe(false)
  })

  it('keeps extraction enabled even when followCurrentRoute is false if an explicit route exists', () => {
    const cfg = buildMemoryTdaiConfig({ followCurrentRoute: false, llm: { provider: 'mock', model: 'm' } })
    expect(cfg.extraction.enabled).toBe(true)
  })

  it('passes the llm override through when pinned', () => {
    const cfg = buildMemoryTdaiConfig({ llm: { provider: 'mock', model: 'm', maxTokens: 512 } })
    expect(cfg.llm.enabled).toBe(true)
    expect(cfg.llm.model).toBe('m')
    expect(cfg.llm.maxTokens).toBe(512)
  })

  it('omits the llm block when no llm override is pinned', () => {
    const cfg = buildMemoryTdaiConfig({})
    expect(cfg.llm).toBeUndefined()
  })
})

describe('buildMemoryTdaiConfig T15 sizing + compression (T15)', () => {
  it('carries the compression plan when pinned', () => {
    const cfg = buildMemoryTdaiConfig({ compressionPlan: 'plan-c' })
    expect(cfg.compression).toEqual({ enabled: true, modelPlanId: 'plan-c' })
  })

  it('omits the compression block when no plan is pinned', () => {
    const cfg = buildMemoryTdaiConfig({})
    expect(cfg.compression).toBeUndefined()
  })

  it('carries the three independent ratios when set', () => {
    const cfg = buildMemoryTdaiConfig({
      injectionLimit: 0.3,
      compressionLine: 0.85,
      retainLine: 0.1,
    })
    expect(cfg.injectionLimit).toBe(0.3)
    expect(cfg.compressionLine).toBe(0.85)
    expect(cfg.retainLine).toBe(0.1)
  })
})
