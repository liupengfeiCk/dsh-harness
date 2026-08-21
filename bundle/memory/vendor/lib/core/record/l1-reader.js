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
import { StoragePaths } from "../storage/types.js";
const TAG = "[memory-tdai] [l1-reader]";
// ============================
// SQLite-based queries (preferred)
// ============================
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
export async function queryMemoryRecords(vectorStore, filter, logger) {
    if (!vectorStore) {
        logger?.warn(`${TAG} queryMemoryRecords: no VectorStore available, returning empty`);
        return [];
    }
    const rows = await vectorStore.queryL1Records(filter);
    return rows.map(rowToMemoryRecord);
}
/**
 * Convert a raw SQLite L1RecordRow to a MemoryRecord (same shape as JSONL records).
 */
function rowToMemoryRecord(row) {
    let metadata = {};
    try {
        metadata = JSON.parse(row.metadata_json);
    }
    catch {
        // malformed JSON — use empty object
    }
    // Reconstruct timestamps array from timestamp_start / timestamp_end
    const timestamps = [];
    if (row.timestamp_str)
        timestamps.push(row.timestamp_str);
    if (row.timestamp_start && row.timestamp_start !== row.timestamp_str)
        timestamps.push(row.timestamp_start);
    if (row.timestamp_end && row.timestamp_end !== row.timestamp_str && row.timestamp_end !== row.timestamp_start) {
        timestamps.push(row.timestamp_end);
    }
    return {
        id: row.record_id,
        content: row.content,
        type: row.type,
        priority: row.priority,
        scene_name: row.scene_name,
        source_message_ids: [], // not stored in SQLite (vector search doesn't need them)
        metadata,
        timestamps,
        createdAt: row.created_time,
        updatedAt: row.updated_time,
        version: row.version ?? 0,
        sessionKey: row.session_key,
        sessionId: row.session_id,
        taskId: row.task_id,
        teamId: row.team_id,
        userId: row.user_id,
        agentId: row.agent_id,
    };
}
// ============================
// JSONL-based reads (fallback)
// ============================
/**
 * Read all memory records for a session from JSONL files.
 *
 * Current naming mode:
 * - Daily merged file: records/YYYY-MM-DD.jsonl (all sessions in one file)
 */
export async function readMemoryRecords(sessionKey, baseDir, logger, storage) {
    const dateFilePattern = /^\d{4}-\d{2}-\d{2}\.jsonl$/;
    let entries;
    try {
        if (storage) {
            entries = await storage.readdirNames(StoragePaths.recordsDir, ".jsonl");
        }
        else {
            const fs = await import("node:fs/promises");
            const path = await import("node:path");
            const recordsDir = path.default.join(baseDir, "records");
            const dirEntries = await fs.default.readdir(recordsDir, { withFileTypes: true });
            entries = dirEntries
                .filter((entry) => entry.isFile() && dateFilePattern.test(entry.name))
                .map((entry) => entry.name);
        }
    }
    catch {
        // Directory doesn't exist yet
        return [];
    }
    const targetFiles = entries
        .filter((name) => dateFilePattern.test(name))
        .sort();
    if (targetFiles.length === 0) {
        return [];
    }
    const records = [];
    for (const fileName of targetFiles) {
        let raw;
        try {
            if (storage) {
                raw = await storage.readFile(`${StoragePaths.recordsDir}${fileName}`);
            }
            else {
                const fs = await import("node:fs/promises");
                const path = await import("node:path");
                raw = await fs.default.readFile(path.default.join(baseDir, "records", fileName), "utf-8");
            }
        }
        catch {
            logger?.warn?.(`${TAG} Failed to read L1 file: ${fileName}`);
            continue;
        }
        if (!raw)
            continue;
        const lines = raw.split("\n").filter((line) => line.trim());
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            try {
                const parsed = JSON.parse(line);
                if (parsed.sessionKey !== sessionKey) {
                    continue;
                }
                records.push(parsed);
            }
            catch {
                logger?.warn?.(`${TAG} Skipping malformed JSONL line in ${fileName}:${i + 1}`);
            }
        }
    }
    records.sort((a, b) => {
        const ta = a.updatedAt || a.createdAt || "";
        const tb = b.updatedAt || b.createdAt || "";
        return ta.localeCompare(tb);
    });
    return records;
}
/**
 * Read ALL memory records across all session JSONL files.
 */
export async function readAllMemoryRecords(baseDir, logger, storage) {
    try {
        let files;
        if (storage) {
            files = await storage.readdirNames(StoragePaths.recordsDir, ".jsonl");
        }
        else {
            const fs = await import("node:fs/promises");
            const path = await import("node:path");
            const recordsDir = path.default.join(baseDir, "records");
            files = (await fs.default.readdir(recordsDir)).filter((f) => f.endsWith(".jsonl"));
        }
        const allRecords = [];
        for (const file of files) {
            try {
                let raw;
                if (storage) {
                    raw = await storage.readFile(`${StoragePaths.recordsDir}${file}`);
                }
                else {
                    const fs = await import("node:fs/promises");
                    const path = await import("node:path");
                    raw = await fs.default.readFile(path.default.join(baseDir, "records", file), "utf-8");
                }
                if (!raw)
                    continue;
                const lines = raw.split("\n").filter((line) => line.trim());
                for (const line of lines) {
                    try {
                        allRecords.push(JSON.parse(line));
                    }
                    catch {
                        logger?.warn?.(`${TAG} Skipping malformed JSONL line in ${file}`);
                    }
                }
            }
            catch {
                logger?.warn?.(`${TAG} Failed to read ${file}`);
            }
        }
        allRecords.sort((a, b) => {
            const ta = a.updatedAt || a.createdAt || "";
            const tb = b.updatedAt || b.createdAt || "";
            return ta.localeCompare(tb);
        });
        return allRecords;
    }
    catch {
        // records/ directory doesn't exist yet
        return [];
    }
}
// ============================
// Helpers
// ============================
function sanitizeFilename(name) {
    return name.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_");
}
