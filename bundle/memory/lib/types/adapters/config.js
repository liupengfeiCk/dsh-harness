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
import { parseConfig } from '@tencentdb-agent-memory/memory-core-vendor/config';
/** Build the vendor `MemoryTdaiConfig` from host-facing settings. */
export function buildMemoryTdaiConfig(config) {
    const raw = {};
    if (config.storeBackend !== undefined)
        raw.storeBackend = config.storeBackend;
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
        || config.followCurrentRoute !== false;
    raw.extraction = { enabled: hasRoute };
    if (config.llm?.provider !== undefined || config.llm?.model !== undefined) {
        raw.llm = {
            enabled: true,
            provider: 'openai',
            baseUrl: '',
            apiKey: '',
            model: config.llm?.model ?? '',
            maxTokens: config.llm?.maxTokens ?? 4096,
            timeoutMs: config.llm?.timeoutMs ?? 120_000,
        };
    }
    return parseConfig(raw);
}
//# sourceMappingURL=config.js.map