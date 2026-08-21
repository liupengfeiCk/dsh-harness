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

import { Service } from '@deepseek-ai/cordis'
import type { Context } from '@deepseek-ai/cordis'
import { MemoryHostAdapter } from '../adapters/host-adapter.ts'
import { buildMemoryTdaiConfig } from '../adapters/config.ts'
import type { MemoryEngineConfig } from '../adapters/config.ts'
import { TdaiCore } from '@tencentdb-agent-memory/memory-core-vendor/core/tdai-core'
import { installInjection } from '../injection/host.ts'
import type { InstallInjectionOptions } from '../injection/host.ts'
import { installTurnCapture } from '../ingestion/turn-capture.ts'
import type {
  CompletedTurn,
  ConversationSearchParams,
  MemorySearchParams,
  RecallResult,
} from '@tencentdb-agent-memory/memory-core-vendor/core/types'

/** Schemastery validator for the memory engine config (extension point). */
export const Config = Object

/** Runtime config the `memory` service receives. */
export interface MemoryRuntimeConfig extends MemoryEngineConfig {
  /** Optional pre-built session filter (internal/benchmark sessions). */
  sessionFilter?: import('@tencentdb-agent-memory/memory-core-vendor/utils/session-filter').SessionFilter
  /** T9 unified-injection options (four-stage timing model). */
  injection?: InstallInjectionOptions
  /** Set false to disable T9 unified injection entirely. */
  injectionEnabled?: boolean
}

/**
 * The `memory` host service: owns the engine's lifecycle on the host context.
 */
export class Memory extends Service {
  /** The underlying engine. Created lazily on start. */
  readonly core: TdaiCore
  /** Host adapter through which the engine talks to the harness. */
  readonly hostAdapter: MemoryHostAdapter

  constructor(ctx: Context, public config: MemoryRuntimeConfig = {}) {
    super(ctx, 'memory')
    this.hostAdapter = new MemoryHostAdapter({ ctx, config: config ?? {} })
    this.core = new TdaiCore({
      hostAdapter: this.hostAdapter,
      config: buildMemoryTdaiConfig(config),
      ...(config.sessionFilter !== undefined ? { sessionFilter: config.sessionFilter } : {}),
      instanceId: 'dsh-web',
    })
    ctx.effect(() => {
      const core = this.core
      return () => { void core.destroy() }
    }, 'dsh-memory: dispose engine')
    // Initialize the engine as soon as the service is constructed (cordis
    // Service subclasses do not get their `start()` invoked automatically).
    // Best-effort: a store-init failure degrades per the vendor contract.
    void this.start()

    // T9 unified injection: mount the four-stage `agent/pre-step` memory
    // injection handler (scope-filtered to the root context). Disabled via
    // `injectionEnabled: false` when the profile composes memory without it.
    if (config?.injectionEnabled !== false) {
      ctx.effect(() => {
        installInjection(ctx, this, config?.injection)
        return () => {}
      }, 'dsh-memory: install T9 injection')
    }
    // T5 turn-capture: subscribe the session event stream and commit each
    // committed turn (`turn/end`) to L0 + the pipeline. Always on.
    ctx.effect(() => {
      installTurnCapture(ctx, this)
      return () => {}
    }, 'dsh-memory: install T5 turn-capture')
  }

  /** Initialize the engine (idempotent, best-effort). */
  async start(): Promise<void> {
    if (this._started) return
    this._started = true
    await this.core.initialize()
    this.ctx.logger.info('[memory] engine initialized')
  }

  private _started = false

  /** Capture a completed conversation turn into L0/L1 (+ pipeline scheduling). */
  async onTurnCommitted(turn: CompletedTurn): Promise<void> {
    await this.core.handleTurnCommitted(turn)
  }

  /** Recall memories relevant to a user message (L1/L2/L3 injection). */
  async recall(userText: string, sessionKey: string): Promise<RecallResult> {
    return this.core.handleBeforeRecall(userText, sessionKey)
  }

  /** Full-text memory search (memory tool). */
  async searchMemories(params: MemorySearchParams): Promise<{ text: string; total: number; strategy: string }> {
    return this.core.searchMemories(params)
  }

  /** Full-text L0 conversation search (conversation tool). */
  async searchConversations(params: ConversationSearchParams): Promise<{ text: string; total: number }> {
    return this.core.searchConversations(params)
  }
}
