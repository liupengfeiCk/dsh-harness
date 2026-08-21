/**
 * VectorStore: SQLite-based vector storage using sqlite-vec extension.
 *
 * Manages two layers of vector-indexed data in a single SQLite database:
 *
 * **L1 (structured memories):**
 * 1. `l1_records` — relational metadata table (content, type, priority, scene, timestamps)
 * 2. `l1_vec` — vec0 virtual table for cosine similarity search
 *
 * **L0 (raw conversations):**
 * 3. `l0_conversations` — relational metadata table (session_key, role, message text, timestamps)
 * 4. `l0_vec` — vec0 virtual table for cosine similarity search on individual messages
 *
 * Dependencies: Node.js built-in `node:sqlite` (Node 22+) + `sqlite-vec` (from root workspace).
 *
 * Design:
 * - All operations are synchronous (DatabaseSync API).
 * - Writes use manual BEGIN/COMMIT transactions for atomicity (metadata + vector).
 * - vec0 virtual table does NOT support ON CONFLICT, so upsert = delete + insert.
 * - Thread-safe via WAL mode.
 */
import type { DatabaseSync } from "node:sqlite";
import type { MemoryRecord } from "../record/l1-writer.js";
import type { EmbeddingProviderInfo } from "./embedding.js";
import type { IMemoryStore, StoreCapabilities, L0Record, L0QueryRow, L1RecordRow, L1QueryFilter, L0CountFilter, L0PaginatedFilter, L0PaginatedResult, L1CountFilter, L1PaginatedFilter, L1PaginatedResult, IsolationFilter, TeamEntity, UserEntity, AgentEntity, TaskEntity, KnowledgeEntity, KnowledgeType, KnowledgeListResult, BatchDeleteResult, MemoryContentClearFilter, MemoryContentClearResult, AuditEntry, AuditQueryFilter } from "./types.js";
import type { Logger } from "../types.js";
import type { MemoryPromptListFilter, MemoryPromptRecord, MemoryPromptSettingListFilter, MemoryPromptSettingLogFilter, MemoryPromptSettingLogRecord, MemoryPromptSettingRecord, MemoryPromptTargetType } from "../memory-prompt/types.js";
import { type MemoryGenerationLayer, type MemoryGenerationRefRecord } from "../memory-generation-log/types.js";
export type { L1RecordRow } from "./types.js";
export interface VectorSearchResult {
    record_id: string;
    content: string;
    type: string;
    priority: number;
    scene_name: string;
    /** Cosine similarity score (1.0 - cosine_distance) */
    score: number;
    timestamp_str: string;
    timestamp_start: string;
    timestamp_end: string;
    version: number;
    session_key: string;
    session_id: string;
    team_id: string;
    task_id: string;
    user_id: string;
    agent_id: string;
    /** Raw metadata JSON string (e.g., contains activity_start_time / activity_end_time for episodic) */
    metadata_json: string;
}
/** L0 single-message vector search result. */
export interface L0VectorSearchResult {
    record_id: string;
    session_key: string;
    session_id: string;
    team_id: string;
    task_id: string;
    user_id: string;
    agent_id: string;
    role: string;
    message_text: string;
    /** Cosine similarity score (1.0 - cosine_distance) */
    score: number;
    recorded_at: string;
    /** Original message timestamp (epoch ms) */
    timestamp: number;
}
export interface L0RecordRow {
    record_id: string;
    session_key: string;
    session_id: string;
    role: string;
    message_text: string;
    recorded_at: string;
    timestamp: number;
}
/** Result of VectorStore.init() — indicates whether a re-embed is needed. */
export interface VectorStoreInitResult {
    /**
     * `true` if the embedding provider/model/dimensions changed since
     * the vectors were last written.  Callers should re-embed all texts
     * (via `reindexAll()`) after receiving this flag.
     */
    needsReindex: boolean;
    /** Human-readable reason (for logging). */
    reason?: string;
}
interface JiebaInstance {
    cutForSearch(text: string, hmm: boolean): string[];
}
/**
 * Build an FTS5 MATCH query from raw text.
 *
 * When `@node-rs/jieba` is available, uses jieba's search-engine mode
 * (`cutForSearch`) for accurate Chinese word segmentation, producing
 * much better recall than the previous regex-only approach.
 *
 * Falls back to Unicode-regex splitting (`/[\p{L}\p{N}_]+/gu`) if
 * jieba is not installed.
 *
 * Tokens are OR-joined as quoted FTS5 phrase terms so that a document
 * matching *any* token is returned.  BM25 naturally ranks documents that
 * match more tokens higher, so precision is preserved while recall is
 * significantly improved — especially for longer queries and when running
 * in FTS-only fallback mode (no embedding available).
 *
 * Example (with jieba):
 *   "用户喜欢编程和TypeScript" → '"用户" OR "喜欢" OR "编程" OR "TypeScript"'
 * Example (fallback):
 *   "旅行计划 API" → '"旅行计划" OR "API"'
 */
export declare function buildFtsQuery(raw: string): string | null;
/**
 * Tokenize text for FTS5 indexing (write-side).
 *
 * Uses jieba `cutForSearch()` (search-engine mode) to segment Chinese text,
 * then joins tokens with spaces. The resulting string is stored in the FTS5
 * `content` column so that `unicode61` tokenizer can split it into meaningful
 * words — including both full words and their sub-words.
 *
 * Using `cutForSearch` (instead of `cut`) ensures that the index contains
 * the same sub-word tokens that `buildFtsQuery()` produces on the query side.
 * For example, "人工智能" is indexed as "人工 智能 人工智能", so queries for
 * either the full term or sub-words will match.
 *
 * Falls back to the original text if jieba is unavailable.
 *
 * Example (with jieba):
 *   "用户五月去日本旅行" → "用户 五月 去 日本 旅行"
 *   "人工智能的分支"     → "人工 智能 人工智能 的 分支"
 * Example (fallback):
 *   "用户五月去日本旅行" → "用户五月去日本旅行" (unchanged)
 */
export declare function tokenizeForFts(raw: string): string;
/**
 * Reset jieba state so next call to `buildFtsQuery` re-initialises.
 * Exported for testing only.
 * @internal
 */
export declare function _resetJiebaForTest(): void;
/**
 * Override jieba instance (or set to `null` to force fallback).
 * Exported for testing only.
 * @internal
 */
export declare function _setJiebaForTest(instance: JiebaInstance | null): void;
/**
 * Convert a BM25 rank (negative = more relevant) to a 0–1 score.
 * Mirrors the formula in openclaw core `hybrid.ts`.
 */
export declare function bm25RankToScore(rank: number): number;
/** FTS5 search result for L1 records. */
export interface FtsSearchResult {
    record_id: string;
    content: string;
    type: string;
    priority: number;
    scene_name: string;
    /** BM25-derived score (0–1, higher is better) */
    score: number;
    timestamp_str: string;
    timestamp_start: string;
    timestamp_end: string;
    version: number;
    session_key: string;
    session_id: string;
    team_id: string;
    task_id: string;
    user_id: string;
    agent_id: string;
    metadata_json: string;
}
/** FTS5 search result for L0 records. */
export interface L0FtsSearchResult {
    record_id: string;
    session_key: string;
    session_id: string;
    team_id: string;
    task_id: string;
    user_id: string;
    agent_id: string;
    role: string;
    message_text: string;
    /** BM25-derived score (0–1, higher is better) */
    score: number;
    recorded_at: string;
    timestamp: number;
}
export declare class VectorStore implements IMemoryStore {
    private db;
    private readonly dimensions;
    private readonly logger?;
    /** @see IMemoryStore.supportsDeferredEmbedding */
    readonly supportsDeferredEmbedding = true;
    /**
     * When `true`, the store is in a degraded state (e.g. sqlite-vec failed to
     * load, or init() encountered an unrecoverable error).  All public methods
     * become safe no-ops so the plugin never blocks the main OpenClaw flow.
     */
    private degraded;
    /** Tracks whether close() has been called to prevent double-close errors. */
    private closed;
    /**
     * `true` when vec0 virtual tables (l1_vec / l0_vec) have been created and
     * their prepared statements are ready.  When `dimensions === 0` (i.e.
     * provider="none"), vec0 tables are deferred and this stays `false`.
     */
    private vecTablesReady;
    private stmtUpsertMeta;
    private stmtDeleteVec?;
    private stmtInsertVec?;
    private stmtDeleteMeta;
    private stmtGetMeta;
    private stmtSearchVec?;
    private stmtQueryBySessionId;
    private stmtQueryBySessionIdSince;
    private stmtQueryBySessionKey;
    private stmtQueryBySessionKeySince;
    private stmtQueryAll;
    private stmtQueryAllSince;
    private stmtL0UpsertMeta;
    private stmtL0DeleteVec?;
    private stmtL0InsertVec?;
    private stmtL0DeleteMeta;
    private stmtL0GetMeta;
    private stmtL0SearchVec?;
    /** L0 query for L1 runner: all messages for a session key */
    private stmtL0QueryAll;
    /** L0 query for L1 runner: messages after a timestamp cursor */
    private stmtL0QueryAfter;
    /** L1 cursor-based pagination for migration (by PK) */
    private stmtL1QueryMigrationCursor;
    /** L0 cursor-based pagination for migration (by PK) */
    private stmtL0QueryMigrationCursor;
    private ftsAvailable;
    private stmtL1FtsInsert;
    private stmtL1FtsDelete;
    private stmtL1FtsSearch;
    private stmtL0FtsInsert;
    private stmtL0FtsDelete;
    private stmtL0FtsSearch;
    /**
     * Create a VectorStore instance.
     *
     * Note: After construction, you MUST call `init()` to load the sqlite-vec
     * extension and create the schema.
     */
    constructor(dbPath: string, dimensions: number, logger?: Logger);
    /**
     * Expose the underlying `DatabaseSync` handle for tightly-coupled co-tenants
     * that need to live in the SAME SQLite connection (skill_meta / skill_fts /
     * skill_vec live alongside l1_records — see SKILL_ENGINEERING_DESIGN §13.3).
     *
     * Intentional escape hatch: do NOT use this for unrelated stores. Sharing
     * the connection is what gives us one sqlite-vec load + one WAL session +
     * cross-table transactions; opening a second connection on `vectors.db`
     * would defeat all three.
     */
    getRawDb(): DatabaseSync;
    /** Embedding dimension this store was opened with (0 when provider="none"). */
    getEmbeddingDimensions(): number;
    /**
     * Whether the store is in degraded mode (e.g. sqlite-vec failed to load).
     * When degraded, all write/search operations become safe no-ops.
     */
    isDegraded(): boolean;
    /**
     * Load sqlite-vec extension and initialize database schema.
     * Must be called once after construction.
     *
     * @param providerInfo  Current embedding provider info. When provided,
     *   the store compares it against the persisted metadata. If the provider,
     *   model, or dimensions changed, the vector tables are dropped and
     *   re-created with the new dimensions, and `needsReindex: true` is returned
     *   so the caller can schedule a full re-embed.
     */
    init(providerInfo?: EmbeddingProviderInfo): VectorStoreInitResult;
    /**
     * Internal schema initialization — separated from init() so we can
     * catch errors at the top level and degrade gracefully.
     */
    private initSchema;
    private readEmbeddingMeta;
    private writeEmbeddingMeta;
    /** Allowed table names for row counting (whitelist to prevent SQL injection). */
    private static readonly COUNTABLE_TABLES;
    /**
     * Extra rows to retrieve from vec0 KNN search to compensate for legacy
     * zero-vector placeholders that may still linger from older data.
     */
    private static readonly ZERO_VEC_BUFFER;
    /** Default result limit for FTS5 keyword searches. */
    private static readonly FTS_DEFAULT_LIMIT;
    private tableRowCount;
    /**
     * Detect the embedding dimension of an existing vec0 table by inspecting
     * the DDL stored in sqlite_master.  Returns `null` if the table doesn't
     * exist or the dimension cannot be determined.
     *
     * The vec0 DDL looks like:
     *   CREATE VIRTUAL TABLE l1_vec USING vec0(... embedding float[768] ...)
     * We parse the number inside `float[N]`.
     */
    private getVecTableDimensions;
    /**
     * Drop both L1 and L0 vector virtual tables.
     * Metadata tables (l1_records, l0_conversations) are preserved — only
     * the vec0 tables need to be rebuilt with the new dimensions.
     */
    private dropVectorTables;
    /**
     * Write or update a memory record (metadata + vector).
     * Uses a manual transaction for atomicity.
     *
     * If `embedding` is `undefined` or a zero vector (all elements are 0), only
     * the metadata row is written — the vec0 table is left untouched.  This
     * allows callers without an EmbeddingService to still persist metadata + FTS
     * without constructing a throwaway zero-vector, and prevents placeholder
     * zero vectors (from embedding-service failures) from polluting KNN search
     * results with null / NaN distances.
     *
     * **Fault-tolerant**: catches all errors internally so that a vector store
     * failure never propagates to the caller / main OpenClaw flow.
     * Returns `true` on success, `false` on failure (logged as warning).
     */
    upsertL1(record: MemoryRecord, embedding: Float32Array | undefined): boolean;
    /**
     * Vector similarity search (cosine distance).
     * Returns top-k results sorted by similarity (highest first).
     *
     * **Fault-tolerant**: returns an empty array on any error (e.g. dimension
     * mismatch, corrupted DB) so callers can fall back to keyword search.
     */
    searchL1Vector(queryEmbedding: Float32Array, topK?: number, _queryText?: string, filter?: IsolationFilter): VectorSearchResult[];
    /**
     * Delete a single record (metadata + vector).
     *
     * **Fault-tolerant**: logs a warning on failure, never throws.
     */
    deleteL1(recordId: string, filter?: IsolationFilter): boolean;
    /**
     * Delete multiple records (metadata + vector).
     *
     * **Fault-tolerant**: logs a warning on failure, never throws.
     */
    deleteL1Batch(recordIds: string[], filter?: IsolationFilter): boolean;
    /**
     * Get the total number of L1 records in the store.
     *
     * **Fault-tolerant**: returns 0 on failure.
     * TTL cleanup by updated_time.
     *
     * Deletes expired rows from l1_records and matching vectors from l1_vec
     * in a single transaction to guarantee consistency.
     */
    deleteL1Expired(cutoffIso: string): number;
    /**
     * Get the total number of L1 records matching optional filters.
     */
    countL1(filter?: L1CountFilter): number;
    /**
     * Query L1 records with optional session and time filters.
     *
     * Uses the composite index `idx_l1_session_updated(session_id, updated_time)`
     * for efficient filtering. All timestamps are compared as UTC ISO 8601 strings.
     *
     * **Fault-tolerant**: returns an empty array on any error (degraded mode, DB issues).
     */
    queryL1Records(filter?: L1QueryFilter): L1RecordRow[];
    /**
     * Write or update an L0 single-message record (metadata + vector).
     * Uses a manual transaction for atomicity.
     *
     * If `embedding` is `undefined` or a zero vector (all elements are 0), only
     * the metadata row (`l0_conversations`) is written — the vec0 table
     * (`l0_vec`) is left untouched.  This allows callers without an
     * EmbeddingService to still persist metadata + FTS without constructing a
     * throwaway zero-vector, and prevents placeholder zero vectors (from
     * embedding-service failures) from polluting KNN search results.
     *
     * **Fault-tolerant**: catches all errors internally, never throws.
     * Returns `true` on success, `false` on failure (logged as warning).
     */
    upsertL0(record: L0Record, embedding: Float32Array | undefined): boolean;
    /**
     * Update ONLY the vector embedding for an existing L0 record.
     * The metadata row must already exist in l0_conversations (written by upsertL0).
     *
     * This is used by the background embedding task in auto-capture:
     *   1. upsertL0() writes metadata + FTS synchronously (no embedding)
     *   2. Background task calls embedBatch() then updateL0Embedding() for each record
     *
     * **Fault-tolerant**: catches all errors internally, never throws.
     * Returns `true` on success, `false` on failure.
     */
    updateL0Embedding(recordId: string, embedding: Float32Array): boolean;
    /**
     * Vector similarity search on L0 individual messages (cosine distance).
     * Returns top-k results sorted by similarity (highest first).
     *
     * **Fault-tolerant**: returns an empty array on any error.
     */
    searchL0Vector(queryEmbedding: Float32Array, topK?: number, _queryText?: string, filter?: IsolationFilter): L0VectorSearchResult[];
    /**
     * Delete a single L0 record (metadata + vector).
     *
     * **Fault-tolerant**: logs a warning on failure, never throws.
     */
    deleteL0(recordId: string, filter?: IsolationFilter): boolean;
    /**
     * TTL cleanup by recorded_at (ISO string) for L0 records.
     *
     * Deletes expired rows from l0_conversations and matching vectors from l0_vec
     * in a single transaction to guarantee consistency.
     */
    deleteL0Expired(cutoffIso: string): number;
    /**
     * Get the total number of L0 message records matching optional filters.
     *
     * **Fault-tolerant**: returns 0 on failure.
     */
    countL0(filter?: L0CountFilter): number;
    /**
     * Get all L1 record texts for re-embedding.
     * Returns record_id → content pairs.
     */
    getAllL1Texts(): Array<{
        record_id: string;
        content: string;
        updated_time: string;
    }>;
    /**
     * Get all L0 message texts for re-embedding.
     * Returns record_id → message_text/recorded_at tuples.
     */
    getAllL0Texts(): Array<{
        record_id: string;
        message_text: string;
        recorded_at: string;
    }>;
    /**
     * Re-embed all existing L1 and L0 texts with a new embedding function.
     *
     * This is called after `init()` returns `needsReindex: true` — the vector
     * tables have already been dropped and re-created with the correct dimensions.
     * This method reads every text from the metadata tables and writes fresh
     * embeddings into the new vector tables.
     *
     * @param embedFn  A function that converts text → Float32Array embedding.
     * @param onProgress  Optional callback for progress reporting.
     */
    reindexAll(embedFn: (text: string) => Promise<Float32Array>, onProgress?: (done: number, total: number, layer: "L1" | "L0") => void): Promise<{
        l1Count: number;
        l0Count: number;
    }>;
    /**
     * Query L0 messages for a given session key, optionally filtered by recorded_at cursor.
     * Returns up to `limit` rows with `recorded_at > afterRecordedAtMs`, ordered by
     * recorded_at ASC (chronological write order, **oldest-first**).
     *
     * Used by L1 runner to read L0 data from DB. The runner is responsible for
     * batching/slicing the returned rows (e.g. process N, defer the rest).
     */
    queryL0ForL1(sessionKey: string, afterRecordedAtMs?: number, limit?: number): L0QueryRow[];
    /**
     * Query L0 messages for a given session key, grouped by session_id.
     * Each group's messages are in chronological order (recorded_at ASC).
     * Groups are sorted by earliest message timestamp.
     *
     * Used by L1 runner to replace readConversationMessagesGroupedBySessionId().
     */
    queryL0GroupedBySessionId(sessionKey: string, afterRecordedAtMs?: number, limit?: number): Array<{
        sessionId: string;
        teamId?: string;
        taskId?: string;
        userId: string;
        agentId: string;
        messages: Array<{
            id: string;
            role: string;
            content: string;
            timestamp: number;
            recordedAtMs: number;
        }>;
    }>;
    /**
     * Read a page of L1 records using primary key cursor.
     * Returns rows with `record_id > afterId`, ordered by PK, limited to `pageSize`.
     * Pass `""` as `afterId` for the first page.
     */
    queryL1RecordsCursor(afterId: string, pageSize: number): L1RecordRow[];
    /**
     * Read a page of L0 records using primary key cursor.
     * Returns rows with `record_id > afterId`, ordered by PK, limited to `pageSize`.
     * Pass `""` as `afterId` for the first page.
     */
    queryL0RecordsCursor(afterId: string, pageSize: number): L0RecordRow[];
    /**
     * Whether FTS5 full-text search is available.
     * When `false`, callers should skip keyword-based recall entirely.
     */
    isFtsAvailable(): boolean;
    /**
     * L0 paginated query for v2 `/conversation/query`.
     * Uses SQL WHERE + LIMIT + OFFSET, no full-table scan.
     */
    queryL0Paginated(filter: L0PaginatedFilter): L0PaginatedResult;
    /**
     * L1 paginated query for v2 `/atomic/query`.
     * Uses SQL WHERE + LIMIT + OFFSET, no full-table scan.
     */
    queryL1Paginated(filter: L1PaginatedFilter): L1PaginatedResult;
    /**
     * Delete all L0 messages belonging to a session.
     * Returns the count of actually deleted rows.
     */
    deleteL0BySession(sessionId: string, filter?: IsolationFilter): number;
    /**
     * 清空某个 (team, agent) 下的全部 L0 + L1 内容（含向量 / FTS 附属行）。
     * 不动entity_* / meta_* 资产表 —— 资产 ID 与绑定关系完整保留。
     *
     * sqlite store 不落L2/L3 profile 行（profiles 表只存在于 TCVDB），
     * 所以 profilesDeleted 恒为 0，L2/L3 文件由调用方走 StorageAdapter 清理。
     */
    clearMemoryContent(filter: MemoryContentClearFilter): MemoryContentClearResult;
    private entityId;
    private jsonArray;
    private parseArray;
    private teamFromRow;
    private userFromRow;
    private agentFromRow;
    private taskFromRow;
    createTeam(input: Omit<TeamEntity, "created_at" | "updated_at" | "status" | "user_ids" | "agent_ids" | "task_ids"> & {
        team_id?: string;
        status?: TeamEntity["status"];
    }): TeamEntity;
    getTeam(teamId: string): TeamEntity | null;
    updateTeam(teamId: string, patch: Partial<Pick<TeamEntity, "name" | "description" | "owner_user_id" | "user_ids" | "agent_ids" | "status">>): TeamEntity | null;
    deleteTeams(teamIds: string[]): BatchDeleteResult;
    createUser(input: Pick<UserEntity, "name"> & Partial<Pick<UserEntity, "job_description" | "status">> & {
        user_id?: string;
    }): UserEntity;
    getUser(userId: string): UserEntity | null;
    updateUser(userId: string, patch: Partial<Pick<UserEntity, "name" | "job_description" | "status">>): UserEntity | null;
    deleteUsers(userIds: string[]): BatchDeleteResult;
    createAgent(input: Omit<AgentEntity, "created_at" | "updated_at" | "status" | "visibility" | "task_ids"> & {
        agent_id?: string;
        status?: AgentEntity["status"];
        visibility?: AgentEntity["visibility"];
    }): AgentEntity;
    getAgent(agentId: string): AgentEntity | null;
    updateAgent(agentId: string, patch: Partial<Pick<AgentEntity, "name" | "description" | "prompt" | "owner_user_id" | "visibility" | "status">>): AgentEntity | null;
    deleteAgents(agentIds: string[]): BatchDeleteResult;
    createTask(input: Omit<TaskEntity, "created_at" | "updated_at" | "source_type" | "agent_ids" | "user_ids"> & {
        task_id?: string;
        source_type?: TaskEntity["source_type"];
        agent_ids?: string[];
        user_ids?: string[];
    }): TaskEntity;
    getTask(taskId: string): TaskEntity | null;
    updateTask(taskId: string, patch: Partial<Pick<TaskEntity, "title" | "description" | "source_type" | "source_url" | "agent_ids" | "user_ids">>): TaskEntity | null;
    deleteTasks(taskIds: string[]): BatchDeleteResult;
    private knowledgeFromRow;
    createKnowledge(input: Omit<KnowledgeEntity, "created_at" | "updated_at">): KnowledgeEntity;
    getKnowledge(knowledgeId: string): KnowledgeEntity | null;
    updateKnowledge(knowledgeId: string, patch: Partial<Pick<KnowledgeEntity, "name" | "summary" | "service_url" | "repo_url" | "branch">>): KnowledgeEntity | null;
    deleteKnowledge(knowledgeIds: string[], teamId?: string): BatchDeleteResult;
    listKnowledge(input: {
        team_id: string;
        type?: KnowledgeType;
        knowledge_ids?: string[];
        limit?: number;
        offset?: number;
    }): KnowledgeListResult;
    /**
     * FTS5 keyword search on L1 records.
     * Returns top-`limit` results sorted by BM25 relevance (highest first).
     *
     * @param ftsQuery  A pre-built FTS5 MATCH expression (from `buildFtsQuery()`).
     * @param limit     Maximum number of results to return.
     *
     * **Fault-tolerant**: returns an empty array on any error.
     */
    searchL1Fts(ftsQuery: string, limit?: number, filter?: IsolationFilter): FtsSearchResult[];
    /**
     * FTS5 keyword search on L0 conversation messages.
     * Returns top-`limit` results sorted by BM25 relevance (highest first).
     *
     * @param ftsQuery  A pre-built FTS5 MATCH expression (from `buildFtsQuery()`).
     * @param limit     Maximum number of results to return.
     *
     * **Fault-tolerant**: returns an empty array on any error.
     */
    searchL0Fts(ftsQuery: string, limit?: number, filter?: IsolationFilter): L0FtsSearchResult[];
    /**
     * Detect old FTS5 v1 schema (no `content_original` column) and drop the
     * tables so they can be recreated with the v2 schema.
     *
     * FTS5 virtual tables do NOT support `ALTER TABLE ADD COLUMN`, so the only
     * migration path is DROP + recreate + repopulate.
     *
     * @returns `true` if migration was performed (= FTS index needs rebuilding).
     * @internal
     */
    private migrateFtsTablesIfNeeded;
    /**
     * Rebuild the FTS5 index from scratch by reading all records from the
     * metadata tables and re-inserting them with jieba-segmented text.
     *
     * Called automatically after:
     *  - Schema migration from v1 to v2
     *  - Fresh table creation when existing data exists
     *
     * Safe to call multiple times (idempotent — clears FTS tables first).
     */
    rebuildFtsIndex(): void;
    /** Query the store's search capabilities. */
    getCapabilities(): StoreCapabilities;
    appendAudit(entry: AuditEntry): void;
    queryAudit(filter: AuditQueryFilter): AuditEntry[];
    upsertMemoryGenerationRefs(records: MemoryGenerationRefRecord[]): void;
    getMemoryGenerationRef(layer: MemoryGenerationLayer, memoryId: string): MemoryGenerationRefRecord | null;
    countMemoryPrompts(): number;
    createMemoryPrompt(record: MemoryPromptRecord): MemoryPromptRecord;
    getMemoryPrompts(ids: string[]): MemoryPromptRecord[];
    listMemoryPrompts(filter: MemoryPromptListFilter): MemoryPromptRecord[];
    updateMemoryPrompt(id: string, patch: {
        name?: string;
        prompt?: string;
        updated_by?: string;
        updated_at_ms: number;
    }): MemoryPromptRecord | null;
    getMemoryPromptSettings(ids: string[]): MemoryPromptSettingRecord[];
    listMemoryPromptSettings(filter: MemoryPromptSettingListFilter): MemoryPromptSettingRecord[];
    upsertMemoryPromptSettings(records: MemoryPromptSettingRecord[], logs: MemoryPromptSettingLogRecord[]): void;
    clearMemoryPromptSettings(ids: string[], logs: MemoryPromptSettingLogRecord[]): void;
    private insertMemoryPromptSettingLogs;
    deleteMemoryPrompts(ids: string[], operatorId?: string): {
        deleted_prompt_ids: string[];
        cleared_settings: Record<MemoryPromptTargetType, number>;
    };
    queryMemoryPromptSettingLogs(filter: MemoryPromptSettingLogFilter): MemoryPromptSettingLogRecord[];
    /**
     * Close the database connection.
     * Should be called on shutdown. Idempotent — safe to call multiple times.
     */
    close(): void;
}
