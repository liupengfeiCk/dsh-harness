/**
 * Memory engine configuration surface.
 *
 * The memory engine's raw config (`MemoryTdaiConfig`) is owned by the vendor
 * layer and parsed by `parseConfig` with sensible defaults. This module defines
 * the HOST-facing config that the `memory` cordis service receives from
 * settings, and bridges it into the vendor config so host wiring never touches
 * vendor internals directly.
 *
 * The LLM route follows the design §T3 note: the extraction model may be pinned
 * to a model plan id (`modelPlanId`), or follow the current route. When neither
 * a plan id nor an explicit provider/model is configured, the route is resolved
 * at call time by the injected route resolver (T4), and the engine defaults to
 * the standalone LLM override (`llm`) if present.
 *
 * @module dsh-harness-memory-bundle/adapters/config
 */

import type {
  MemoryTdaiConfig,
  StoreBackend,
} from '@tencentdb-agent-memory/memory-core-vendor/config'
import { parseConfig } from '@tencentdb-agent-memory/memory-core-vendor/config'

/**
 * Host-facing memory engine config (a subset of the full vendor config the
 * harness cares about). All fields optional — vendor defaults fill the rest.
 */
export interface MemoryEngineConfig {
  /** Absolute data directory for the engine (default `~/.dsh/memory`). */
  readonly dataDir?: string
  /** Storage backend: `sqlite` (default) or `tcvdb`. */
  readonly storeBackend?: StoreBackend
  /**
   * Model plan id (a model-plan bundle plan id) used for the extraction LLM.
   * When set, the LLMRunner resolves provider/model from the plan. When unset,
   * the runner follows the configured default provider/model or the current
   * route (T4). Reserved for the model-plan integration.
   */
  readonly modelPlanId?: string
  /**
   * Follow the harness's current default model selection for extraction (T7
   * "跟随当前路由"). When true and no explicit `llm`/`modelPlanId` route is
   * pinned, extraction is enabled and resolves the route at call time from
   * `ctx.agentDefaultModel.currentSelection()`. Defaults to true. Set false to
   * keep the engine storage-only (no extraction) without a pinned route.
   */
  readonly followCurrentRoute?: boolean
  /**
   * Model plan id used for the compression LLM (T15). When set, the pipeline
   * resolves the compression route from that model plan. When unset, the
   * pipeline follows the harness's current model selection.
   */
  readonly compressionPlan?: string
  /**
   * Unified-injection cap as a 0..1 fraction (T15, default 0.2). The share of
   * the assembled prompt budget memory recall may consume.
   */
  readonly injectionLimit?: number
  /** Original-text compression line as a 0..1 fraction (T15, default 0.8). */
  readonly compressionLine?: number
  /** Original-text retention line as a 0..1 fraction (T15, default 0.16). */
  readonly retainLine?: number
  /** Explicit default LLM route (provider + model) for extraction calls. */
  readonly llm?: {
    /** Provider route key registered with the `llm` service adapter. */
    readonly provider?: string
    /** Model id under that provider. */
    readonly model?: string
    /** Max output tokens. */
    readonly maxTokens?: number
    /** Request timeout in ms. */
    readonly timeoutMs?: number
  }
}

/** Build the vendor `MemoryTdaiConfig` from host-facing settings. */
export function buildMemoryTdaiConfig(config: MemoryEngineConfig): MemoryTdaiConfig {
  const raw: Record<string, unknown> = {}
  if (config.storeBackend !== undefined) raw.storeBackend = config.storeBackend
  if (config.compressionPlan !== undefined && config.compressionPlan.length > 0) {
    raw.compression = { enabled: true, modelPlanId: config.compressionPlan }
  }
  if (config.injectionLimit !== undefined) raw.injectionLimit = config.injectionLimit
  if (config.compressionLine !== undefined) raw.compressionLine = config.compressionLine
  if (config.retainLine !== undefined) raw.retainLine = config.retainLine
  // Extraction needs an LLM route. The engine enables extraction when any of:
  //   - an explicit default route (`llm`) is pinned,
  //   - a model plan id is pinned (`modelPlanId`),
  //   - `followCurrentRoute` is true (default) — the extraction LLM "follows
  //     the current route" (`ctx.agentDefaultModel.currentSelection()`) once the
  //     route resolver runs at call time. When all three are absent, fall back
  //     to a storage-only engine: `extraction` off so the engine initializes
  //     without an LLM route.
  const hasRoute = (config.llm?.provider !== undefined && config.llm?.provider.length > 0)
    || (config.llm?.model !== undefined && config.llm?.model.length > 0)
    || (config.modelPlanId !== undefined && config.modelPlanId.length > 0)
    || config.followCurrentRoute !== false
  raw.extraction = { enabled: hasRoute }
  if (config.llm?.provider !== undefined || config.llm?.model !== undefined) {
    raw.llm = {
      enabled: true,
      provider: 'openai',
      baseUrl: '',
      apiKey: '',
      model: config.llm?.model ?? '',
      maxTokens: config.llm?.maxTokens ?? 4096,
      timeoutMs: config.llm?.timeoutMs ?? 120_000,
    }
  }
  return parseConfig(raw)
}
