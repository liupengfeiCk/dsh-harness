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
import type { Context } from '@deepseek-ai/cordis';
import { MemoryHostAdapter } from '../adapters/host-adapter.ts';
import type { MemoryEngineConfig } from '../adapters/config.ts';
import { TdaiCore } from '@tencentdb-agent-memory/memory-core-vendor/core/tdai-core';
import type { InstallInjectionOptions } from '../injection/host.ts';
import type { CompletedTurn, ConversationSearchParams, MemorySearchParams, RecallResult } from '@tencentdb-agent-memory/memory-core-vendor/core/types';
/** Schemastery validator for the memory engine config (extension point). */
export declare const Config: ObjectConstructor;
/** Runtime config the `memory` service receives. */
export interface MemoryRuntimeConfig extends MemoryEngineConfig {
    /** Optional pre-built session filter (internal/benchmark sessions). */
    sessionFilter?: import('@tencentdb-agent-memory/memory-core-vendor/utils/session-filter').SessionFilter;
    /** T9 unified-injection options (four-stage timing model). */
    injection?: InstallInjectionOptions;
    /** Set false to disable T9 unified injection entirely. */
    injectionEnabled?: boolean;
}
/**
 * The `memory` host service: owns the engine's lifecycle on the host context.
 */
export declare class Memory extends Service {
    config: MemoryRuntimeConfig;
    /** The underlying engine. Created lazily on start. */
    readonly core: TdaiCore;
    /** Host adapter through which the engine talks to the harness. */
    readonly hostAdapter: MemoryHostAdapter;
    constructor(ctx: Context, config?: MemoryRuntimeConfig);
    /** Initialize the engine (idempotent, best-effort). */
    start(): Promise<void>;
    private _started;
    /** Capture a completed conversation turn into L0/L1 (+ pipeline scheduling). */
    onTurnCommitted(turn: CompletedTurn): Promise<void>;
    /** Recall memories relevant to a user message (L1/L2/L3 injection). */
    recall(userText: string, sessionKey: string): Promise<RecallResult>;
    /** Full-text memory search (memory tool). */
    searchMemories(params: MemorySearchParams): Promise<{
        text: string;
        total: number;
        strategy: string;
    }>;
    /** Full-text L0 conversation search (conversation tool). */
    searchConversations(params: ConversationSearchParams): Promise<{
        text: string;
        total: number;
    }>;
}
//# sourceMappingURL=service.d.ts.map