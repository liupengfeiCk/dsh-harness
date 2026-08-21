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
import { FileSummaryStorage } from "../compaction/index.js";
import { installInjection } from "../injection/host.js";
import { installInheritance } from "../inheritance/index.js";
import { installTurnCapture } from "../ingestion/turn-capture.js";
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
        // T12 child-session inheritance: inject the main conversation's summary as
        // shared public memory into every live subagent child. The returned refresh
        // function reloads the cache after the main compresses; it is stored in a
        // mutable ref and wired into the T9 injection's `onCompressed` below. The
        // ref is read only at compression time (after both effects run), so the
        // cross-effect ordering is safe. Requires T9 injection to share the storage.
        const inheritanceRef = { current: undefined };
        const inheritanceEnabled = config?.inheritanceEnabled !== false && config?.injectionEnabled !== false;
        if (inheritanceEnabled) {
            ctx.effect(() => {
                const storage = new FileSummaryStorage(config?.injection?.storageBase);
                inheritanceRef.current = installInheritance(ctx, {
                    loadLayers: (sessionId) => storage.load(sessionId),
                    teams: () => ctx.get('teams'),
                    log: (message) => ctx.logger.info(message),
                });
                return () => { inheritanceRef.current = undefined; };
            }, 'dsh-memory: install T12 inheritance');
        }
        // T9 unified injection: mount the four-stage `agent/pre-step` memory
        // injection handler (scope-filtered to the root context). Disabled via
        // `injectionEnabled: false` when the profile composes memory without it.
        if (config?.injectionEnabled !== false) {
            ctx.effect(() => {
                installInjection(ctx, this, {
                    ...config?.injection,
                    // Compression is the cache-invalidating moment: forward it so T12
                    // refreshes every live child's shared public section.
                    onCompressed: (sessionId) => { void inheritanceRef.current?.(sessionId); },
                });
                return () => { };
            }, 'dsh-memory: install T9 injection');
        }
        // T5 turn-capture: subscribe the session event stream and commit each
        // committed turn (`turn/end`) to L0 + the pipeline. Always on.
        ctx.effect(() => {
            installTurnCapture(ctx, this);
            return () => { };
        }, 'dsh-memory: install T5 turn-capture');
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
    /** Full-text L0 conversation search (conversation tool). */
    async searchConversations(params) {
        return this.core.searchConversations(params);
    }
}
//# sourceMappingURL=service.js.map