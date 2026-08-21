/**
 * L1 Memory Writer: writes extracted memories to JSONL files.
 *
 * File naming: records/YYYY-MM-DD.jsonl (daily shards, all sessions merged).
 * Each record includes sessionKey for traceability.
 *
 * Write strategy:
 * - JSONL is the append-only persistent store (source of truth for backup/recovery).
 * - VectorStore (SQLite) is the primary retrieval engine.
 * - On update/merge, old records are deleted from VectorStore in real-time;
 *   JSONL is append-only and cleaned up periodically by memory-cleaner.
 *
 * Supports store (append), update, merge, and skip operations.
 *
 * v3: Aligned with Kenty's prompt output format — 3 memory types (persona/episodic/instruction),
 * numeric priority, scene_name, source_message_ids, metadata, timestamps.
 */
import { type IMemoryStore } from "../store/types.js";
import type { EmbeddingService } from "../store/embedding.js";
import type { StorageAdapter } from "../storage/adapter.js";
import type { Logger } from "../types.js";
/** L1 memory types: chat-mode legacy types + code/work-mode team memory types. */
export type MemoryType = "persona" | "episodic" | "instruction" | "work_fact" | "work_task" | "work_method" | "work_artifact";
/** Metadata for episodic memories (activity time range) */
export interface EpisodicMetadata {
    activity_start_time?: string;
    activity_end_time?: string;
}
/**
 * A persisted memory record in L1 JSONL files.
 *
 * v3 changes from v2:
 * - `importance: "high"|"medium"|"low"` → `priority: number` (0-100, -1 for strict global instructions)
 * - Added `scene_name`, `source_message_ids`, `metadata`, `timestamps`
 * - Removed `keywords` (will be rebuilt from content for search)
 * - MemoryType reduced from 4 to 3 (removed "preference", folded into "persona")
 */
export interface MemoryRecord {
    /** Unique ID for dedup updates */
    id: string;
    /** Memory content */
    content: string;
    /** Memory type: persona / episodic / instruction */
    type: MemoryType;
    /** Priority score: 0-100 (higher = more important), -1 = strict global instruction */
    priority: number;
    /** Scene name this memory belongs to */
    scene_name: string;
    /** Source message IDs that contributed to this memory */
    source_message_ids: string[];
    /** Type-specific metadata (e.g., activity_start_time for episodic) */
    metadata: EpisodicMetadata | Record<string, never>;
    /** Timestamp trail: all timestamps related to this memory (for merge history tracking) */
    timestamps: string[];
    /** Creation timestamp (ISO) */
    createdAt: string;
    /** Last update timestamp (ISO) */
    updatedAt: string;
    /** Monotonic version. New memories start at 1; update/merge increments by 1. */
    version?: number;
    /** Source session key (conversation channel identifier) */
    sessionKey: string;
    /** Source session ID (single conversation instance identifier) */
    sessionId: string;
    /** Optional task dimension for L0/L1 filtering. */
    taskId?: string;
    /**
     * Three-dim tenancy isolation (new in this branch).
     *
     * `userId` / `agentId` are mandatory for new writes once gateway-level
     * isolation enforcement is on, but kept optional on the type to avoid
     * breaking pre-isolation call sites and tests during rollout. The SQLite
     * upsert defaults them to '' if missing; the migration script backfills
     * existing rows with `__legacy__`.
     *
     * See `docs/l0l3-tenant-isolation-design.md`.
     */
    teamId?: string;
    userId?: string;
    agentId?: string;
}
/**
 * A memory as extracted by LLM (before dedup / persistence).
 * Matches the output format of Kenty's extraction prompt.
 */
export interface ExtractedMemory {
    content: string;
    type: MemoryType;
    priority: number;
    source_message_ids: string[];
    metadata: EpisodicMetadata | Record<string, never>;
    /** Scene name this memory was extracted in */
    scene_name: string;
}
export type DedupAction = "store" | "update" | "merge" | "skip";
/**
 * v3 batch dedup decision — one per new memory, aligned with Kenty's conflict detection prompt.
 *
 * Key changes:
 * - `targetId` → `target_ids` (array, supports multi-target merge/update)
 * - Added `merged_type`, `merged_priority`, `merged_timestamps` for cross-type merge
 */
export interface DedupDecision {
    /** Which new memory this decision is about */
    record_id: string;
    action: DedupAction;
    /** IDs of existing records to replace/remove (for update/merge) */
    target_ids: string[];
    /** Merged/updated content text (for update/merge) */
    merged_content?: string;
    /** Best type after merge (for update/merge, may differ from original) */
    merged_type?: MemoryType;
    /** Priority after merge (for update/merge) */
    merged_priority?: number;
    /** Union of all related timestamps (for update/merge) */
    merged_timestamps?: string[];
}
/**
 * Generate a unique memory ID.
 */
export declare function generateMemoryId(): string;
/**
 * Write a memory record according to the dedup decision.
 *
 * - store: append new record
 * - update: remove target records + append updated record
 * - merge: remove target records + append merged record
 * - skip: do nothing
 *
 * v3: supports multi-target removal for update/merge.
 * v3.1: optional VectorStore + EmbeddingService for dual-write (JSONL + vector).
 */
export declare function writeMemory(params: {
    memory: ExtractedMemory;
    decision: DedupDecision;
    baseDir: string;
    sessionKey: string;
    sessionId?: string;
    taskId?: string;
    /** Tenancy isolation propagated into MemoryRecord and downstream store. */
    teamId?: string;
    userId?: string;
    agentId?: string;
    logger?: Logger;
    /** Optional vector store for dual-write (JSONL + vector DB) */
    vectorStore?: IMemoryStore;
    /** Optional embedding service (required when vectorStore is provided) */
    embeddingService?: EmbeddingService;
    /** StorageAdapter for file operations (COS/local). Falls back to fs when absent. */
    storage?: StorageAdapter;
}): Promise<MemoryRecord | null>;
