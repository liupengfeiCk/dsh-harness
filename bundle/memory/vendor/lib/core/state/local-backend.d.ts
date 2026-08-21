/**
 * LocalStateBackend — 进程内 Pipeline 状态后端 (开源单机版)
 *
 * 需求 #7.3: 基于进程内 Map/setTimeout/SerialQueue/文件 Checkpoint，零外部依赖。
 * 将现有 MemoryPipelineManager 中的状态管理逻辑封装为 IStateBackend 实现。
 */
import type { IStateBackend, PipelineSessionState, TimerEntry, TaskPayload, CaptureAtomicParams, CaptureAtomicResult } from "./types.js";
export declare class LocalStateBackend implements IStateBackend {
    private sessionStates;
    private buffers;
    private timers;
    private taskQueue;
    private locks;
    private consumeWaiters;
    private onTimerExpired?;
    private destroyed;
    constructor(options?: {
        onTimerExpired?: (entry: TimerEntry) => void;
    });
    /**
     * Map key 拼成 `{instanceId}:{teamId}:{agentId}:{sessionId}` —— 与 RedisStateBackend 的
     * hash tag 形态对齐：同一 (inst, tid, aid, sess) 必然 hash 到同一桶。
     * tid/aid 缺失（旧调用）时用 "_" 占位，等价于退化到 instance 维度。
     */
    private k;
    appendBuffer(instanceId: string, sessionId: string, message: string, teamId?: string, agentId?: string): Promise<void>;
    drainBuffer(instanceId: string, sessionId: string, teamId?: string, agentId?: string): Promise<string[]>;
    getBufferLength(instanceId: string, sessionId: string, teamId?: string, agentId?: string): Promise<number>;
    getSessionState(instanceId: string, sessionId: string, teamId?: string, agentId?: string): Promise<PipelineSessionState | null>;
    updateSessionState(instanceId: string, sessionId: string, patch: Partial<PipelineSessionState>, teamId?: string, agentId?: string): Promise<void>;
    deleteSessionState(instanceId: string, sessionId: string, teamId?: string, agentId?: string): Promise<void>;
    listActiveSessions(instanceId: string): Promise<string[]>;
    setTimer(instanceId: string, member: string, fireAtMs: number): Promise<void>;
    setTimerIfEarlier(instanceId: string, member: string, fireAtMs: number): Promise<boolean>;
    removeTimer(instanceId: string, member: string): Promise<void>;
    getExpiredTimers(instanceId: string, nowMs: number): Promise<TimerEntry[]>;
    enqueueTask(task: TaskPayload): Promise<void>;
    consumeTask(_workerId: string, blockMs?: number): Promise<TaskPayload | null>;
    ackTask(_taskId: string): Promise<void>;
    getQueueDepth(): Promise<{
        high: number;
        low: number;
    }>;
    /**
     * Snapshot of every task currently waiting in `taskQueue` (FIFO + priority order).
     * Returns a shallow copy so callers can safely iterate without holding a
     * reference into our internal array. Tasks already consumed by a worker
     * are NOT included (they live in PipelineWorker.runningTasks instead).
     */
    listQueuedTasks(): Promise<TaskPayload[]>;
    private cleanExpiredLocks;
    acquireLock(key: string, ownerId: string, ttlMs: number): Promise<boolean>;
    renewLock(key: string, ownerId: string, ttlMs: number): Promise<boolean>;
    releaseLock(key: string, ownerId: string): Promise<void>;
    captureAtomic(params: CaptureAtomicParams): Promise<CaptureAtomicResult>;
    purgeInstance(instanceId: string): Promise<{
        sessions: number;
        timers: number;
        buffers: number;
    }>;
    initialize(): Promise<void>;
    destroy(): Promise<void>;
    getSnapshot(): {
        sessions: number;
        buffers: number;
        timers: number;
        queue: number;
        locks: number;
    };
}
