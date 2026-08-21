/**
 * L1 Memory Conflict Detection (Batch Mode): decides how to handle multiple new
 * memories against existing records in a single LLM call.
 *
 * v4: Removed JSONL-based Jaccard fallback. Candidate recall now relies exclusively
 *     on vector search (primary) and FTS5 BM25 (degraded). If neither is available,
 *     conflict detection is skipped entirely — all memories go straight to store.
 *
 * Two-phase approach:
 * 1. Candidate search per new memory — vector recall or FTS5 keyword recall (fast, no LLM)
 * 2. Batch LLM judgment on all new memories + their candidate pools (single call)
 */
import type { MemoryPromptMode } from "../../config.js";
import type { ExtractedMemory, DedupDecision } from "./l1-writer.js";
import type { IMemoryStore, IsolationFilter } from "../store/types.js";
import type { EmbeddingService } from "../store/embedding.js";
import type { LLMRunner, Logger, TraceContext } from "../types.js";
/**
 * Batch conflict detection: compare all new memories against existing records
 * in a single LLM call.
 *
 * Candidate recall strategy (3-tier degradation):
 * 1. Vector recall (vectorStore + embeddingService) — cosine similarity (best)
 * 2. FTS5 keyword recall (vectorStore with FTS available) — BM25 ranking (degraded)
 * 3. Skip conflict detection entirely — all memories go straight to "store"
 *
 * The old JSONL-based Jaccard fallback has been removed. If neither vector search
 * nor FTS is available, we skip dedup rather than paying the O(N) full-file-scan cost.
 *
 * @param memories - Newly extracted memories (with record_id)
 * @param config - OpenClaw config (for LLM access)
 * @param logger - Optional logger
 * @param model - Optional model override
 * @param vectorStore - Optional vector store for cosine similarity search
 * @param embeddingService - Optional embedding service for computing query vectors
 * @param conflictRecallTopK - Top-K candidates to recall per new memory (default: 5)
 * @returns Array of dedup decisions, one per new memory
 */
export declare function batchDedup(params: {
    memories: Array<ExtractedMemory & {
        record_id: string;
    }>;
    config: unknown;
    logger?: Logger;
    model?: string;
    /** Prompt family for conflict detection (default: chat). */
    promptMode?: MemoryPromptMode;
    /** Vector store for cosine similarity candidate recall */
    vectorStore?: IMemoryStore;
    /** Embedding service for computing query vectors */
    embeddingService?: EmbeddingService;
    /** Top-K candidates per new memory (default: 5) */
    conflictRecallTopK?: number;
    /** Override embedding timeout for capture-path calls (milliseconds) */
    embeddingTimeoutMs?: number;
    /** Host-neutral LLM runner — when provided, used instead of CleanContextRunner. */
    llmRunner?: LLMRunner;
    /** Isolation filter applied to candidate recall so dedup never crosses tenants. */
    filter?: IsolationFilter;
    /** langfuse 上报身份四元组（team/user/agent/session），透传给 llmRunner。 */
    traceContext?: TraceContext;
}): Promise<DedupDecision[]>;
