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
import { performAutoRecall } from "./hooks/auto-recall.js";
import { performAutoCapture } from "./hooks/auto-capture.js";
import { executeMemorySearch, formatSearchResponse } from "./tools/memory-search.js";
import { executeConversationSearch, formatConversationSearchResponse } from "./tools/conversation-search.js";
import { initDataDirectories, initStores, resetStores, createPipelineManager, createL1Runner, createPersister, createL2Runner, createL3Runner, } from "../utils/pipeline-factory.js";
import { CheckpointManager } from "../utils/checkpoint.js";
import { SessionFilter } from "../utils/session-filter.js";
import { StandaloneLLMRunnerFactory } from "../adapters/standalone/llm-runner.js";
import { resolveStandaloneLlmForRuntime } from "../adapters/standalone/llm-provider-resolver.js";
const TAG = "[memory-tdai] [core]";
// ============================
// TdaiCore
// ============================
export class TdaiCore {
    hostAdapter;
    cfg;
    logger;
    dataDir;
    runnerFactory;
    sessionFilter;
    instanceId;
    storage;
    // Lazy-initialized resources
    vectorStore;
    embeddingService;
    scheduler;
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
    schedulerStartPromise;
    storeReady;
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
    bgTasks = new Set();
    constructor(opts) {
        this.hostAdapter = opts.hostAdapter;
        this.cfg = opts.config;
        this.logger = opts.hostAdapter.getLogger();
        this.dataDir = opts.hostAdapter.getRuntimeContext().dataDir;
        this.runnerFactory = opts.hostAdapter.getLLMRunnerFactory();
        this.sessionFilter = opts.sessionFilter ?? new SessionFilter([]);
        this.instanceId = opts.instanceId;
        this.storage = opts.storage;
    }
    // ============================
    // Lifecycle
    // ============================
    /**
     * Initialize data directories, storage, and pipeline scheduler.
     * Must be called once before any other methods.
     */
    async initialize() {
        this.logger.debug?.(`${TAG} Initializing TDAI Core: dataDir=${this.dataDir}`);
        initDataDirectories(this.dataDir);
        // Initialize stores (async)
        this.storeReady = this.initStores();
        // Create pipeline manager (sync — does not need store)
        if (this.cfg.extraction.enabled) {
            this.scheduler = createPipelineManager(this.cfg, this.logger, this.sessionFilter);
            // Wire runners after store is ready (or after store init fails — runners
            // still work in degraded mode with JSONL fallback and no embedding)
            this.storeReady
                .then(() => this.wirePipelineRunners())
                .catch((err) => {
                this.logger.error(`${TAG} Store init failed; wiring pipeline runners in degraded mode: ${err instanceof Error ? err.message : String(err)}`);
                this.wirePipelineRunners();
            });
        }
        // NOTE: 原 Skill 模块 wiring（ensureSkillModuleWired）已随 Skill 提取模块
        // 裁切移除（设计文档 §8.8 第一期不含）。
        this.logger.debug?.(`${TAG} TDAI Core initialized`);
    }
    /**
     * Destroy all resources. Call on shutdown.
     */
    async destroy() {
        this.logger.debug?.(`${TAG} Destroying TDAI Core...`);
        // Wait for store init to complete before tearing down
        await this.storeReady?.catch(() => { });
        if (this.scheduler && this.schedulerStartPromise) {
            await this.scheduler.destroy();
            this.schedulerStartPromise = undefined;
            this.logger.debug?.(`${TAG} Scheduler destroyed`);
        }
        // Drain fire-and-forget background tasks started by auto-capture
        // (currently: deferred L0 embedding writes).  We must wait for
        // them here — BEFORE closing vectorStore / embeddingService —
        // otherwise a late updateL0Embedding lands on an already-closed
        // DB connection and either throws "database is not open" or
        // (worse) corrupts state.  A hard timeout keeps destroy bounded
        // when a background task is stuck on a hung embed HTTP call.
        if (this.bgTasks.size > 0) {
            const pending = [...this.bgTasks];
            this.logger.debug?.(`${TAG} Draining ${pending.length} background task(s) before closing stores...`);
            const BG_DRAIN_TIMEOUT_MS = 5_000;
            let drainTimeoutId;
            try {
                await Promise.race([
                    Promise.allSettled(pending).then(() => undefined),
                    new Promise((_, reject) => {
                        drainTimeoutId = setTimeout(() => reject(new Error("bgTasks drain timeout")), BG_DRAIN_TIMEOUT_MS);
                    }),
                ]);
                this.logger.debug?.(`${TAG} Background tasks drained`);
            }
            catch (err) {
                this.logger.warn(`${TAG} Background-task drain timed out (${BG_DRAIN_TIMEOUT_MS}ms): ` +
                    `${err instanceof Error ? err.message : String(err)}. ` +
                    `Closing stores anyway — residual writes may surface as warnings.`);
            }
            finally {
                if (drainTimeoutId !== undefined)
                    clearTimeout(drainTimeoutId);
            }
        }
        if (this.vectorStore) {
            this.vectorStore.close();
            this.vectorStore = undefined;
            this.logger.debug?.(`${TAG} VectorStore closed`);
        }
        if (this.embeddingService?.close) {
            try {
                await this.embeddingService.close();
            }
            catch (err) {
                this.logger.warn(`${TAG} EmbeddingService close error: ${err instanceof Error ? err.message : String(err)}`);
            }
            this.embeddingService = undefined;
        }
        resetStores(this.dataDir);
        this.logger.debug?.(`${TAG} TDAI Core destroyed`);
    }
    // ============================
    // Core capabilities
    // ============================
    /**
     * Handle recall (memory retrieval) before an LLM turn.
     * Maps to: OpenClaw `before_prompt_build` / Hermes `prefetch()`.
     */
    async handleBeforeRecall(userText, sessionKey) {
        await this.storeReady?.catch(() => { });
        const tStart = performance.now();
        const result = await performAutoRecall({
            userText,
            actorId: "default_user",
            sessionKey,
            cfg: this.cfg,
            pluginDataDir: this.dataDir,
            logger: this.logger,
            vectorStore: this.vectorStore,
            embeddingService: this.embeddingService,
            storage: this.storage,
        });
        const recallLatencyMs = performance.now() - tStart;
        // NOTE: 原召回指标上报（reportRecallMetrics，计费观测）已随多租户/计费
        // 裁切移除（设计文档 §8.4）。此处仅记录耗时用于调试。
        return result ?? {};
    }
    /**
     * Handle turn commitment (conversation capture + pipeline trigger).
     * Maps to: OpenClaw `agent_end` / Hermes `sync_turn()`.
     */
    async handleTurnCommitted(turn) {
        await this.storeReady?.catch(() => { });
        await this.ensureSchedulerStarted();
        return performAutoCapture({
            messages: turn.messages,
            sessionKey: turn.sessionKey,
            sessionId: turn.sessionId,
            cfg: this.cfg,
            pluginDataDir: this.dataDir,
            logger: this.logger,
            scheduler: this.scheduler,
            originalUserText: turn.userText,
            originalUserMessageCount: turn.originalUserMessageCount,
            pluginStartTimestamp: turn.startedAt ?? Date.now(),
            vectorStore: this.vectorStore,
            embeddingService: this.embeddingService,
            bgTaskRegistry: this.bgTasks,
            storage: this.storage,
        });
    }
    /**
     * Search L1 structured memories.
     * Maps to: `tdai_memory_search` tool.
     */
    async searchMemories(params) {
        const result = await executeMemorySearch({
            query: params.query,
            limit: params.limit ?? 5,
            type: params.type,
            scene: params.scene,
            vectorStore: this.vectorStore,
            embeddingService: this.embeddingService,
            logger: this.logger,
        });
        return {
            text: formatSearchResponse(result),
            total: result.total,
            strategy: result.strategy,
        };
    }
    /**
     * Search L0 raw conversations.
     * Maps to: `tdai_conversation_search` tool.
     */
    async searchConversations(params) {
        const result = await executeConversationSearch({
            query: params.query,
            limit: params.limit ?? 5,
            sessionKey: params.sessionKey,
            vectorStore: this.vectorStore,
            embeddingService: this.embeddingService,
            logger: this.logger,
        });
        return {
            text: formatConversationSearchResponse(result),
            total: result.total,
        };
    }
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
    async handleSessionEnd(sessionKey) {
        if (!sessionKey)
            return;
        await this.storeReady?.catch(() => { });
        if (!this.scheduler)
            return;
        await this.scheduler.flushSession(sessionKey);
    }
    // ============================
    // Accessors (for migration bridge)
    // ============================
    /** Get the LLM runner factory (for creating host-neutral LLM runners). */
    getLLMRunnerFactory() {
        return this.runnerFactory;
    }
    /** Get the shared VectorStore (may be undefined if init failed). */
    getVectorStore() {
        return this.vectorStore;
    }
    /** Get the shared EmbeddingService (may be undefined if not configured). */
    getEmbeddingService() {
        return this.embeddingService;
    }
    /** Get the pipeline scheduler (may be undefined if extraction disabled). */
    getScheduler() {
        return this.scheduler;
    }
    /** Get the StorageAdapter (may be undefined in standalone/OpenClaw mode). */
    getStorage() {
        return this.storage;
    }
    /** Set the StorageAdapter (for service mode, injected by Gateway after config resolution). */
    setStorage(adapter) {
        this.storage = adapter;
        this.logger.info(`${TAG} StorageAdapter set: type=${adapter.type}`);
    }
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
    setStatefulPipelineManager(manager) {
        // Replace scheduler with the stateful version
        this.scheduler = manager;
        // Mark scheduler as "started" so ensureSchedulerStarted() becomes a no-op
        this.schedulerStartPromise = Promise.resolve();
        this.logger.info("[tdai-core] Switched to StatefulPipelineManager (distributed mode)");
    }
    /** Whether the scheduler has been started (or is currently starting). */
    isSchedulerStarted() {
        return this.schedulerStartPromise !== undefined;
    }
    /** Set the instance ID for metrics (may be resolved asynchronously). */
    setInstanceId(id) {
        this.instanceId = id;
        if (this.scheduler) {
            this.scheduler.instanceId = id;
        }
    }
    // ============================
    // Internal helpers
    // ============================
    async initStores() {
        try {
            const stores = await initStores(this.cfg, this.dataDir, this.logger);
            this.vectorStore = stores.vectorStore;
            this.embeddingService = stores.embeddingService;
            this.logger.debug?.(`${TAG} Stores initialized: backend=${this.cfg.storeBackend}, embedding=${this.cfg.embedding.provider}`);
        }
        catch (err) {
            this.logger.warn(`${TAG} Store init failed; recall/dedup degraded: ${err instanceof Error ? err.message : String(err)}`);
        }
    }
    /**
     * 把 this.cfg.llm 按 provider 解析成运行时可直接用的 (baseUrl, apiKey, model)。
     * provider=openai 时透传；provider=proxy 时替换 baseUrl 为 `${baseUrl}/proxy/<iid>/v1`，
     * apiKey 用 env.TDAI_MEMORY_SYSTEM_USER_KEY。四个 runner factory 构造点共用。
     */
    resolveRuntimeLlm() {
        const resolved = resolveStandaloneLlmForRuntime(this.cfg.llm, this.instanceId);
        return {
            baseUrl: resolved.baseUrl,
            apiKey: resolved.apiKey,
            model: resolved.model,
            maxTokens: resolved.maxTokens ?? 4096,
            timeoutMs: resolved.timeoutMs ?? 120_000,
        };
    }
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
    shouldOverrideRunnerFactory(useStandaloneRunner) {
        if (!useStandaloneRunner || !this.cfg.llm.enabled)
            return false;
        if (this.hostAdapter.hostType === "openclaw")
            return true;
        return this.cfg.llm.provider === "proxy";
    }
    wirePipelineRunners() {
        if (!this.scheduler)
            return;
        // Determine whether to use standalone LLM runner for extraction.
        // Priority: cfg.llm.enabled (explicit override) > hostType detection.
        const useStandaloneRunner = this.cfg.llm.enabled || this.hostAdapter.hostType !== "openclaw";
        const openclawConfig = (!useStandaloneRunner && this.hostAdapter.hostType === "openclaw")
            ? this.hostAdapter.getOpenClawConfig?.()
            : undefined;
        // When standalone runner is active, create LLM runners from the factory.
        // Override the host-provided factory whenever `cfg.llm` is enabled and
        // either (a) we're in OpenClaw in-process mode, or (b) the user set
        // `provider=proxy` (which requires resolver-rewritten baseUrl + sk-mem
        // apiKey and MUST NOT go through the raw host runner). See
        // `shouldOverrideRunnerFactory` for the full rationale.
        //
        // Note: in service mode this factory is a fallback — every request
        // routes through `runL{1,2,3}WithStore` below, which reconstructs its
        // own factory with the per-request instanceId. `wirePipelineRunners`
        // runs at construction time (instanceId may still be `__unset__`), so
        // if resolver would throw we swallow it and keep the host runner as
        // fallback — the per-call site will succeed once instanceId is set.
        let runnerFactory = this.runnerFactory;
        if (this.shouldOverrideRunnerFactory(useStandaloneRunner)) {
            try {
                const runtimeLlm = this.resolveRuntimeLlm();
                runnerFactory = new StandaloneLLMRunnerFactory({
                    config: runtimeLlm,
                    logger: this.logger,
                });
                this.logger.debug?.(`${TAG} Using standalone LLM override: provider=${this.cfg.llm.provider ?? "openai"}, ` +
                    `model=${runtimeLlm.model}, baseUrl=${runtimeLlm.baseUrl}`);
            }
            catch (err) {
                // Most common at construction time: instanceId is still `__unset__`
                // (service mode) and provider=proxy resolver refuses to build a URL.
                // Not fatal — per-call sites (runL1WithStore etc.) will rebuild the
                // factory with the real instanceId when the request lands.
                this.logger.debug?.(`${TAG} wirePipelineRunners: standalone LLM override deferred: ${err instanceof Error ? err.message : String(err)}`);
            }
        }
        // NOTE: 原 MetricTrackingRunnerFactory（credit 计费上报）已随多租户/计费
        // 裁切移除（设计文档 §8.4）。此处直接使用 host runner factory。
        const trackingFactory = runnerFactory;
        const l1LlmRunner = useStandaloneRunner
            ? trackingFactory.createRunner({ enableTools: false })
            : undefined;
        const l2l3LlmRunner = useStandaloneRunner
            ? trackingFactory.createRunner({ enableTools: true })
            : undefined;
        // L1 runner
        this.scheduler.setL1Runner(createL1Runner({
            pluginDataDir: this.dataDir,
            cfg: this.cfg,
            openclawConfig,
            vectorStore: this.vectorStore,
            embeddingService: this.embeddingService,
            logger: this.logger,
            getInstanceId: () => this.instanceId,
            llmRunner: l1LlmRunner,
            storage: this.storage,
        }));
        // Persister
        this.scheduler.setPersister(createPersister(this.dataDir, this.logger, this.storage));
        // L2 runner
        this.scheduler.setL2Runner(async (sessionKey, cursor) => {
            const l2Runner = createL2Runner({
                pluginDataDir: this.dataDir,
                cfg: this.cfg,
                openclawConfig,
                vectorStore: this.vectorStore,
                logger: this.logger,
                instanceId: this.instanceId,
                llmRunner: l2l3LlmRunner,
                storage: this.storage,
            });
            return l2Runner(sessionKey, cursor);
        });
        // L3 runner
        this.scheduler.setL3Runner(async () => {
            const l3Runner = createL3Runner({
                pluginDataDir: this.dataDir,
                cfg: this.cfg,
                openclawConfig,
                vectorStore: this.vectorStore,
                logger: this.logger,
                instanceId: this.instanceId,
                llmRunner: l2l3LlmRunner,
                storage: this.storage,
            });
            await l3Runner();
        });
        this.logger.debug?.(`${TAG} Pipeline runners wired`);
    }
    // ============================
    // Per-instance Store runners (multi-tenant)
    // ============================
    /**
     * Run L1 extraction using an externally provided Store (for multi-instance VDB).
     * Called by PipelineWorker when task.data.instanceId is present.
     *
     * Returns backlog flags (`hasMore`, `hasFullBacklog`) so the caller (the
     * service-mode worker executor) can mirror standalone-mode pipeline-manager
     * behavior: full backlog → enqueue next L1 immediately; small tail → defer
     * via L1_idle timer. See pipeline-factory.ts createL1Runner for semantics.
     */
    async runL1WithStore(sessionKey, store, embedding, storage, 
    /**
     * service 模式必须传：跨节点保护 checkpoint 读改写的分布式锁。
     *
     * 同 instance 的 checkpoint 是**同一个** COS 对象，而 L1 的任务锁是
     * session 级 —— 不同 session / 不同 agent 会在多节点合法并发，
     * 若不额外互斥，后写者会用旧快照覆盖先写者的 runner_states（L1 游标丢失）。
     * standalone 单进程不需要传（进程内 withFileLock 已足够）。
     */
    checkpointLock) {
        const useStandaloneRunner = this.cfg.llm.enabled || this.hostAdapter.hostType !== "openclaw";
        const openclawConfig = (!useStandaloneRunner && this.hostAdapter.hostType === "openclaw")
            ? this.hostAdapter.getOpenClawConfig?.()
            : undefined;
        let runnerFactory = this.runnerFactory;
        if (this.shouldOverrideRunnerFactory(useStandaloneRunner)) {
            const runtimeLlm = this.resolveRuntimeLlm();
            runnerFactory = new StandaloneLLMRunnerFactory({
                config: runtimeLlm,
                logger: this.logger,
            });
            this.logger.debug?.(`${TAG} [L1] Using standalone LLM override: provider=${this.cfg.llm.provider ?? "openai"}, ` +
                `model=${runtimeLlm.model}, baseUrl=${runtimeLlm.baseUrl}`);
        }
        // NOTE: 原 MetricTrackingRunnerFactory（credit 计费上报）已随多租户/计费
        // 裁切移除（设计文档 §8.4）。此处直接使用 host runner factory。
        const trackingFactory = runnerFactory;
        const llmRunner = useStandaloneRunner
            ? trackingFactory.createRunner({ enableTools: false })
            : undefined;
        const runner = createL1Runner({
            pluginDataDir: this.dataDir,
            cfg: this.cfg,
            openclawConfig,
            vectorStore: store,
            embeddingService: embedding,
            logger: this.logger,
            getInstanceId: () => this.instanceId,
            llmRunner,
            storage: storage ?? this.getStorage(),
            checkpointLock,
        });
        // NOTE: 原调用传入 msg/bg_msg（service 多租户模式残留），createL1Runner
        // 签名仅接受 { sessionKey }（内部自读 L0），多余字段是源项目类型不一致。
        // DSH 单机模式无需外部注入消息，已去除多余参数。
        const result = await runner({ sessionKey });
        // Read accumulated credit from the tracking runner (原始浮点数，与监控侧严格一致)
        const creditUsed = llmRunner?.accumulatedCredit ?? 0;
        const storedCount = result?.storedCount ?? 0;
        const hasMore = result?.hasMore ?? false;
        const hasFullBacklog = result?.hasFullBacklog ?? false;
        const profileScopes = result?.profileScopes ?? [];
        return { storedCount, creditUsed, hasMore, hasFullBacklog, profileScopes };
    }
    /**
     * Run L2 scene extraction using an externally provided Store.
     */
    async runL2WithStore(sessionKey, store, storage, cursor) {
        const useStandaloneRunner = this.cfg.llm.enabled || this.hostAdapter.hostType !== "openclaw";
        const openclawConfig = (!useStandaloneRunner && this.hostAdapter.hostType === "openclaw")
            ? this.hostAdapter.getOpenClawConfig?.()
            : undefined;
        let runnerFactory = this.runnerFactory;
        if (this.shouldOverrideRunnerFactory(useStandaloneRunner)) {
            const runtimeLlm = this.resolveRuntimeLlm();
            runnerFactory = new StandaloneLLMRunnerFactory({
                config: runtimeLlm,
                logger: this.logger,
            });
            this.logger.debug?.(`${TAG} [L2] Using standalone LLM override: provider=${this.cfg.llm.provider ?? "openai"}, ` +
                `model=${runtimeLlm.model}, baseUrl=${runtimeLlm.baseUrl}`);
        }
        // NOTE: 原 MetricTrackingRunnerFactory（credit 计费上报）已随多租户/计费
        // 裁切移除（设计文档 §8.4）。此处直接使用 host runner factory。
        const trackingFactory = runnerFactory;
        const llmRunner = useStandaloneRunner
            ? trackingFactory.createRunner({ enableTools: true })
            : undefined;
        const runner = createL2Runner({
            pluginDataDir: this.dataDir,
            cfg: this.cfg,
            openclawConfig,
            vectorStore: store,
            logger: this.logger,
            instanceId: this.instanceId,
            llmRunner,
            storage: storage ?? this.getStorage(),
        });
        const runnerResult = await runner(sessionKey, cursor);
        const creditUsed = llmRunner?.accumulatedCredit ?? 0;
        // L2 runner returns undefined when no new L1 records, or { skipped: true } on empty extraction
        // NOTE: runnerResult 类型为 L2RunnerResult | void，void 分支无属性，此处显式收窄为可空对象。
        const skipped = (runnerResult === undefined && creditUsed === 0) ||
            (runnerResult?.skipped === true);
        return { creditUsed, skipped };
    }
    /**
     * Run L3 persona generation using an externally provided Store.
     */
    async runL3WithStore(store, storage) {
        const useStandaloneRunner = this.cfg.llm.enabled || this.hostAdapter.hostType !== "openclaw";
        const openclawConfig = (!useStandaloneRunner && this.hostAdapter.hostType === "openclaw")
            ? this.hostAdapter.getOpenClawConfig?.()
            : undefined;
        let runnerFactory = this.runnerFactory;
        if (this.shouldOverrideRunnerFactory(useStandaloneRunner)) {
            const runtimeLlm = this.resolveRuntimeLlm();
            runnerFactory = new StandaloneLLMRunnerFactory({
                config: runtimeLlm,
                logger: this.logger,
            });
            this.logger.debug?.(`${TAG} [L3] Using standalone LLM override: provider=${this.cfg.llm.provider ?? "openai"}, ` +
                `model=${runtimeLlm.model}, baseUrl=${runtimeLlm.baseUrl}`);
        }
        // NOTE: 原 MetricTrackingRunnerFactory（credit 计费上报）已随多租户/计费
        // 裁切移除（设计文档 §8.4）。此处直接使用 host runner factory。
        const trackingFactory = runnerFactory;
        const llmRunner = useStandaloneRunner
            ? trackingFactory.createRunner({ enableTools: true })
            : undefined;
        const runner = createL3Runner({
            pluginDataDir: this.dataDir,
            cfg: this.cfg,
            openclawConfig,
            vectorStore: store,
            logger: this.logger,
            instanceId: this.instanceId,
            llmRunner,
            storage: storage ?? this.getStorage(),
        });
        await runner();
        const creditUsed = llmRunner?.accumulatedCredit ?? 0;
        return { creditUsed };
    }
    ensureSchedulerStarted() {
        // Fast path: already started (or starting) — every concurrent caller
        // awaits the same in-flight promise.  The promise is kept around as a
        // permanently-resolved sentinel after success so subsequent calls
        // collapse into a cheap already-resolved await.
        if (this.schedulerStartPromise)
            return this.schedulerStartPromise;
        if (!this.scheduler)
            return Promise.resolve();
        // Capture scheduler locally so TypeScript narrows inside the closure
        // even after ``this.scheduler`` is re-assigned by handleSessionEnd.
        const scheduler = this.scheduler;
        this.schedulerStartPromise = (async () => {
            try {
                const checkpoint = new CheckpointManager(this.dataDir, this.logger, this.storage);
                const cp = await checkpoint.read();
                scheduler.start(checkpoint.getAllPipelineStates(cp));
                this.logger.debug?.(`${TAG} Scheduler started`);
            }
            catch (err) {
                this.logger.error(`${TAG} Failed to restore checkpoint: ${err instanceof Error ? err.message : String(err)}`);
                scheduler.start({});
            }
        })();
        // If the start sequence itself rejects we clear the gate so the next
        // caller can retry; on success we keep the resolved promise so it
        // short-circuits permanently.
        this.schedulerStartPromise.catch(() => {
            this.schedulerStartPromise = undefined;
        });
        return this.schedulerStartPromise;
    }
}
