/**
 * SerialQueue: a lightweight task queue with concurrency=1.
 *
 * Equivalent to `new PQueue({ concurrency: 1 })` but with zero external
 * dependencies. Supports:
 * - Serial execution (FIFO)
 * - `add(fn)` to enqueue a task (returns the task's result promise)
 * - `onIdle()` to wait until all queued tasks have completed
 * - `pause()` / `start()` to suspend/resume execution
 * - `size` to check pending task count
 * - Optional debug logger for enqueue/dequeue/complete diagnostics
 */
type Task<T = unknown> = () => Promise<T>;
export declare class SerialQueue {
    /** Human-readable name for logging / diagnostics. */
    readonly name: string;
    private queue;
    private running;
    private paused;
    private idleResolvers;
    /** Optional debug logger — receives diagnostic messages for enqueue/dequeue/complete. */
    private debugFn?;
    constructor(name?: string);
    /** Set a debug logger for queue diagnostics. */
    setDebugLogger(fn: (msg: string) => void): void;
    /** Number of tasks waiting to be executed. */
    get size(): number;
    /** Whether a task is currently executing. */
    get pending(): boolean;
    /** Whether the queue is idle (no queued tasks and nothing running). */
    get idle(): boolean;
    /** Add a task to the queue. Returns the task's result promise. */
    add<T>(task: Task<T>): Promise<T>;
    /** Pause the queue. Currently running task will finish, but no new tasks start. */
    pause(): void;
    /** Resume the queue after pause(). */
    start(): void;
    /** Returns a promise that resolves when all queued tasks have completed. */
    onIdle(): Promise<void>;
    /** Clear all pending (not yet started) tasks. */
    clear(): void;
    private drain;
}
export {};
