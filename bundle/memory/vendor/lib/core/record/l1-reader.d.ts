/**
 * L1 Memory Reader: reads persisted L1 memory records.
 *
 * Provides two data paths:
 *
 * 1. **SQLite** (preferred): `queryMemoryRecords()` — uses VectorStore's `queryL1Records()`
 *    with composite indexes on (session_key, updated_time) and (session_id, updated_time)
 *    for efficient session-scoped and time-range queries.
 *
 * 2. **JSONL** (fallback): `readMemoryRecords()` / `readAllMemoryRecords()` — reads from
 *    `records/YYYY-MM-DD.jsonl` files. Used when VectorStore is unavailable or degraded.
 */
import type { MemoryRecord } from "./l1-writer.js";
import type { IMemoryStore, L1QueryFilter } from "../store/types.js";
import type { StorageAdapter } from "../storage/adapter.js";
export type { MemoryRecord, MemoryType, EpisodicMetadata } from "./l1-writer.js";
export type { L1QueryFilter } from "../store/types.js";
import type { Logger } from "../types.js";
/**
 * Query L1 memory records from SQLite via VectorStore.
 *
 * This is the **preferred** read path — it uses the composite index
 * `idx_l1_session_updated(session_id, updated_time)` for efficient
 * session-scoped and time-range queries.
 *
 * All timestamps are UTC ISO 8601 (as stored by l1-writer's dual-write).
 *
 * Falls back to empty array if VectorStore is null or degraded.
 */
export declare function queryMemoryRecords(vectorStore: IMemoryStore | null | undefined, filter?: L1QueryFilter, logger?: Logger): Promise<MemoryRecord[]>;
/**
 * Read all memory records for a session from JSONL files.
 *
 * Current naming mode:
 * - Daily merged file: records/YYYY-MM-DD.jsonl (all sessions in one file)
 */
export declare function readMemoryRecords(sessionKey: string, baseDir: string, logger?: Logger, storage?: StorageAdapter): Promise<MemoryRecord[]>;
/**
 * Read ALL memory records across all session JSONL files.
 */
export declare function readAllMemoryRecords(baseDir: string, logger?: Logger, storage?: StorageAdapter): Promise<MemoryRecord[]>;
