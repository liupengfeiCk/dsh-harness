/**
 * ManagedTimer: a named, lifecycle-managed wrapper around setTimeout.
 *
 * Eliminates repetitive clear→set→fire→clean patterns by providing:
 * - `schedule(delayMs, cb)` — cancel any pending timer, set a new one
 * - `scheduleAt(epochMs, cb)` — schedule by absolute time point
 * - `tryAdvanceTo(epochMs, cb)` — only reschedule if new time is *earlier*
 * - `cancel()` — cancel without triggering
 * - `flush()` — trigger immediately (for graceful shutdown)
 * - `pending` — whether a timer is waiting
 *
 * The optional `isDestroyed` guard prevents firing after the owner is torn down.
 */
export declare class ManagedTimer {
    /** Human-readable name for logging. */
    readonly name: string;
    /** If provided, checked before firing — skips callback when true. */
    private readonly isDestroyed?;
    private handle;
    private callback;
    /** Absolute epoch-ms when the current timer is scheduled to fire. */
    private scheduledAt;
    constructor(
    /** Human-readable name for logging. */
    name: string, 
    /** If provided, checked before firing — skips callback when true. */
    isDestroyed?: () => boolean);
    /**
     * Cancel any pending timer and schedule a new one after `delayMs`.
     * The callback fires once; the timer auto-clears after firing.
     */
    schedule(delayMs: number, callback: () => void): void;
    /**
     * Cancel any pending timer and schedule to fire at an absolute epoch-ms.
     * If `epochMs` is in the past, fires on next tick (delay = 0).
     */
    scheduleAt(epochMs: number, callback: () => void): void;
    /**
     * Only reschedule if `epochMs` is *earlier* than the current scheduled time.
     * This implements the "downward-only" timer pattern (L2 scheduling).
     * If no timer is pending, behaves like `scheduleAt()`.
     *
     * @returns true if the timer was actually advanced (or newly set).
     */
    tryAdvanceTo(epochMs: number, callback: () => void): boolean;
    /**
     * Cancel the pending timer without triggering the callback.
     */
    cancel(): void;
    /**
     * Immediately trigger the callback (if pending) and clear the timer.
     * Used for graceful shutdown to flush pending work.
     *
     * Note: Unlike `fire()`, this method intentionally does NOT check `isDestroyed`.
     * This is by design — during shutdown, `destroy()` sets `destroyed = true` first,
     * then calls `flush()` to drain pending work. The `isDestroyed` guard only applies
     * to natural timer expiration via `fire()`, not to explicit shutdown flushes.
     */
    flush(): void;
    /** Whether a timer is currently pending. */
    get pending(): boolean;
    /** The epoch-ms when the current timer is scheduled to fire (0 if none). */
    get scheduledTime(): number;
    private fire;
    private cancelInternal;
}
