/**
 * MemoryPipelineManager: manages the L0→L1→L2→L3 memory extraction pipeline.
 *
 * ## Layered architecture
 *
 * - **L0 (capture)**: `auto-capture.ts` extracts new messages from each
 *   `agent_end` event, sanitizes them, and passes them to the pipeline via
 *   `notifyConversation(sessionKey, messages)`. Messages are buffered
 *   locally per-session — NO remote call happens at this stage.
 *
 * - **L1 (batch extraction / ingest)**: When the conversation count reaches
 *   `everyNConversations` OR the session goes idle for `l1IdleTimeoutSeconds`,
 *   the L1 Runner is invoked with all buffered messages. The runner receives
 *   `{ sessionKey, msg, bg_msg }` and is responsible for ingesting/extracting
 *   them (e.g. calling appendEvent, or running local extraction logic).
 *   `bg_msg` is reserved for background context; currently always empty.
 *
 * - **L2 (scene extraction)**: Per-session downward-only timer. After each
 *   L2 completion, the next fire time is set to `now + maxInterval`. When
 *   L1 completes (new memory event), the fire time is advanced (but never
 *   postponed) to `max(now + delay, lastL2 + minInterval)`. When the timer
 *   fires, if the session is cold (inactive > `sessionActiveWindowHours`),
 *   the timer is cancelled rather than triggering L2 — it will be re-armed
 *   by the next L1 event.
 *
 * - **L3 (persona generation)**: Global mutex (concurrency=1) + pending flag
 *   dedup. Triggered after L2 completes.
 *
 * ## Timer semantics
 *
 * L1 uses a **resettable timer** (classic idle/debounce): each conversation
 * resets the countdown to `l1IdleTimeoutSeconds`. When the timer fires,
 * buffered messages are flushed through L1.
 *
 * L2 uses a **downward-only timer**: the scheduled fire time can only be
 * moved earlier, never later. This ensures both the maxInterval guarantee
 * and the delay-after-L1 responsiveness, while minInterval acts as a floor.
 *
 * Both timer types are implemented via `ManagedTimer` to eliminate
 * repetitive clear→set→fire→clean boilerplate.
 *
 * ## Trigger paths for L1
 *   A. **Conversation threshold** (primary): when `conversation_count >=
 *      effectiveThreshold` in `notifyConversation()`, L1 is triggered
 *      immediately with all buffered messages. The effective threshold
 *      is influenced by warm-up mode (see below).
 *   B. **Idle timeout** (catch-up): when a session goes idle for
 *      `l1IdleTimeoutSeconds`, L1 fires with whatever messages have
 *      been buffered (below threshold).
 *   C. **Shutdown flush**: on graceful shutdown, all pending buffers
 *      are flushed through L1 then L2.
 *
 * ## Warm-up mode
 *
 * When `enableWarmup` is true (default), new sessions use an exponentially
 * increasing L1 trigger threshold instead of jumping straight to
 * `everyNConversations`. The sequence is: 1 → 2 → 4 → 8 → ... →
 * everyNConversations. This ensures early conversations are processed
 * quickly (first conversation triggers L1 immediately), while gradually
 * reducing processing frequency as the session matures.
 *
 * The `warmup_threshold` field in PipelineSessionState tracks the current
 * threshold. A value of 0 means warm-up is complete (graduated to
 * steady-state). The threshold doubles after each successful L1 run.
 *
 * ## Trigger paths for L2
 *   A. **Delay-after-L1**: L1 completes → timer advanced to
 *      `max(now + delay, lastL2 + min)` → fires → enqueue L2.
 *   B. **MaxInterval guarantee**: L2 completes → timer set to
 *      `now + maxInterval` → fires → enqueue L2 (if session active).
 *   C. **Shutdown flush**: all pending L2 timers are flushed.
 *
 * All queues use SerialQueue (concurrency=1) for serial execution.
 *
 * ## Design doc
 * See `docs/08-pipeline-refactor-design.md` for full architecture.
 */
import type { PipelineSessionState } from "./checkpoint.js";
import { SessionFilter } from "./session-filter.js";
import type { Logger } from "../core/types.js";
/** A single captured message ready for L1 processing. */
export interface CapturedMessage {
    role: "user" | "assistant" | "tool";
    content: string;
    /** ISO timestamp string */
    timestamp: string;
}
/** Pipeline configuration — all time values in seconds. */
export interface PipelineConfig {
    /**
     * Conversation count threshold to trigger L1 batch processing.
     * When a session's conversation_count reaches this value,
     * L1 is triggered immediately with all buffered messages.
     * Default: 5.
     */
    everyNConversations: number;
    /**
     * Enable warm-up mode for new sessions.
     * When enabled, the L1 trigger threshold starts at 1 and doubles after
     * each successful L1 run (1 → 2 → 4 → 8 → ... → everyNConversations),
     * allowing early sessions to be processed more aggressively.
     * Default: true.
     */
    enableWarmup: boolean;
    l1: {
        /** Idle timeout before triggering L1 (seconds, default: 60) */
        idleTimeoutSeconds: number;
    };
    l2: {
        /**
         * Delay after L1 completes before triggering L2 (seconds, default: 90).
         * Allows remote L1 to finish generating records asynchronously.
         */
        delayAfterL1Seconds: number;
        /** Minimum interval between L2 extractions per session (seconds, default: 900) */
        minIntervalSeconds: number;
        /**
         * Maximum interval between L2 extractions per session (seconds, default: 3600).
         * Even without new L1 completions, L2 will poll at this interval for active sessions.
         */
        maxIntervalSeconds: number;
        /**
         * Sessions inactive longer than this (hours, default: 24) stop L2 polling.
         * Prevents wasting resources on abandoned sessions.
         */
        sessionActiveWindowHours: number;
    };
}
/** Result returned by the L1 runner. */
export interface L1RunnerResult {
    /** Number of messages successfully processed */
    processedCount?: number;
    /** Agent/profile-level L2 keys affected by this L1 run. */
    profileScopes?: string[];
    /**
     * True iff there are still L0 rows past the cursor that this run did not
     * consume. The runner detects backlog by over-fetching (query 2N rows but
     * process at most N). Pipeline-manager uses this to decide whether to
     * schedule another L1 run.
     *
     * Semantics (let R = rows returned by the over-fetch, N = batch size):
     *   - R == 2N → `hasFullBacklog=true`  (DB likely has many more, drain ASAP)
     *   - N <  R <  2N → `hasMore=true`    (small tail, defer to next idle)
     *   - R <= N → both flags false        (fully consumed)
     */
    hasMore?: boolean;
    /** True iff the over-fetch returned exactly 2N rows — drain via direct enqueue. */
    hasFullBacklog?: boolean;
}
/** L1 runner — batch-processes buffered messages for a session. */
export type L1Runner = (params: {
    sessionKey: string;
    msg: CapturedMessage[];
    bg_msg: CapturedMessage[];
}) => Promise<L1RunnerResult | void>;
/** Result returned by the L2 extraction runner. */
export interface L2RunnerResult {
    /** The latest `updated_at` cursor from the processed batch. */
    latestCursor?: string;
    /** True if no new records were found and extraction was skipped. */
    skipped?: boolean;
}
/** L2 extraction runner — processes a single session's records. */
export type L2Runner = (sessionKey: string, cursor?: string) => Promise<L2RunnerResult | void>;
/** L3 runner — generates persona from all sessions' scene data. */
export type L3Runner = () => Promise<void>;
/** Callback to persist session states to checkpoint. */
export type PipelineStatePersister = (states: Record<string, PipelineSessionState>) => Promise<void>;
export declare class MemoryPipelineManager {
    private readonly l1IdleTimeoutMs;
    private readonly everyNConversations;
    private readonly enableWarmup;
    private readonly l2DelayAfterL1Ms;
    private readonly l2MinIntervalMs;
    private readonly l2MaxIntervalMs;
    private readonly sessionActiveWindowMs;
    /** Delay before retrying a failed L1 (ms). */
    private readonly L1_RETRY_DELAY_MS;
    /** Max consecutive L1 retries per session before giving up. */
    private readonly L1_MAX_RETRIES;
    private readonly l1Queue;
    private readonly l2Queue;
    private readonly l3Queue;
    private l3Pending;
    private l3Running;
    private readonly sessionStates;
    private readonly sessionTimers;
    private readonly messageBuffers;
    private readonly l2LastRunTime;
    private l1Runner;
    private l2Runner;
    private l3Runner;
    private persister;
    private logger;
    private readonly sessionFilter;
    private destroyed;
    /** Plugin instance ID for metric reporting (set externally after async init). */
    instanceId?: string;
    /** Multiplier on sessionActiveWindowMs to determine GC eligibility. */
    private readonly SESSION_GC_INACTIVE_MULTIPLIER;
    /** Run GC every N calls to notifyConversation. */
    private readonly SESSION_GC_EVERY_N_NOTIFICATIONS;
    /** Counter for GC scheduling. */
    private notifyCounter;
    constructor(config: PipelineConfig, logger?: Logger, sessionFilter?: SessionFilter);
    setL1Runner(runner: L1Runner): void;
    setL2Runner(runner: L2Runner): void;
    setL3Runner(runner: L3Runner): void;
    setPersister(persister: PipelineStatePersister): void;
    /**
     * Restore session states from checkpoint and start the pipeline.
     * Sessions with pending counts will be immediately re-enqueued.
     */
    start(restoredStates?: Record<string, PipelineSessionState>): void;
    /**
     * Get the effective conversation threshold for a session, considering warm-up.
     *
     * When warm-up is enabled, new sessions start with threshold=1 and double
     * after each successful L1 run: 1 → 2 → 4 → 8 → ... → everyNConversations.
     * Once the threshold reaches everyNConversations, warm-up is considered complete
     * (warmup_threshold is set to 0) and the fixed config value is used.
     */
    private getEffectiveThreshold;
    /**
     * Advance the warm-up threshold for a session after a successful L1 run.
     * Doubles the threshold until it reaches everyNConversations, then marks
     * warm-up as complete (warmup_threshold = 0).
     */
    private advanceWarmupThreshold;
    /**
     * Notify the pipeline that a conversation round has ended for a session,
     * and buffer the captured messages for L1 batch processing.
     *
     * Two trigger paths start here:
     * - **Path A (threshold)**: if conversation_count >= effective threshold
     *   (warm-up or steady-state), trigger L1 immediately with all buffered messages.
     * - **Path B (idle)**: reset the L1 idle timer. When the timer fires (user
     *   stops chatting), L1 runs with whatever has been buffered.
     */
    notifyConversation(sessionKey: string, messages: CapturedMessage[]): Promise<void>;
    /**
     * Per-session flush — scoped end-of-session handling.
     *
     * Semantically different from {@link destroy}:
     *   - ``destroy`` tears down the *whole* scheduler (meant for process
     *     shutdown such as OpenClaw's ``gateway_stop``).
     *   - ``flushSession`` only processes the one session identified by
     *     ``sessionKey`` and leaves every other session's timers, buffers
     *     and pipeline state untouched.  This is the correct semantic for
     *     the Gateway's ``POST /session/end`` endpoint and for Hermes'
     *     ``on_session_end`` callback, which fire when one conversation
     *     ends while the process keeps serving other concurrent sessions.
     *
     * What it does:
     *   1. Cancel the session's pending L1 idle timer (no further idle
     *      fires for this key).
     *   2. If the session's message buffer still holds work, enqueue an
     *      immediate L1 run for this session (``triggerReason="flush"``).
     *   3. Await the shared ``l1Queue`` so the caller observes L1
     *      completion before returning.  We do not selectively wait
     *      because L1 is already a single-consumer SerialQueue — waiting
     *      for ``onIdle`` is the cheapest correct signal.
     *
     * What it deliberately does NOT do:
     *   - Touch other sessions' timers / buffers / pipeline state.
     *   - Destroy the scheduler or any of its queues.
     *   - Reset global fields such as ``destroyed``.
     *
     * Unknown session keys are a no-op: the scheduler may legitimately
     * have evicted the session earlier via GC, or the session may never
     * have produced any captures.
     */
    flushSession(sessionKey: string): Promise<void>;
    /**
     * Maximum time (ms) to wait for pipeline flush during destroy.
     * Must be shorter than the gateway_stop hook timeout (3 s) to leave
     * headroom for VectorStore / EmbeddingService cleanup that runs after.
     */
    private readonly DESTROY_TIMEOUT_MS;
    /**
     * Graceful shutdown with timeout protection:
     * 1. Mark destroyed, stop accepting new work
     * 2. Attempt to flush pending L1/L2/L3 work within DESTROY_TIMEOUT_MS
     * 3. If flush times out or fails, persist current state for recovery on next startup
     * 4. Pending work is never lost — it will be recovered via checkpoint on next start()
     */
    destroy(): Promise<void>;
    /**
     * Internal: attempt to flush all pending pipeline work (L1 → L2 → L3).
     * Extracted from destroy() so it can be wrapped with a timeout.
     */
    private _doFlush;
    private onL1IdleTimeout;
    private enqueueL1;
    /**
     * L1 runner: Takes all buffered messages for a session and passes them
     * to the L1Runner for batch processing (e.g. appendEvent, local extraction).
     *
     * After L1 completes successfully:
     * - conversation_count and message buffer are reset
     * - L2 timer is advanced (downward-only) to allow remote record generation
     *
     * If L1 fails, conversation_count and buffer are preserved for retry
     * on next idle timeout or threshold trigger.
     */
    private runL1;
    /**
     * Advance the per-session L2 timer after an L1 event (new memory generated).
     *
     * Computes the desired fire time as:
     *   T_desired = max(now + l2DelayAfterL1, lastL2Time + l2MinInterval)
     *
     * The timer is only moved if T_desired is earlier than the current schedule
     * (downward-only semantics). If no timer is pending, it's set unconditionally.
     */
    private advanceL2Timer;
    /**
     * Arm the L2 timer for the maxInterval guarantee after L2 completes.
     * Sets T = now + l2MaxInterval (unconditional, replaces any pending timer).
     */
    private armL2MaxInterval;
    /**
     * Called when a per-session L2 timer fires.
     *
     * Checks session activity: if the session is cold (inactive > activeWindow),
     * the timer is NOT re-armed — it will be revived by the next L1 event.
     * Otherwise, enqueues L2.
     *
     * The `source` parameter distinguishes the trigger origin:
     * - "delay-after-l1": fired shortly after L1 completed — skip cold check
     *   because L1 completion itself proves recent activity.
     * - "max-interval": periodic timer — apply cold check normally.
     */
    private onL2TimerFired;
    private enqueueL2;
    private runL2;
    private triggerL3;
    private enqueueL3;
    private runL3;
    private getOrCreateState;
    private getOrCreateTimers;
    private persistStates;
    /**
     * Evict cold sessions from in-memory maps to prevent unbounded growth.
     *
     * A session is eligible for GC when:
     * 1. Inactive for > sessionActiveWindowMs * SESSION_GC_INACTIVE_MULTIPLIER
     * 2. No queued/running L1 or L2 tasks
     * 3. No buffered messages pending processing
     *
     * Evicted sessions can be fully restored from checkpoint on next
     * `notifyConversation()` (state) or `start()` (recovery).
     */
    private gcStaleSessions;
    /**
     * Recovery: re-enqueue sessions that have pending work from before restart.
     *
     * On restart, message buffers are empty (in-memory only). Sessions with
     * non-zero conversation_count had messages that were either:
     * 1. Already processed by L1 (l2_pending_l1_count > 0) → arm L2 timer
     * 2. Never reached L1 (conversation_count > 0, messages lost) → arm L2
     *    as best-effort recovery
     *
     * We arm L2 timers (with delay) rather than enqueuing immediately,
     * because the pipeline may be starting during management commands.
     */
    private recoverPendingSessions;
    /** Get the pipeline session state for a session (read-only copy). */
    getSessionState(sessionKey: string): PipelineSessionState | undefined;
    /** Get the buffered message count for a session. */
    getBufferedMessageCount(sessionKey: string): number;
    /** Get all session keys being tracked. */
    getSessionKeys(): string[];
    /** Whether the pipeline has been destroyed. */
    get isDestroyed(): boolean;
    /** Queue sizes and running state for monitoring. */
    getQueueSizes(): {
        l1: number;
        l2: number;
        l3: number;
        l1Pending: boolean;
        l2Pending: boolean;
        l3Pending: boolean;
        l1Idle: boolean;
        l2Idle: boolean;
        l3Idle: boolean;
    };
}
