/**
 * auto-recall hook (v3): injects relevant memories + persona into agent context
 * before the agent starts processing.
 *
 * - Searches L1 memories using configurable strategy (keyword / embedding / hybrid)
 *   - keyword: FTS5 BM25 (requires FTS5; returns empty if unavailable)
 *   - embedding: VectorStore cosine similarity
 *   - hybrid: keyword + embedding merged with RRF
 * - L3 persona injection
 * - L2 scene navigation (full injection, LLM decides relevance)
 */
import type { MemoryTdaiConfig } from "../../config.js";
import { type RecallError } from "./recall-errors.js";
import type { IMemoryStore } from "../store/types.js";
import type { EmbeddingService } from "../store/embedding.js";
import { type StorageAdapter } from "../storage/adapter.js";
import { type ProfileIsolation } from "../profile/profile-sync.js";
import type { Logger } from "../types.js";
/** A single recalled L1 memory with its search score and type. */
export interface RecalledMemory {
    content: string;
    score: number;
    type: string;
}
export interface RecallResult {
    /** L1 relevant memories — prepended to user prompt text (dynamic, per-turn) */
    prependContext?: string;
    /** Stable recall context appended to system prompt (persona, scene nav, tools guide — cacheable) */
    appendSystemContext?: string;
    /** L1 memories that were recalled (with scores), for metric reporting */
    recalledL1Memories?: RecalledMemory[];
    /** L3 Persona raw content loaded during recall (null if none) */
    recalledL3Persona?: string | null;
    /** Effective search strategy used */
    recallStrategy?: string;
    /**
     * When recall fails, this is populated with a RecallError; success path leaves it undefined.
     * Callers (gateway handlers) should check `result.error` and surface it in the response envelope.
     * The other fields are still populated with safe defaults (empty strings / arrays) so that
     * downstream code that ignores `error` does not NPE.
     */
    error?: RecallError;
    /**
     * Partial success indicator: true when some recall steps succeeded but others failed
     * (e.g. L1 search OK but persona read failed). When true, `error` reflects the failed step.
     */
    partial?: boolean;
}
export declare function performAutoRecall(params: {
    userText: string;
    actorId: string;
    sessionKey: string;
    cfg: MemoryTdaiConfig;
    pluginDataDir: string;
    logger?: Logger;
    vectorStore?: IMemoryStore;
    embeddingService?: EmbeddingService;
    /** StorageAdapter for file operations (COS/local). Falls back to fs when absent. */
    storage?: StorageAdapter;
    /** L2/L3 profile scope. Defaults to the standalone default team and agent. */
    profileIsolation?: ProfileIsolation;
}): Promise<RecallResult | undefined>;
