/**
 * TdaiCore — Host-neutral facade for TDAI memory capabilities.
 *
 * This is the single entry point that both OpenClaw and Hermes/Gateway call
 * to perform recall, capture, search, and pipeline management. It depends
 * only on abstract interfaces (HostAdapter, LLMRunner), never on a specific host.
 *
 * Usage:
 *   // OpenClaw path (in-process)
 *   const adapter = new OpenClawHostAdapter({ api, pluginDataDir, config });
 *   const core = new TdaiCore({ hostAdapter: adapter, config: parsedCfg });
 *   await core.initialize();
 *   const recall = await core.handleBeforeRecall("user query", "session-1");
 *
 *   // Gateway path (HTTP)
 *   const adapter = new StandaloneHostAdapter({ ... });
 *   const core = new TdaiCore({ hostAdapter: adapter, config: parsedCfg });
 *   await core.initialize();
 *   // HTTP handler calls core.handleBeforeRecall / core.handleTurnCommitted / etc.
 */
import type { HostAdapter, LLMRunnerFactory, RecallResult, CaptureResult, CompletedTurn, MemorySearchParams, ConversationSearchParams } from "./types.js";
import type { MemoryTdaiConfig } from "../config.js";
import type { IMemoryStore } from "./store/types.js";
import type { EmbeddingService } from "./store/embedding.js";
import type { StorageAdapter } from "./storage/adapter.js";
import { MemoryPipelineManager } from "../utils/pipeline-manager.js";
import { SessionFilter } from "../utils/session-filter.js";
export interface TdaiCoreOptions {
    /** Host adapter providing runtime context, logger, and LLM runner factory. */
    hostAdapter: HostAdapter;
    /** Parsed TDAI memory configuration. */
    config: MemoryTdaiConfig;
    /** Session filter for excluding internal/benchmark sessions. */
    sessionFilter?: SessionFilter;
    /** Plugin instance ID for metric reporting. */
    instanceId?: string;
    /** StorageAdapter for file operations (COS/local). When absent, modules fall back to fs. */
    storage?: StorageAdapter;
}
export declare class TdaiCore {
    private hostAdapter;
    private cfg;
    private logger;
    private dataDir;
    private runnerFactory;
    private sessionFilter;
    private instanceId?;
    private storage?;
    private vectorStore?;
    private embeddingService?;
    private scheduler?;
    /**
     * Promise gate for the one-shot scheduler-start sequence.
     *
     * ``ensureSchedulerStarted`` reads a checkpoint file (async) and then
     * calls ``scheduler.start(restoredStates)``.  Under the Gateway, several
     * HTTP requests can reach ``handleTurnCommitted`` concurrently and all
     * race into that function.  Using a plain boolean flag is unsafe: the
     * first caller flips the flag to ``true`` *before* the await completes,
     * so subsequent callers slip past the check and touch the scheduler
     * before ``start()`` has actually run — which makes ``start()``'s
     * ``sessionStates.set(key, restored)`` later clobber the state that
     * those concurrent captures already incremented.
     *
     * Storing the in-flight promise lets every concurrent caller ``await``
     * the same start sequence.  Once it resolves the promise is kept as a
     * sentinel so subsequent calls are a single already-resolved await
     * (effectively a no-op).
     */
    private schedulerStartPromise?;
    private storeReady?;
    /**
     * In-flight fire-and-forget background tasks started by
     * ``handleTurnCommitted`` (currently: deferred L0 embedding for
     * SQLite-style stores — see auto-capture.ts path A).
     *
     * ``destroy()`` awaits all pending entries (with a hard timeout)
     * before closing ``vectorStore`` / ``embeddingService`` so that a
     * late ``updateL0Embedding`` cannot land on an already-closed
     * database connection.
     *
     * Each task registers itself on creation and removes itself in its
     * own ``finally`` handler, so the set stays bounded by the number
     * of currently-running background tasks.
     */
    private readonly bgTasks;
    constructor(opts: TdaiCoreOptions);
    /**
     * Initialize data directories, storage, and pipeline scheduler.
     * Must be called once before any other methods.
     */
    initialize(): Promise<void>;
    /**
     * Destroy all resources. Call on shutdown.
     */
    destroy(): Promise<void>;
    /**
     * Handle recall (memory retrieval) before an LLM turn.
     * Maps to: OpenClaw `before_prompt_build` / Hermes `prefetch()`.
     */
    handleBeforeRecall(userText: string, sessionKey: string): Promise<RecallResult>;
    /**
     * Handle turn commitment (conversation capture + pipeline trigger).
     * Maps to: OpenClaw `agent_end` / Hermes `sync_turn()`.
     */
    handleTurnCommitted(turn: CompletedTurn): Promise<CaptureResult>;
    /**
     * Search L1 structured memories.
     * Maps to: `tdai_memory_search` tool.
     */
    searchMemories(params: MemorySearchParams): Promise<{
        text: string;
        total: number;
        strategy: string;
    }>;
    /**
     * Search L0 raw conversations.
     * Maps to: `tdai_conversation_search` tool.
     */
    searchConversations(params: ConversationSearchParams): Promise<{
        text: string;
        total: number;
    }>;
    /**
     * Handle end-of-conversation for a single session.
     *
     * ⚠️ Read this if you are editing the method:
     *
     * There are two distinct shutdown-ish events, and they must **NOT**
     * share an implementation:
     *
     *   - **`gateway_stop` (OpenClaw / process exit)**
     *     The host is going away.  Tear everything down — scheduler,
     *     VectorStore, EmbeddingService, caches.  That is
     *     {@link destroy}, not this method.
     *
     *   - **`on_session_end` (Hermes) / `POST /session/end` (Gateway)**
     *     One conversation ended while the process keeps serving other
     *     concurrent sessions.  **Only** this session's buffered work
     *     should be flushed; every other session's timers, buffers,
     *     pipeline state, and the shared scheduler itself MUST remain
     *     untouched.  That is this method.
     *
     * Historically this method did ``scheduler.destroy() +
     * createPipelineManager()``, which conflated the two semantics and
     * wiped concurrent sessions' in-memory state on every ``/session/end``
     * call.  That bug is covered by the concurrency test
     * ``P0-1: handleSessionEnd must be scoped to its session``.
     *
     * @param sessionKey  Session whose buffered work should be flushed.
     *                    Unknown keys are tolerated as a no-op so callers
     *                    don't have to pre-check whether the session was
     *                    already evicted or never produced a capture.
     */
    handleSessionEnd(sessionKey: string): Promise<void>;
    /** Get the LLM runner factory (for creating host-neutral LLM runners). */
    getLLMRunnerFactory(): LLMRunnerFactory;
    /** Get the shared VectorStore (may be undefined if init failed). */
    getVectorStore(): IMemoryStore | undefined;
    /** Get the shared EmbeddingService (may be undefined if not configured). */
    getEmbeddingService(): EmbeddingService | undefined;
    /** Get the pipeline scheduler (may be undefined if extraction disabled). */
    getScheduler(): MemoryPipelineManager | undefined;
    /** Get the StorageAdapter (may be undefined in standalone/OpenClaw mode). */
    getStorage(): StorageAdapter | undefined;
    /** Set the StorageAdapter (for service mode, injected by Gateway after config resolution). */
    setStorage(adapter: StorageAdapter): void;
    /**
     * Replace the legacy MemoryPipelineManager with a StatefulPipelineManager.
     *
     * When STATE_BACKEND is configured, the Gateway injects a StatefulPipelineManager
     * that delegates all state to IStateBackend. This makes the Core process
     * stateless — capture calls go through captureAtomic and tasks are dispatched
     * to the Worker pool.
     *
     * The StatefulPipelineManager implements the same notifyConversation()/flushSession()
     * interface as MemoryPipelineManager, so performAutoCapture works unchanged.
     */
    setStatefulPipelineManager(manager: any): void;
    /** Whether the scheduler has been started (or is currently starting). */
    isSchedulerStarted(): boolean;
    /** Set the instance ID for metrics (may be resolved asynchronously). */
    setInstanceId(id: string): void;
    private initStores;
    /**
     * 把 this.cfg.llm 按 provider 解析成运行时可直接用的 (baseUrl, apiKey, model)。
     * provider=openai 时透传；provider=proxy 时替换 baseUrl 为 `${baseUrl}/proxy/<iid>/v1`，
     * apiKey 用 env.TDAI_MEMORY_SYSTEM_USER_KEY。四个 runner factory 构造点共用。
     */
    private resolveRuntimeLlm;
    /**
     * Whether this call site must override the host-provided runner factory
     * with a `StandaloneLLMRunnerFactory` built from `cfg.llm`.
     *
     * Historical rule was "only when hostType=openclaw + cfg.llm.enabled" —
     * that skipped the override in gateway/service mode, which meant
     * `provider=proxy` never got a chance to rewrite baseUrl to
     * `${base}/proxy/<iid>/v1` or swap in the sk-mem-xxx system key, so
     * memory L1/L2/L3 quietly hit the raw upstream (or 401'd on proxy
     * fallback routes). We now ALSO override whenever the user explicitly
     * asked for `provider=proxy`, regardless of host — that's the whole
     * point of that config value.
     *
     * `useStandaloneRunner=true` is a precondition (else the host runner
     * IS the runner, and there's nothing to override) and cfg.llm must
     * actually be enabled (otherwise `resolveRuntimeLlm` has nothing to
     * work with).
     */
    private shouldOverrideRunnerFactory;
    private wirePipelineRunners;
    /**
     * Run L1 extraction using an externally provided Store (for multi-instance VDB).
     * Called by PipelineWorker when task.data.instanceId is present.
     *
     * Returns backlog flags (`hasMore`, `hasFullBacklog`) so the caller (the
     * service-mode worker executor) can mirror standalone-mode pipeline-manager
     * behavior: full backlog → enqueue next L1 immediately; small tail → defer
     * via L1_idle timer. See pipeline-factory.ts createL1Runner for semantics.
     */
    runL1WithStore(sessionKey: string, store: IMemoryStore, embedding: EmbeddingService, storage?: StorageAdapter, 
    /**
     * service 模式必须传：跨节点保护 checkpoint 读改写的分布式锁。
     *
     * 同 instance 的 checkpoint 是**同一个** COS 对象，而 L1 的任务锁是
     * session 级 —— 不同 session / 不同 agent 会在多节点合法并发，
     * 若不额外互斥，后写者会用旧快照覆盖先写者的 runner_states（L1 游标丢失）。
     * standalone 单进程不需要传（进程内 withFileLock 已足够）。
     */
    checkpointLock?: import("../utils/checkpoint.js").CheckpointLockOptions): Promise<{
        storedCount: number;
        creditUsed: number;
        hasMore: boolean;
        hasFullBacklog: boolean;
        profileScopes: string[];
    }>;
    /**
     * Run L2 scene extraction using an externally provided Store.
     */
    runL2WithStore(sessionKey: string, store: IMemoryStore, storage?: StorageAdapter, cursor?: string): Promise<{
        creditUsed: number;
        skipped: boolean;
    }>;
    /**
     * Run L3 persona generation using an externally provided Store.
     */
    runL3WithStore(store: IMemoryStore, storage?: StorageAdapter): Promise<{
        creditUsed: number;
    }>;
    private ensureSchedulerStarted;
}
