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
import { randomBytes } from "node:crypto";
import { StoragePaths } from "../core/storage/types.js";
const DEFAULT_RUNNER_STATE = {
    last_captured_timestamp: 0,
    last_l1_cursor: 0,
    last_scene_name: "",
};
const DEFAULT_PIPELINE_STATE = {
    conversation_count: 0,
    last_extraction_time: "",
    last_extraction_updated_time: "",
    last_active_time: 0,
    l2_pending_l1_count: 0,
    warmup_threshold: 0, // 0 = graduated (safe default for old sessions missing this field)
    l2_last_extraction_time: "",
};
const DEFAULT_CHECKPOINT = {
    last_captured_timestamp: 0,
    total_processed: 0,
    last_persona_at: 0,
    last_persona_time: "",
    request_persona_update: false,
    persona_update_reason: "",
    memories_since_last_persona: 0,
    scenes_processed: 0,
    runner_states: {},
    pipeline_states: {},
    l0_conversations_count: 0,
    total_memories_extracted: 0,
};
const noopLogger = { info() { } };
// ============================
// Per-file async lock
// ============================
// Keyed by resolved file path. Multiple CheckpointManager instances pointing
// to the same file automatically share the same lock — callers don't need to
// coordinate instance creation.
const fileLocks = new Map();
/**
 * Serialize async critical sections per file path.
 * Under no contention the overhead is a single resolved-promise await.
 */
async function withFileLock(filePath, fn) {
    // Chain after whatever is currently queued for this path
    const prev = fileLocks.get(filePath) ?? Promise.resolve();
    let release;
    const gate = new Promise((r) => { release = r; });
    fileLocks.set(filePath, gate);
    await prev;
    try {
        return await fn();
    }
    finally {
        release();
        // Clean up the map entry if we're the tail of the chain
        if (fileLocks.get(filePath) === gate) {
            fileLocks.delete(filePath);
        }
    }
}
/**
 * 抢不到锁 / 锁中途丢失时抛出。
 *
 * 语义：本次 checkpoint **没有写入**，上层必须重新入队而不是当作成功。
 * 旧实现在这里降级为「无锁硬写」，那等于明知会覆盖别人仍然写，
 * 是 L1 游标丢失的直接来源之一。
 */
export class CheckpointLockUnavailableError extends Error {
    lockKey;
    code = "CHECKPOINT_LOCK_UNAVAILABLE";
    constructor(message, lockKey) {
        super(message);
        this.lockKey = lockKey;
        this.name = "CheckpointLockUnavailableError";
    }
}
/**
 * TTL 取 60s：临界区虽以「一次 GET + 一次 PUT」为主，但 COS 抖动 / 大文件
 * 序列化都可能拉长耗时，配合 renewLock 续约后TTL 只作为「进程崩溃后的
 * 兜底自愈上限」，不再是「临界区必须在此内完成」的硬约束。
 */
const DEFAULT_LOCK_TTL_MS = 60_000;
/** 抢锁最长等待。必须 < 任务锁 TTL（600s），避免把上层任务锁一起拖爆。 */
const DEFAULT_LOCK_MAX_WAIT_MS = 30_000;
export class CheckpointManager {
    filePath;
    logger;
    storage;
    lockOptions;
    ownerId = `cp-${process.pid}-${Math.random().toString(36).slice(2, 10)}`;
    constructor(dataDir, logger, storage, lockOptions) {
        this.storage = storage;
        if (storage) {
            this.filePath = StoragePaths.checkpoint;
        }
        else {
            // Dynamic import path for fs-based mode is resolved in readRaw/writeRaw
            this.filePath = `${dataDir}/.metadata/recall_checkpoint.json`;
        }
        this.logger = logger ?? noopLogger;
        this.lockOptions = lockOptions;
    }
    // ============================
    // Low-level I/O (internal)
    // ============================
    async readRaw() {
        try {
            let raw;
            if (this.storage) {
                raw = await this.storage.readFile(this.filePath);
            }
            else {
                const fs = await import("node:fs/promises");
                raw = await fs.default.readFile(this.filePath, "utf-8");
            }
            if (!raw)
                return structuredClone(DEFAULT_CHECKPOINT);
            const parsed = JSON.parse(raw);
            // Merge with defaults for backward compat (old checkpoints lack new fields).
            // structuredClone avoids shallow-copy pitfall: without it, the nested
            // runner_states/pipeline_states objects in DEFAULT_CHECKPOINT would be
            // shared across all callers and mutated in place — corrupting the default.
            const cp = { ...structuredClone(DEFAULT_CHECKPOINT), ...parsed };
            // Migrate from old session_states format (pre-split)
            const oldStates = parsed.session_states;
            if (oldStates && !parsed.runner_states && !parsed.pipeline_states) {
                cp.runner_states = {};
                cp.pipeline_states = {};
                for (const [key, state] of Object.entries(oldStates)) {
                    cp.runner_states[key] = {
                        ...DEFAULT_RUNNER_STATE,
                        last_captured_timestamp: state.last_captured_timestamp ?? 0,
                        last_l1_cursor: state.last_l1_cursor ?? 0,
                        last_scene_name: state.last_scene_name ?? "",
                    };
                    cp.pipeline_states[key] = {
                        ...DEFAULT_PIPELINE_STATE,
                        conversation_count: state.conversation_count ?? 0,
                        last_extraction_time: state.last_extraction_time ?? "",
                        last_extraction_updated_time: state.last_extraction_updated_time ?? "",
                        last_active_time: state.last_active_time ?? 0,
                        l2_pending_l1_count: state.l2_pending_l1_count ?? 0,
                        l2_last_extraction_time: state.l2_last_extraction_time ?? "",
                    };
                }
            }
            else {
                // Ensure per-session states have all fields with defaults
                if (cp.runner_states) {
                    for (const [key, state] of Object.entries(cp.runner_states)) {
                        cp.runner_states[key] = { ...DEFAULT_RUNNER_STATE, ...state };
                    }
                }
                if (cp.pipeline_states) {
                    for (const [key, state] of Object.entries(cp.pipeline_states)) {
                        cp.pipeline_states[key] = { ...DEFAULT_PIPELINE_STATE, ...state };
                    }
                }
            }
            return cp;
        }
        catch {
            return structuredClone(DEFAULT_CHECKPOINT);
        }
    }
    /** Atomic write: write to tmp file, then rename into place (fs mode). Storage mode: direct overwrite. */
    async writeRaw(checkpoint) {
        const content = JSON.stringify(checkpoint, null, 2);
        if (this.storage) {
            await this.storage.writeFile(this.filePath, content);
        }
        else {
            const fs = await import("node:fs/promises");
            const path = await import("node:path");
            const dir = path.default.dirname(this.filePath);
            await fs.default.mkdir(dir, { recursive: true });
            const tmp = `${this.filePath}.tmp.${randomBytes(4).toString("hex")}`;
            await fs.default.writeFile(tmp, content, "utf-8");
            await fs.default.rename(tmp, this.filePath);
        }
    }
    // ============================
    // Locked read-modify-write helper
    // ============================
    /**
     * Execute a mutating operation under the per-file lock.
     * `fn` receives the current checkpoint and may modify it in place;
     * the updated checkpoint is atomically written back.
     */
    async mutate(fn) {
        // 进程内锁先行：同进程内的并发直接串行，避免无谓的分布式锁往返。
        return withFileLock(this.filePath, () => this.withDistributedLock(async () => {
            // 必须在持有分布式锁后再读，否则读到的仍是他人临界区外的旧快照。
            const cp = await this.readRaw();
            await fn(cp);
            await this.writeRaw(cp);
            return cp;
        }));
    }
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
    async withDistributedLock(fn) {
        const opts = this.lockOptions;
        if (!opts)
            return fn();
        const ttlMs = opts.ttlMs ?? DEFAULT_LOCK_TTL_MS;
        const maxWaitMs = opts.maxWaitMs ?? DEFAULT_LOCK_MAX_WAIT_MS;
        const renewIntervalMs = opts.renewIntervalMs ?? Math.max(1_000, Math.floor(ttlMs / 3));
        const key = `checkpoint:${opts.lockKey}`;
        const startedAt = Date.now();
        const deadline = startedAt + maxWaitMs;
        let acquired = false;
        let delayMs = 20;
        while (Date.now() < deadline) {
            try {
                acquired = await opts.lock.acquireLock(key, this.ownerId, ttlMs);
            }
            catch (err) {
                // 锁后端故障：无法保证互斥。此时**不写**，交由上层重新入队。
                // （旧实现在这里无锁硬写，会覆盖其他节点的 runner_states。）
                opts.metrics?.onBackendError?.(key, err);
                throw new CheckpointLockUnavailableError(`checkpoint lock backend error for ${key}: ${err instanceof Error ? err.message : String(err)}`, key);
            }
            if (acquired)
                break;
            await new Promise((r) => setTimeout(r, delayMs));
            delayMs = Math.min(delayMs * 2, 500);
        }
        if (!acquired) {
            const waitedMs = Date.now() - startedAt;
            opts.metrics?.onRequeueRequired?.(key, waitedMs);
            // 关键行为变更：不再降级无锁写。
            // 无锁写会用旧快照覆盖他人已提交的数据（丢 L1 游标 → 永久重复抽取），
            // 代价远高于「本次放弃、重新入队后重跑」。
            throw new CheckpointLockUnavailableError(`failed to acquire ${key} within ${waitedMs}ms; skipping write (caller should requeue)`, key);
        }
        opts.metrics?.onAcquireWait?.(key, Date.now() - startedAt);
        // ── 续约：防止临界区超过 TTL 后锁被别人抢走造成静默双写 ──
        let lockLost = false;
        const renewTimer = setInterval(() => {
            void (async () => {
                try {
                    const renewed = await opts.lock.renewLock(key, this.ownerId, ttlMs);
                    if (!renewed) {
                        lockLost = true;
                        clearInterval(renewTimer);
                        opts.metrics?.onLockLost?.(key);
                        this.logger.warn?.(`[CHECKPOINT] lock ${key} renew rejected (lost ownership)`);
                    }
                }
                catch (err) {
                    lockLost = true;
                    clearInterval(renewTimer);
                    opts.metrics?.onLockLost?.(key);
                    this.logger.warn?.(`[CHECKPOINT] lock ${key} renew threw: ${err instanceof Error ? err.message : String(err)}`);
                }
            })();
        }, renewIntervalMs);
        // 不要让续约 timer 阻止进程退出
        renewTimer.unref?.();
        try {
            const result = await fn();
            // 临界区执行期间锁曾丢失 → 本次写入可能与他人交错，不能当作成功。
            if (lockLost) {
                throw new CheckpointLockUnavailableError(`lock ${key} was lost during the critical section; write is not trustworthy`, key);
            }
            return result;
        }
        finally {
            clearInterval(renewTimer);
            try {
                // 仅在仍持有锁时释放（丢锁后释放会误删新持有者的锁 —— 虽然后端有
                // owner 校验兜底，这里显式跳过更清晰）。
                if (!lockLost)
                    await opts.lock.releaseLock(key, this.ownerId);
            }
            catch {
                // 锁会随 TTL 自动过期，释放失败无需中断主流程
            }
        }
    }
    // ============================
    // Public API — read-only
    // ============================
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
    async read() {
        return this.readRaw();
    }
    /** Write a full checkpoint (acquires lock + atomic write). */
    async write(checkpoint) {
        return withFileLock(this.filePath, () => this.writeRaw(checkpoint));
    }
    // ============================
    // Public API — mutating (all serialized via file lock)
    // ============================
    // ============================
    // Persona methods (L3)
    // ============================
    async markPersonaGenerated(totalProcessed) {
        await this.mutate((cp) => {
            cp.last_persona_at = totalProcessed;
            cp.last_persona_time = new Date().toISOString();
            cp.memories_since_last_persona = 0;
            cp.request_persona_update = false;
            cp.persona_update_reason = "";
        });
    }
    async clearPersonaRequest() {
        await this.mutate((cp) => {
            cp.request_persona_update = false;
            cp.persona_update_reason = "";
        });
    }
    async setPersonaUpdateRequest(reason) {
        await this.mutate((cp) => {
            cp.request_persona_update = true;
            cp.persona_update_reason = reason;
        });
    }
    async incrementScenesProcessed() {
        const cp = await this.mutate((cp) => {
            cp.scenes_processed += 1;
        });
        this.logger.info(`[checkpoint] incrementScenesProcessed: scenes_processed=${cp.scenes_processed}`);
    }
    // ============================
    // Per-session helpers — runner state (L0/L1 owned)
    // ============================
    /**
     * Get or create runner session state for a session.
     */
    getRunnerState(cp, sessionKey) {
        if (!cp.runner_states) {
            cp.runner_states = {};
        }
        let state = cp.runner_states[sessionKey];
        if (!state) {
            state = { ...DEFAULT_RUNNER_STATE };
            cp.runner_states[sessionKey] = state;
        }
        return state;
    }
    // ============================
    // Per-session helpers — pipeline state (PipelineManager owned)
    // ============================
    /**
     * Get or create pipeline session state for a session.
     */
    getPipelineState(cp, sessionKey) {
        if (!cp.pipeline_states) {
            cp.pipeline_states = {};
        }
        let state = cp.pipeline_states[sessionKey];
        if (!state) {
            state = { ...DEFAULT_PIPELINE_STATE, last_active_time: Date.now() };
            cp.pipeline_states[sessionKey] = state;
        }
        return state;
    }
    /**
     * Get all pipeline states from checkpoint.
     */
    getAllPipelineStates(cp) {
        return cp.pipeline_states ?? {};
    }
    /**
     * Merge pipeline session states into the checkpoint (used by pipeline persister).
     * Acquires the file lock so this is safe against concurrent mutations.
     *
     * This writes ONLY to `pipeline_states`, never touching `runner_states`.
     * This is the core guarantee that eliminates the split-brain overwrite bug.
     */
    async mergePipelineStates(states) {
        await this.mutate((cp) => {
            if (!cp.pipeline_states)
                cp.pipeline_states = {};
            for (const [key, pState] of Object.entries(states)) {
                cp.pipeline_states[key] = {
                    ...cp.pipeline_states[key],
                    ...pState,
                };
            }
        });
    }
    // ============================
    // L1-specific methods
    // ============================
    /**
     * Mark L1 extraction completed: reset sinceL1 counter, advance L1 cursor,
     * and optionally save the last scene name for cross-batch continuity.
     *
     * @param cursorRecordedAtMs - The max recorded_at epoch ms of processed L0 messages.
     *   This becomes the new `last_l1_cursor` value (recorded_at semantics, not conversation timestamp).
     */
    async markL1ExtractionComplete(sessionKey, memoriesExtracted, cursorRecordedAtMs, lastSceneName) {
        let regressed = false;
        await this.mutate((cp) => {
            const state = this.getRunnerState(cp, sessionKey);
            if (cursorRecordedAtMs) {
                // P0-2: 单调递增，绝不回退。
                //
                // cursorRecordedAtMs 由调用方基于 createL1Runner 开头那次**无锁快照**
                // 算出，中间跨越了整个 L1 LLM 抽取。若期间该session 的游标已被推进
                // （重投、drain、并发节点），直接赋值会把游标往回拨→ 同一批 L0 被
                // 反复抽取，新数据永远排不上。取大后写入天然幂等。
                if (cursorRecordedAtMs > state.last_l1_cursor) {
                    state.last_l1_cursor = cursorRecordedAtMs;
                }
                else if (cursorRecordedAtMs < state.last_l1_cursor) {
                    regressed = true;
                }
            }
            if (lastSceneName !== undefined) {
                state.last_scene_name = lastSceneName;
            }
            cp.total_memories_extracted += memoriesExtracted;
            cp.memories_since_last_persona += memoriesExtracted;
        });
        if (regressed) {
            this.logger.warn?.(`[checkpoint] markL1ExtractionComplete session=${sessionKey}: ` +
                `stale cursor ${cursorRecordedAtMs} < persisted value, kept the newer one` +
                `(concurrent advance detected; no rollback)`);
        }
        this.logger.info(`[checkpoint] markL1ExtractionComplete session=${sessionKey}: ` +
            `extracted=${memoriesExtracted}, cursor=${cursorRecordedAtMs ?? "(unchanged)"}, ` +
            `lastScene="${lastSceneName ?? "(unchanged)"}"`);
    }
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
    async repairMonotonicCounters(expected) {
        let repaired = false;
        await this.mutate((cp) => {
            if (expected.scenes_processed !== undefined && cp.scenes_processed < expected.scenes_processed) {
                cp.scenes_processed = expected.scenes_processed;
                repaired = true;
            }
            if (expected.total_processed !== undefined && cp.total_processed < expected.total_processed) {
                cp.total_processed = expected.total_processed;
                repaired = true;
            }
        });
        return repaired;
    }
    // ============================
    // Atomic capture (race-condition fix)
    // ============================
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
    async captureAtomically(sessionKey, pluginStartTimestamp, fn) {
        await this.mutate(async (cp) => {
            // Read the per-session cursor inside the lock
            const state = this.getRunnerState(cp, sessionKey);
            let afterTimestamp = state.last_captured_timestamp || 0;
            // Cold-start guard (same logic that was previously in auto-capture.ts)
            if (afterTimestamp === 0 && pluginStartTimestamp && pluginStartTimestamp > 0) {
                afterTimestamp = pluginStartTimestamp;
            }
            const result = await fn(afterTimestamp);
            if (result) {
                // Advance per-session cursor (runner-owned)
                state.last_captured_timestamp = result.maxTimestamp;
                // Global stats (aggregate only — not used for filtering)
                cp.last_captured_timestamp = Math.max(cp.last_captured_timestamp, result.maxTimestamp);
                cp.total_processed += result.messageCount;
                // Increment L0 conversation count (was a separate mutate() call before)
                cp.l0_conversations_count += 1;
            }
        });
    }
}
