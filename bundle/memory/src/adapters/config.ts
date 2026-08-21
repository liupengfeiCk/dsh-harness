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
  // Extraction needs an LLM route. When none is configured (no modelPlanId, no
  // default provider/model), fall back to a storage-only engine: `extraction`
  // off so the engine initializes without an LLM route (the extraction LLM
  // "follows the current route" only once a route is configured). This keeps
  // the memory store/recall usable out of the box while deferring LLM wiring.
  const hasRoute = (config.llm?.provider !== undefined && config.llm?.provider.length > 0)
    || (config.llm?.model !== undefined && config.llm?.model.length > 0)
    || (config.modelPlanId !== undefined && config.modelPlanId.length > 0)
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
