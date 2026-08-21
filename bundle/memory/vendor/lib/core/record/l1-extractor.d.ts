/**
 * L1 Memory Extractor: extracts structured memories from L0 conversation messages
 * using a single LLM call with JSON-mode structured output.
 *
 * v3: Aligned with Kenty's prompt — scene segmentation + memory extraction in one call,
 * followed by batch conflict detection.
 *
 * Pipeline:
 * 1. Read recent messages from L0 (split into background + new)
 * 2. Call LLM to extract scene-segmented memories
 * 3. Batch conflict detection against existing records
 * 4. Write to L1 JSONL files
 */
import type { ConversationMessage } from "../conversation/l0-recorder.js";
import { type MemoryPromptMode } from "../prompts/l1-extraction.js";
import type { MemoryRecord } from "./l1-writer.js";
import type { IMemoryStore } from "../store/types.js";
import type { EmbeddingService } from "../store/embedding.js";
import type { LLMRunner, Logger } from "../types.js";
import { StorageAdapter } from "../storage/adapter.js";
import type { ResolvedMemoryPrompt } from "../memory-prompt/types.js";
export interface L1ExtractionResult {
    /** Whether extraction succeeded */
    success: boolean;
    /** Number of memories extracted */
    extractedCount: number;
    /** Number of memories actually stored (after dedup) */
    storedCount: number;
    /** The memory records that were stored */
    records: MemoryRecord[];
    /** Scene names detected during extraction */
    sceneNames: string[];
    /** Last scene name (for continuity in next extraction) */
    lastSceneName?: string;
}
/**
 * Run the full L1 extraction pipeline on conversation messages.
 *
 * @param messages - Filtered conversation messages (from L0 or directly from hook)
 * @param sessionKey - The session key
 * @param baseDir - Base data directory (~/.openclaw/memory-tdai/)
 * @param config - OpenClaw config (for LLM access)
 * @param options - Extraction options
 * @param logger - Optional logger
 */
export declare function extractL1Memories(params: {
    messages: ConversationMessage[];
    sessionKey: string;
    sessionId?: string;
    taskId?: string;
    teamId?: string;
    userId?: string;
    agentId?: string;
    baseDir: string;
    config: unknown;
    options?: {
        /** Max new messages to send in one extraction call */
        maxMessagesPerExtraction?: number;
        /** Max background messages for context */
        maxBackgroundMessages?: number;
        /** Enable conflict detection */
        enableDedup?: boolean;
        /** Max memories extracted per call */
        maxMemoriesPerSession?: number;
        /** LLM model override */
        model?: string;
        /** Previous scene name for continuity */
        previousSceneName?: string;
        /** Prompt family for L1 extraction (default: chat). */
        promptMode?: MemoryPromptMode;
        /** Resolved custom strategy. Undefined preserves the current system prompt exactly. */
        memoryPrompt?: ResolvedMemoryPrompt;
        /** Vector store for cosine similarity candidate recall */
        vectorStore?: IMemoryStore;
        /** Embedding service for computing query vectors */
        embeddingService?: EmbeddingService;
        /** Top-K candidates for conflict recall (default: 5) */
        conflictRecallTopK?: number;
        /** Override embedding timeout for capture-path calls (milliseconds) */
        embeddingTimeoutMs?: number;
        /**
         * Host-neutral LLM runner. When provided, used instead of creating
         * a CleanContextRunner (decouples from OpenClaw runtime).
         */
        llmRunner?: LLMRunner;
    };
    logger?: Logger;
    /** Plugin instance ID for metric reporting (optional — metrics skipped if absent) */
    instanceId?: string;
    /**
     * StorageAdapter for L1 JSONL writes.
     * - service mode: must be provided (CosStorageBackend) — JSONL is the source of
     *   truth for backup/recovery; without storage, writes silently fall back to local
     *   pod fs and are lost on pod restart (CR-2 root cause, fixed 2026-05-19).
     * - standalone mode: caller usually provides LocalStorageBackend; if absent,
     *   writeMemory falls back to fs at `{baseDir}/records/{date}.jsonl`.
     */
    storage?: StorageAdapter;
}): Promise<L1ExtractionResult>;
