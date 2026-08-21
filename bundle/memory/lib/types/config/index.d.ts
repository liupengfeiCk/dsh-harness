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
import type { Context } from '@deepseek-ai/cordis';
import type { MemoryEngineConfig } from '../adapters/config.ts';
import { type MemorySettings } from './schema.ts';
/** The `memory:` settings namespace key. */
export declare const MEMORY_SETTINGS_NS: import("@deepseek-ai/dsh-settings").SettingsNamespace;
/** Read the live memory settings (never null; defaults always materialize). */
export declare function readMemorySettings(): MemorySettings;
/**
 * Map the live memory settings onto the engine-facing `MemoryEngineConfig`
 * fields, overriding whatever the row config supplied. The settings namespace
 * is the operator surface; the row config is the composition fallback.
 * @param base - the base engine config (row config).
 * @returns the merged engine config with settings applied.
 */
export declare function applyMemorySettings(base: MemoryEngineConfig): MemoryEngineConfig;
/**
 * Install the `memory:` settings namespace on the host context.
 * @param ctx - the host plugin context.
 */
export declare function installMemorySettings(ctx: Context): void;
/**
 * Cordis plugin body for the `memory:` settings namespace. Mounted as a host
 * row in the memory bundle's `cordis.patch.yml` (`memory-settings`).
 * @param ctx - the host plugin context.
 */
export declare function apply(ctx: Context): void;
export default apply;
//# sourceMappingURL=index.d.ts.map