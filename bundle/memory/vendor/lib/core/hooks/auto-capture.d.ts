/**
 * auto-capture hook (v3): records conversation messages locally (L0),
 * then notifies the MemoryPipelineManager for L1/L2/L3 scheduling.
 *
 * Key design decisions:
 * - Always write L0 locally via l0-recorder.
 * - When VectorStore + EmbeddingService are available, also write L0 vector index.
 * - Notify MemoryPipelineManager for L1/L2/L3 trigger evaluation.
 * - L1 Runner reads from VectorStore DB (primary) or L0 JSONL files (fallback).
 * - Extraction is NOT triggered here. The pipeline manager decides when.
 */
import type { MemoryTdaiConfig } from "../../config.js";
import type { MemoryPipelineManager } from "../../utils/pipeline-manager.js";
import type { ConversationMessage } from "../conversation/l0-recorder.js";
import { type IMemoryStore } from "../store/types.js";
import type { EmbeddingService } from "../store/embedding.js";
import type { StorageAdapter } from "../storage/adapter.js";
import type { Logger } from "../types.js";
export interface AutoCaptureResult {
    /** Whether the scheduler was notified (conversation count incremented) */
    schedulerNotified: boolean;
    /** Number of messages recorded to L0 */
    l0RecordedCount: number;
    /** Number of L0 message vectors written */
    l0VectorsWritten: number;
    /** Filtered messages for L1 immediate use */
    filteredMessages: ConversationMessage[];
}
export declare function performAutoCapture(params: {
    messages: unknown[];
    sessionKey: string;
    sessionId?: string;
    cfg: MemoryTdaiConfig;
    pluginDataDir: string;
    logger?: Logger;
    scheduler?: MemoryPipelineManager;
    /** Clean original user prompt from before_prompt_build cache (pre-prependContext). */
    originalUserText?: string;
    /**
     * Number of messages in the session at before_prompt_build time.
     * Used by l0-recorder to locate the exact user message that originalUserText
     * corresponds to: rawMessages[originalUserMessageCount] is the polluted user message.
     */
    originalUserMessageCount?: number;
    /** Epoch ms when the plugin was registered (cold-start time).
     *  Used as fallback cursor when checkpoint has no prior timestamp —
     *  prevents the first agent_end from dumping all session history into L0. */
    pluginStartTimestamp?: number;
    /** VectorStore for L0 vector indexing (optional). */
    vectorStore?: IMemoryStore;
    /** EmbeddingService for L0 vector indexing (optional). */
    embeddingService?: EmbeddingService;
    /**
     * Tracks in-flight fire-and-forget background tasks started by this
     * capture (currently: deferred L0 embedding for SQLite-style stores).
     *
     * When provided, each background task's Promise is added to the set
     * on creation and removed on completion.  This lets the owning
     * ``TdaiCore`` instance await all pending background work before
     * closing ``vectorStore`` / ``embeddingService`` in ``destroy()``,
     * so we never hit an already-closed DB connection with a late
     * ``updateL0Embedding`` call.
     *
     * Optional for backwards compatibility — callers that don't care
     * (tests, short-lived CLI invocations) can omit it and accept the
     * pre-fix behaviour (background task may outlive its owner).
     */
    bgTaskRegistry?: Set<Promise<void>>;
    /** StorageAdapter for file operations (COS/local). Falls back to fs when absent. */
    storage?: StorageAdapter;
}): Promise<AutoCaptureResult>;
