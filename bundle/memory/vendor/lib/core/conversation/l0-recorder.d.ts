/**
 * L0 Conversation Recorder: records raw conversation messages to local JSONL files.
 *
 * Triggered from agent_end hook. Receives the conversation messages directly from
 * the hook context (no file I/O needed), sanitizes them, filters out noise, and
 * writes to ~/.openclaw/memory-tdai/conversations/YYYY-MM-DD.jsonl
 *
 * Design decisions:
 * - Uses JSONL format (**one message per line** — flat, easy to grep/stream)
 * - One file per day (all sessions merged into the same daily file)
 * - sessionKey is stored as a field in each JSONL line, not in the filename
 * - Independent from system session files — format fully controlled by plugin
 * - Messages are sanitized to remove injected tags (prevent feedback loops)
 * - Short/long/command messages are filtered out
 */
import type { StorageAdapter } from "../storage/adapter.js";
import type { Logger } from "../types.js";
export interface ConversationMessage {
    /** Unique message ID (used by L1 prompt for source_message_ids tracking) */
    id: string;
    role: "user" | "assistant";
    content: string;
    timestamp: number;
}
/**
 * New flat format: one message per JSONL line.
 */
export interface L0MessageRecord {
    sessionKey: string;
    sessionId: string;
    /** Three-dim tenancy isolation. Optional during rollout — see
     *  docs/l0l3-tenant-isolation-design.md. */
    userId?: string;
    agentId?: string;
    recordedAt: string;
    id: string;
    role: "user" | "assistant";
    content: string;
    timestamp: number;
}
/**
 * A group of conversation messages (used by downstream consumers).
 * Each L0ConversationRecord represents one or more messages from the same recording event.
 */
export interface L0ConversationRecord {
    sessionKey: string;
    sessionId: string;
    recordedAt: string;
    messageCount: number;
    messages: ConversationMessage[];
}
/**
 * Record a conversation round to the L0 JSONL file.
 *
 * Only records **incremental** messages (new since the last capture).
 * Uses `afterTimestamp` as the primary filter to skip already-captured history.
 *
 * @param sessionKey - The session key for this conversation
 * @param rawMessages - Raw messages from the agent_end hook context (full session history)
 * @param baseDir - Base data directory (~/.openclaw/memory-tdai/)
 * @param logger - Optional logger
 * @param originalUserText - Clean original user prompt (pre-prependContext)
 * @param afterTimestamp - Epoch ms cursor: only messages with timestamp > this are new.
 *                         Pass 0 or omit for the first capture of a session.
 * @returns Filtered messages (for L1 to use directly), or empty array if nothing worth recording
 */
export declare function recordConversation(params: {
    sessionKey: string;
    sessionId?: string;
    /** Three-dim tenancy isolation, propagated into every L0 record written. */
    userId?: string;
    agentId?: string;
    rawMessages: unknown[];
    baseDir: string;
    logger?: Logger;
    /** Clean original user prompt (pre-prependContext) */
    originalUserText?: string;
    /** Epoch ms cursor: only process messages with timestamp strictly greater than this. */
    afterTimestamp?: number;
    /**
     * Number of messages in the session at before_prompt_build time.
     * Used to locate the exact user message that originalUserText corresponds to:
     * rawMessages[originalUserMessageCount] is the user message appended by the framework
     * AFTER before_prompt_build, i.e. the one whose content was polluted by prependContext.
     */
    originalUserMessageCount?: number;
    /** StorageAdapter for file operations (COS/local). Falls back to fs when absent. */
    storage?: StorageAdapter;
}): Promise<ConversationMessage[]>;
/**
 * Read all L0 conversation records for a session.
 * Returns records in chronological order.
 *
 * File format: `YYYY-MM-DD.jsonl` (daily files, all sessions merged).
 * Each line is an L0MessageRecord; filtered by sessionKey at line level.
 */
export declare function readConversationRecords(sessionKey: string, baseDir: string, logger?: Logger, storage?: StorageAdapter): Promise<L0ConversationRecord[]>;
/**
 * Read L0 messages across all conversation records for a session,
 * optionally filtered by a cursor timestamp (messages after the cursor).
 *
 * When `limit` is provided, only the **newest** `limit` messages are returned
 * (matching the DB path's `ORDER BY timestamp DESC LIMIT ?` behavior).
 * Returned messages are always in chronological order (oldest → newest).
 *
 * NOTE: potential optimization — records are chronologically ordered (append-only JSONL),
 * so a reverse scan could skip entire old records. Deferred for now; see Issue 5 in
 * docs/05-known-issues.md.
 */
export declare function readConversationMessages(sessionKey: string, baseDir: string, afterTimestamp?: number, logger?: Logger, limit?: number): Promise<ConversationMessage[]>;
/**
 * A group of conversation messages sharing the same sessionId.
 */
export interface SessionIdMessageGroup {
    sessionId: string;
    messages: Array<ConversationMessage & {
        recordedAtMs: number;
    }>;
}
/**
 * Read L0 messages for a session, grouped by sessionId.
 *
 * Within the same sessionKey, different sessionIds represent different conversation
 * instances (e.g. after /reset). L1 extraction should process each group independently
 * so that each group's sessionId is correctly associated with its extracted memories.
 *
 * When `limit` is provided, only the **newest** `limit` messages (across all groups)
 * are retained — matching the DB path's `ORDER BY recorded_at DESC LIMIT ?` behavior.
 * Groups that become empty after truncation are dropped.
 *
 * Groups are returned in chronological order (by earliest message timestamp).
 * Messages within each group are also in chronological order.
 *
 * @param afterRecordedAtMs - Epoch ms cursor: only messages with recordedAt > this are included.
 */
export declare function readConversationMessagesGroupedBySessionId(sessionKey: string, baseDir: string, afterRecordedAtMs?: number, logger?: Logger, limit?: number): Promise<SessionIdMessageGroup[]>;
