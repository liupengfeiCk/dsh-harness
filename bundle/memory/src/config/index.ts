/**
 * Memory settings namespace registration (host half, T15).
 *
 * The `memory:` settings namespace is the operator-facing configuration surface
 * for the memory system: a master switch, the extraction model plan, the
 * compression route, and the three independent sizing ratios. This module:
 *   - registers the namespace through `installSettingsSection`,
 *   - keeps a live `MemorySettings` value in memory,
 *   - folds the live settings into the `MemoryRuntimeConfig` the `memory`
 *     service constructs, so a settings change is picked up by the running
 *     engine config surface.
 *
 * The memory engine config already consumes `MemoryEngineConfig` (data dir,
 * store backend, extraction LLM route). The settings namespace supplies the
 * higher-level operator knobs; `applyMemorySettings` maps them onto the
 * engine-facing fields (`enabled` → injection/recall, `refinementPlan` →
 * extraction plan id, compression/ratio fields → the sizing surface).
 *
 * @module dsh-harness-memory-bundle/config
 */

import type { Context } from '@deepseek-ai/cordis'
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings'
import type { MemoryEngineConfig } from '../adapters/config.ts'
import { Config, DEFAULT_MEMORY_SETTINGS, type MemorySettings } from './schema.ts'

/** The `memory:` settings namespace key. */
export const MEMORY_SETTINGS_NS = settingsNamespace('memory')

/** The last resolved `memory:` settings value (defaults applied). */
let current: MemorySettings = { ...DEFAULT_MEMORY_SETTINGS }

/** Read the live memory settings (never null; defaults always materialize). */
export function readMemorySettings(): MemorySettings {
  return { ...current }
}

/**
 * Map the live memory settings onto the engine-facing `MemoryEngineConfig`
 * fields, overriding whatever the row config supplied. The settings namespace
 * is the operator surface; the row config is the composition fallback.
 * @param base - the base engine config (row config).
 * @returns the merged engine config with settings applied.
 */
export function applyMemorySettings(base: MemoryEngineConfig): MemoryEngineConfig {
  const settings = current
  return {
    ...base,
    // Extraction plan: the settings value wins when set; otherwise keep the
    // base row config (which may carry its own plan or follow the route).
    ...(settings.refinementPlan !== '' ? { modelPlanId: settings.refinementPlan } : {}),
    // Compression route: pin the plan when configured to a plan.
    ...(settings.compression.mode === 'plan' && settings.compression.planId !== ''
      ? { compressionPlan: settings.compression.planId }
      : {}),
  }
}

/**
 * Install the `memory:` settings namespace on the host context.
 * @param ctx - the host plugin context.
 */
export function installMemorySettings(ctx: Context): void {
  installSettingsSection(ctx, MEMORY_SETTINGS_NS, Config, {
    enabled: true,
    refinementPlan: '',
    compression: { mode: 'follow', planId: '' },
    injectionLimit: 0.2,
    compressionLine: 0.8,
    retainLine: 0.16,
  }, {
    setSource: (source) => {
      current = { ...DEFAULT_MEMORY_SETTINGS, ...source }
    },
    onChange: () => {
      ctx.logger.info('[memory] memory settings updated')
    },
  })
}

/**
 * Cordis plugin body for the `memory:` settings namespace. Mounted as a host
 * row in the memory bundle's `cordis.patch.yml` (`memory-settings`).
 * @param ctx - the host plugin context.
 */
export function apply(ctx: Context): void {
  installMemorySettings(ctx)
}

export default apply
