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
import { FileSummaryStorage } from '../compaction/index.ts'
import { installInjection } from '../injection/host.ts'
import type { InstallInjectionOptions } from '../injection/host.ts'
import { installInheritance } from '../inheritance/index.ts'
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
  /**
   * T12 child-session inheritance: inject the main conversation's summary into
   * every live subagent child as shared public memory. Disabled via
   * `inheritanceEnabled: false`. Requires T9 injection to also be enabled
   * (the inherited section is refreshed at the compression point).
   */
  inheritanceEnabled?: boolean
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

    // T12 child-session inheritance: inject the main conversation's summary as
    // shared public memory into every live subagent child. The returned refresh
    // function reloads the cache after the main compresses; it is stored in a
    // mutable ref and wired into the T9 injection's `onCompressed` below. The
    // ref is read only at compression time (after both effects run), so the
    // cross-effect ordering is safe. Requires T9 injection to share the storage.
    const inheritanceRef: { current: ((sessionId: string) => Promise<void>) | undefined } = { current: undefined }
    const inheritanceEnabled = config?.inheritanceEnabled !== false && config?.injectionEnabled !== false
    if (inheritanceEnabled) {
      ctx.effect(() => {
        const storage = new FileSummaryStorage(config?.injection?.storageBase)
        inheritanceRef.current = installInheritance(ctx, {
          loadLayers: (sessionId) => storage.load(sessionId),
          teams: () => ctx.get('teams') as never,
          log: (message) => ctx.logger.info(message),
        })
        return () => { inheritanceRef.current = undefined }
      }, 'dsh-memory: install T12 inheritance')
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
          onCompressed: (sessionId) => { void inheritanceRef.current?.(sessionId) },
        })
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
