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
import type { MemoryTdaiConfig, StoreBackend } from '@tencentdb-agent-memory/memory-core-vendor/config';
/**
 * Host-facing memory engine config (a subset of the full vendor config the
 * harness cares about). All fields optional — vendor defaults fill the rest.
 */
export interface MemoryEngineConfig {
    /** Absolute data directory for the engine (default `~/.dsh/memory`). */
    readonly dataDir?: string;
    /** Storage backend: `sqlite` (default) or `tcvdb`. */
    readonly storeBackend?: StoreBackend;
    /**
     * Model plan id (a model-plan bundle plan id) used for the extraction LLM.
     * When set, the LLMRunner resolves provider/model from the plan. When unset,
     * the runner follows the configured default provider/model or the current
     * route (T4). Reserved for the model-plan integration.
     */
    readonly modelPlanId?: string;
    /**
     * Follow the harness's current default model selection for extraction (T7
     * "跟随当前路由"). When true and no explicit `llm`/`modelPlanId` route is
     * pinned, extraction is enabled and resolves the route at call time from
     * `ctx.agentDefaultModel.currentSelection()`. Defaults to true. Set false to
     * keep the engine storage-only (no extraction) without a pinned route.
     */
    readonly followCurrentRoute?: boolean;
    /** Explicit default LLM route (provider + model) for extraction calls. */
    readonly llm?: {
        /** Provider route key registered with the `llm` service adapter. */
        readonly provider?: string;
        /** Model id under that provider. */
        readonly model?: string;
        /** Max output tokens. */
        readonly maxTokens?: number;
        /** Request timeout in ms. */
        readonly timeoutMs?: number;
    };
}
/** Build the vendor `MemoryTdaiConfig` from host-facing settings. */
export declare function buildMemoryTdaiConfig(config: MemoryEngineConfig): MemoryTdaiConfig;
//# sourceMappingURL=config.d.ts.map