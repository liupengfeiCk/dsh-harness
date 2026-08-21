/**
 * Memory engine host service.
 *
 * Assembles the vendor `TdaiCore` behind the memory bundle's host adapter:
 *   - constructs the {@link MemoryHostAdapter} (data dir, logger, LLM runner),
 *   - builds the vendor `MemoryTdaiConfig` from the host-facing settings,
 *   - constructs and initializes the engine, so a fresh `~/.dsh/memory` data
 *     root is created and the store/pipeline are ready,
 *   - tears the engine down on dispose.
 *
 * The engine's `initialize()` is best-effort: a store-init failure degrades to
 * the vendor's fallback (JSONL records, no vector recall) rather than crashing
 * the host, matching the vendor's own degraded-mode contract.
 *
 * @module dsh-harness-memory-bundle/memory/service
 */
import { Service } from '@deepseek-ai/cordis';
import { MemoryHostAdapter } from "../adapters/host-adapter.js";
import { buildMemoryTdaiConfig } from "../adapters/config.js";
import { TdaiCore } from '@tencentdb-agent-memory/memory-core-vendor/core/tdai-core';
import { installInjection } from "../injection/host.js";
/** Schemastery validator for the memory engine config (extension point). */
export const Config = Object;
/**
 * The `memory` host service: owns the engine's lifecycle on the host context.
 */
export class Memory extends Service {
    config;
    /** The underlying engine. Created lazily on start. */
    core;
    /** Host adapter through which the engine talks to the harness. */
    hostAdapter;
    constructor(ctx, config = {}) {
        super(ctx, 'memory');
        this.config = config;
        this.hostAdapter = new MemoryHostAdapter({ ctx, config: config ?? {} });
        this.core = new TdaiCore({
            hostAdapter: this.hostAdapter,
            config: buildMemoryTdaiConfig(config),
            ...(config.sessionFilter !== undefined ? { sessionFilter: config.sessionFilter } : {}),
            instanceId: 'dsh-web',
        });
        ctx.effect(() => {
            const core = this.core;
            return () => { void core.destroy(); };
        }, 'dsh-memory: dispose engine');
        // Initialize the engine as soon as the service is constructed (cordis
        // Service subclasses do not get their `start()` invoked automatically).
        // Best-effort: a store-init failure degrades per the vendor contract.
        void this.start();
        // T9 unified injection: mount the four-stage `agent/pre-step` memory
        // injection handler (scope-filtered to the root context). Disabled via
        // `injectionEnabled: false` when the profile composes memory without it.
        if (config?.injectionEnabled !== false) {
            ctx.effect(() => {
                installInjection(ctx, this, config?.injection);
                return () => { };
            }, 'dsh-memory: install T9 injection');
        }
    }
    /** Initialize the engine (idempotent, best-effort). */
    async start() {
        if (this._started)
            return;
        this._started = true;
        await this.core.initialize();
        this.ctx.logger.info('[memory] engine initialized');
    }
    _started = false;
    /** Capture a completed conversation turn into L0/L1 (+ pipeline scheduling). */
    async onTurnCommitted(turn) {
        await this.core.handleTurnCommitted(turn);
    }
    /** Recall memories relevant to a user message (L1/L2/L3 injection). */
    async recall(userText, sessionKey) {
        return this.core.handleBeforeRecall(userText, sessionKey);
    }
    /** Full-text memory search (memory tool). */
    async searchMemories(params) {
        return this.core.searchMemories(params);
    }
}
//# sourceMappingURL=service.js.map