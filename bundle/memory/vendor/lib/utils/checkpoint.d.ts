/**
 * Checkpoint management for tracking memory processing progress.
 *
 * ## Split-state design
 *
 * Per-session state is split into two independent namespaces to prevent
 * the PipelineManager and L0/L1 runners from overwriting each other's fields:
 *
 * - **runner_states** (`RunnerSessionState`): owned by CheckpointManager methods
 *   (markL1*, advanceSession*). Contains L0 capture cursor, L1 cursor, scene name.
 *
 * - **pipeline_states** (`PipelineSessionState`): owned exclusively by
 *   PipelineManager via `mergePipelineStates()`. Contains conversation_count,
 *   extraction times, L2 tracking fields.
 *
 * Each side only reads/writes its own namespace, eliminating the split-brain
 * overwrite bug where pipeline persistStates() could clobber runner-written fields.
 *
 * ## Concurrency safety
 *
 * All mutating methods (read-modify-write) are serialized via a per-file async lock.
 * Multiple CheckpointManager instances sharing the same file path automatically share
 * the same lock, so callers can freely `new CheckpointManager()` without coordination.
 * Writes use atomic tmp+rename to prevent corruption on crash.
 */
import type { StorageAdapter } from "../core/storage/adapter.js";
/**
 * Per-session state managed by L0/L1 runners (written directly to checkpoint).
 * These fields are ONLY written by CheckpointManager methods (markL1*, advanceSession*, etc.)
 * and are NEVER touched by the PipelineManager's persistStates().
 */
export interface RunnerSessionState {
    /** Epoch ms of the newest message captured for THIS session.
     *  Used instead of the global `Checkpoint.last_captured_timestamp` so that
     *  concurrent sessions don't advance each other's cursors and cause missed messages. */
    last_captured_timestamp: number;
    /** L0 JSONL cursor: epoch ms of last message processed by L1 */
    last_l1_cursor: number;
    /** Last scene name from the most recent L1 extraction (for cross-batch continuity) */
    last_scene_name: string;
}
/**
 * Per-session state managed exclusively by PipelineManager (written via mergePipelineStates).
 * These fields are ONLY written by the pipeline's persistStates() callback
 * and are NEVER touched by CheckpointManager's L0/L1 methods.
 */
export interface PipelineSessionState {
    /** Conversation rounds since last L1 trigger */
    conversation_count: number;
    /** ISO timestamp of the last extraction completion */
    last_extraction_time: string;
    /** ISO timestamp cursor for incremental extraction reads */
    last_extraction_updated_time: string;
    /** Epoch ms of the last notifyConversation call */
    last_active_time: number;
    /** Mirrors conversation_count at L1 completion time (for L2 tracking) */
    l2_pending_l1_count: number;
    /**
     * Current warm-up threshold for L1 triggering.
     * Starts at 1 for new sessions and doubles after each L1 completion
     * (1 → 2 → 4 → 8 → ...) until it reaches everyNConversations.
     * 0 means warm-up is complete (use everyNConversations directly).
     */
    warmup_threshold: number;
    /** ISO timestamp of last L2 extraction completion */
    l2_last_extraction_time: string;
}
export interface Checkpoint {
    /** Epoch ms of the newest message successfully uploaded. Messages with ts > this are new. */
    last_captured_timestamp: number;
    /** Total messages processed across all time */
    total_processed: number;
    last_persona_at: number;
    last_persona_time: string;
    request_persona_update: boolean;
    persona_update_reason: string;
    memories_since_last_persona: number;
    scenes_processed: number;
    /** Runner-managed per-session state (L0 capture cursor, L1 cursor, scene name).
     *  Written ONLY by CheckpointManager methods. */
    runner_states: Record<string, RunnerSessionState>;
    /** Pipeline-managed per-session state (conversation_count, extraction times, etc.).
     *  Written ONLY by the pipeline's mergePipelineStates(). */
    pipeline_states: Record<string, PipelineSessionState>;
    /** Total L0 conversation files recorded */
    l0_conversations_count: number;
    /** Total L1 memories extracted across all time */
    total_memories_extracted: number;
}
export interface CheckpointLogger {
    info(msg: string): void;
    warn?(msg: string): void;
}
/**
 * 跨节点互斥所需的最小锁接口。
 *
 * 由 IStateBackend（Redis）天然满足；standalone 模式不注入即可，
 * 因为单进程下 withFileLock 已足够。
 */
export interface CheckpointDistributedLock {
    acquireLock(key: string, ownerId: string, ttlMs: number): Promise<boolean>;
    releaseLock(key: string, ownerId: string): Promise<void>;
    /**
     * 续约（只能续自己持有的锁）。
     *
     * 必须提供：checkpoint 临界区含 2 次对象存储 IO，COS 抖动时可能超过 ttlMs。
     * 没有续约时锁会静默过期 → 后来者合法抢到 → 两节点同时在临界区，
     * 而 releaseLock 的 owner 校验会让先者「删不掉别人的锁」从而毫无报错，
     * 形成最难排查的静默双写。
     */
    renewLock(key: string, ownerId: string, ttlMs: number): Promise<boolean>;
}
/** checkpoint 写入的可观测计数器（由调用方注入，便于上报到既有 metric 通道） */
export interface CheckpointLockMetrics {
    /** 抢锁失败后放弃写入并要求上层重试的次数 */
    onRequeueRequired?(key: string, waitedMs: number): void;
    /** 锁后端异常导致降级（无锁执行）的次数 */
    onBackendError?(key: string, err: unknown): void;
    /** 续约失败导致放弃写入的次数 */
    onLockLost?(key: string): void;
    /** 每次成功抢锁的等待耗时，用于算p50/p95/p99 */
    onAcquireWait?(key: string, waitedMs: number): void;
}
export interface CheckpointLockOptions {
    /** 分布式锁后端；缺省表示仅依赖进程内锁 */
    lock: CheckpointDistributedLock;
    /** 锁 key，必须能唯一标识该 checkpoint 对象（通常用 instanceId） */
    lockKey: string;
    /** 锁持有时长上限，防止进程崩溃后死锁 */
    ttlMs?: number;
    /** 抢锁最长等待时间 */
    maxWaitMs?: number;
    /** 续约间隔，默认 ttlMs/3 */
    renewIntervalMs?: number;
    /** 可观测计数器 */
    metrics?: CheckpointLockMetrics;
}
/**
 * 抢不到锁 / 锁中途丢失时抛出。
 *
 * 语义：本次 checkpoint **没有写入**，上层必须重新入队而不是当作成功。
 * 旧实现在这里降级为「无锁硬写」，那等于明知会覆盖别人仍然写，
 * 是 L1 游标丢失的直接来源之一。
 */
export declare class CheckpointLockUnavailableError extends Error {
    readonly lockKey: string;
    readonly code = "CHECKPOINT_LOCK_UNAVAILABLE";
    constructor(message: string, lockKey: string);
}
export declare class CheckpointManager {
    private filePath;
    private logger;
    private storage;
    private lockOptions;
    private readonly ownerId;
    constructor(dataDir: string, logger?: CheckpointLogger, storage?: StorageAdapter, lockOptions?: CheckpointLockOptions);
    private readRaw;
    /** Atomic write: write to tmp file, then rename into place (fs mode). Storage mode: direct overwrite. */
    private writeRaw;
    /**
     * Execute a mutating operation under the per-file lock.
     * `fn` receives the current checkpoint and may modify it in place;
     * the updated checkpoint is atomically written back.
     */
    private mutate;
    /**
     * 跨节点串行化 checkpoint 的 read-modify-write。
     *
     * 背景：service 模式下同一 instance 的所有 agent/session 共享同一个
     * checkpoint 对象（`{pathPrefix}/{instanceId}/.metadata/checkpoint.json`），
     * 而 writeRaw 是整对象覆盖。L1 的 Redis 锁是 session 级，不同session /
     * 不同 agent 可跨节点并发，因此若不额外互斥，后写者会用自己读到的旧快照
     * 覆盖先写者已提交的 runner_states，导致 L1 游标丢失。
     *
     * 未注入锁时（standalone / 单进程）直接执行：此时 withFileLock 已足够。
     */
    private withDistributedLock;
    /**
     * Read the current checkpoint (unlocked snapshot).
     *
     * NOTE: This does NOT acquire the file lock. The returned snapshot may be
     * stale if a concurrent `mutate()` is in progress. This is acceptable for
     * read-only uses (status display, deciding whether to run a pipeline step).
     *
     * For read-then-write patterns, always use `mutate()` instead — it acquires
     * the lock and re-reads from disk inside the critical section, ensuring the
     * update is based on the latest state.
     */
    read(): Promise<Checkpoint>;
    /** Write a full checkpoint (acquires lock + atomic write). */
    write(checkpoint: Checkpoint): Promise<void>;
    markPersonaGenerated(totalProcessed: number): Promise<void>;
    clearPersonaRequest(): Promise<void>;
    setPersonaUpdateRequest(reason: string): Promise<void>;
    incrementScenesProcessed(): Promise<void>;
    /**
     * Get or create runner session state for a session.
     */
    getRunnerState(cp: Checkpoint, sessionKey: string): RunnerSessionState;
    /**
     * Get or create pipeline session state for a session.
     */
    getPipelineState(cp: Checkpoint, sessionKey: string): PipelineSessionState;
    /**
     * Get all pipeline states from checkpoint.
     */
    getAllPipelineStates(cp: Checkpoint): Record<string, PipelineSessionState>;
    /**
     * Merge pipeline session states into the checkpoint (used by pipeline persister).
     * Acquires the file lock so this is safe against concurrent mutations.
     *
     * This writes ONLY to `pipeline_states`, never touching `runner_states`.
     * This is the core guarantee that eliminates the split-brain overwrite bug.
     */
    mergePipelineStates(states: Record<string, PipelineSessionState>): Promise<void>;
    /**
     * Mark L1 extraction completed: reset sinceL1 counter, advance L1 cursor,
     * and optionally save the last scene name for cross-batch continuity.
     *
     * @param cursorRecordedAtMs - The max recorded_at epoch ms of processed L0 messages.
     *   This becomes the new `last_l1_cursor` value (recorded_at semantics, not conversation timestamp).
     */
    markL1ExtractionComplete(sessionKey: string, memoriesExtracted: number, cursorRecordedAtMs?: number, lastSceneName?: string): Promise<void>;
    /**
     * 单调修复全局计数器：仅当持久值 < 期望值时抬高到期望值。
     *
     * 用于替代此前 L2 runner 里的 `write({...staleSnapshot})` —— 后者是整对象
     * 覆盖且不受分布式锁保护，会抹掉其他节点并发写入的 runner_states。
     *
     * 本方法在 mutate 的临界区内重读，只写入参列出的标量字段，其余字段原样保留。
     *
     * @returns 是否实际发生了修复（用于上层决定是否告警）
     */
    repairMonotonicCounters(expected: {
        scenes_processed?: number;
        total_processed?: number;
    }): Promise<boolean>;
    /**
     * Atomically read the per-session cursor, execute the capture callback,
     * and advance the cursor — all within a single file-lock critical section.
     *
     * This eliminates the race window that existed when `read()` (unlocked) and
     * `advanceSessionCapturedTimestamp()` (locked) were separate calls:
     * two concurrent `agent_end` events could both read the same stale cursor
     * and record duplicate messages.
     *
     * ⚠️ 注意：`fn` 是业务回调（recordConversation → 写 L0），**必须**留在临界区内，
     * 否则「读游标 → 捕获 → 推进游标」的原子性被破坏，并发 agent_end 会重复记录。
     * 这使本方法的临界区显著长于其他 mutate 调用；安全性依赖 withDistributedLock
     * 的**续约机制**（renewLock）持续持锁，而不是依赖 TTL 覆盖最坏耗时。
     *
     * The callback receives `afterTimestamp` (the current per-session cursor)
     * and must return either:
     *   - `{ maxTimestamp, messageCount }` to advance the cursor, or
     *   - `null` to leave the cursor unchanged (nothing captured).
     *
     * L0 conversation count is also incremented inside the lock when messages
     * are captured, removing the need for a separate `incrementL0ConversationCount()` call.
     *
     * @param sessionKey   Per-session identifier
     * @param pluginStartTimestamp  Cold-start floor (used when no cursor exists yet)
     * @param fn  Async callback that performs the actual capture (recordConversation, etc.)
     */
    captureAtomically(sessionKey: string, pluginStartTimestamp: number | undefined, fn: (afterTimestamp: number) => Promise<{
        maxTimestamp: number;
        messageCount: number;
    } | null>): Promise<void>;
}
