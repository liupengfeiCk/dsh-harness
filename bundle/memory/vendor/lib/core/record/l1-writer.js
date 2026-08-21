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
import crypto from "node:crypto";
import { DEFAULT_ISOLATION_ID } from "../store/types.js";
import { StoragePaths } from "../storage/types.js";
const TAG = "[memory-tdai][l1-writer]";
// ============================
// Core functions
// ============================
/**
 * Generate a unique memory ID.
 */
export function generateMemoryId() {
    return `m_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
}
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
export async function writeMemory(params) {
    const { memory, decision, baseDir, sessionKey, sessionId, taskId, teamId, userId, agentId, logger, vectorStore, embeddingService, storage } = params;
    if (decision.action === "skip") {
        logger?.debug?.(`${TAG} Skipping memory: ${memory.content.slice(0, 50)}...`);
        return null;
    }
    const now = new Date().toISOString();
    let nextVersion = 0;
    if ((decision.action === "update" || decision.action === "merge") && decision.target_ids.length > 0 && vectorStore) {
        try {
            const existing = await vectorStore.queryL1Records({ recordIds: decision.target_ids });
            const maxVersion = existing.reduce((max, row) => Math.max(max, row.version ?? 0), 0);
            nextVersion = maxVersion + 1;
        }
        catch (err) {
            logger?.warn?.(`${TAG} Failed to read existing memory version, defaulting to v0: ${err instanceof Error ? err.message : String(err)}`);
        }
    }
    // Determine final content, type, priority based on action
    let finalContent;
    let finalType;
    let finalPriority;
    let finalTimestamps;
    if (decision.action === "merge" || decision.action === "update") {
        finalContent = decision.merged_content ?? memory.content;
        finalType = decision.merged_type ?? memory.type;
        finalPriority = decision.merged_priority ?? memory.priority;
        finalTimestamps = decision.merged_timestamps ?? [now];
    }
    else {
        // store
        finalContent = memory.content;
        finalType = memory.type;
        finalPriority = memory.priority;
        finalTimestamps = [now];
    }
    const record = {
        id: decision.record_id || generateMemoryId(),
        content: finalContent,
        type: finalType,
        priority: finalPriority,
        scene_name: memory.scene_name,
        source_message_ids: memory.source_message_ids,
        metadata: memory.metadata,
        timestamps: finalTimestamps,
        createdAt: now,
        updatedAt: now,
        version: nextVersion,
        sessionKey,
        sessionId: sessionId || DEFAULT_ISOLATION_ID,
        taskId,
        teamId,
        // Tenancy isolation — propagated end-to-end so SQLite / TCVDB upsert
        // can persist the row's owner. Empty strings preserve pre-isolation
        // behaviour for callers that haven't been updated yet.
        userId: userId || DEFAULT_ISOLATION_ID,
        agentId: agentId || DEFAULT_ISOLATION_ID,
    };
    const shardDate = formatLocalDate(new Date());
    const recordKey = StoragePaths.record(shardDate);
    // Helper: append a JSONL line
    // - standalone (no storage): write to local fs
    // - service (storage provided): write via StorageAdapter, no fs fallback
    //
    // Guard log (CR-2 fix, 2026-05-19): if storage is absent, emit a warn so any
    // missed wiring (e.g. caller forgot to pass storage in service mode) is
    // immediately visible instead of silently writing to ephemeral pod fs.
    // In standalone mode this warn is benign — the gateway auto-wires a
    // LocalStorageBackend at startup (server.ts:199-203), so storage should
    // normally be defined. Seeing this warn = caller forgot to pass it.
    const appendRecord = async (line) => {
        if (storage) {
            await storage.appendFile(recordKey, line);
        }
        else {
            logger?.warn?.(`${TAG} [CR-2 guard] writeMemory called without storage adapter; ` +
                `falling back to local fs at ${baseDir}/records/${shardDate}.jsonl. ` +
                `In service mode this means JSONL is written to ephemeral pod fs and ` +
                `will be lost on restart. Caller must pass 'storage' to writeMemory.`);
            const fs = await import("node:fs/promises");
            const path = await import("node:path");
            const recordsDir = path.default.join(baseDir, "records");
            await fs.default.mkdir(recordsDir, { recursive: true });
            await fs.default.appendFile(path.default.join(recordsDir, `${shardDate}.jsonl`), line, "utf-8");
        }
    };
    if ((decision.action === "update" || decision.action === "merge") && decision.target_ids.length > 0) {
        // Remove target records from VectorStore (real-time deletion for retrieval accuracy).
        // JSONL is append-only — old records remain in files and are cleaned up periodically
        // by memory-cleaner (which reconciles against VectorStore as source of truth).
        if (vectorStore) {
            try {
                const deleteFilter = teamId || userId || agentId || sessionId
                    ? { teamId, userId, agentId, sessionId: sessionId || undefined, sessionKey }
                    : undefined;
                if (deleteFilter) {
                    await vectorStore.deleteL1Batch(decision.target_ids, deleteFilter);
                }
                else {
                    await vectorStore.deleteL1Batch(decision.target_ids);
                }
                logger?.debug?.(`${TAG} VectorStore: deleted ${decision.target_ids.length} target record(s) for ${decision.action}`);
            }
            catch (err) {
                logger?.warn?.(`${TAG} VectorStore delete failed for ${decision.action}: ${err instanceof Error ? err.message : String(err)}`);
            }
        }
        try {
            await appendRecord(JSON.stringify(record) + "\n");
        }
        catch (err) {
            logger?.warn?.(`${TAG} JSONL append failed (non-fatal, VDB write continues): ${err instanceof Error ? err.message : String(err)}`);
        }
        logger?.debug?.(`${TAG} ${decision.action} memory: removed [${decision.target_ids.join(",")}] from VectorStore → ${record.id}: ${finalContent.slice(0, 80)}...`);
    }
    else {
        // store: append a new line
        try {
            await appendRecord(JSON.stringify(record) + "\n");
        }
        catch (err) {
            logger?.warn?.(`${TAG} JSONL append failed (non-fatal, VDB write continues): ${err instanceof Error ? err.message : String(err)}`);
        }
        logger?.debug?.(`${TAG} Stored memory ${record.id}: ${finalContent.slice(0, 80)}...`);
    }
    // === Vector Store dual-write ===
    if (vectorStore) {
        try {
            logger?.debug?.(`${TAG} [vec-dual-write] START id=${record.id}, contentLen=${record.content.length}, ` +
                `content="${record.content.slice(0, 80)}..."`);
            let embedding;
            if (embeddingService) {
                try {
                    embedding = await embeddingService.embed(record.content);
                    logger?.debug?.(`${TAG} [vec-dual-write] Embedding OK: dims=${embedding.length}, ` +
                        `norm=${Math.sqrt(Array.from(embedding).reduce((s, v) => s + v * v, 0)).toFixed(4)}`);
                }
                catch (embedErr) {
                    // Embedding failed — pass undefined to upsert() which writes
                    // metadata + FTS only, skipping the vec0 table.
                    logger?.warn(`${TAG} [vec-dual-write] Embedding FAILED for id=${record.id}, ` +
                        `will write metadata only: ${embedErr instanceof Error ? embedErr.message : String(embedErr)}`);
                }
            }
            const upsertOk = await vectorStore.upsertL1(record, embedding);
            logger?.debug?.(`${TAG} [vec-dual-write] upsert result=${upsertOk} id=${record.id}`);
        }
        catch (err) {
            // Vector write failure should NOT block the main JSONL write
            logger?.warn?.(`${TAG} [vec-dual-write] FAILED (JSONL already written) id=${record.id}: ${err instanceof Error ? err.message : String(err)}`);
        }
    }
    else {
        logger?.debug?.(`${TAG} [vec-dual-write] SKIPPED id=${record.id}: vectorStore=${!!vectorStore}`);
    }
    return record;
}
// ============================
// Helpers
// ============================
function formatLocalDate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
}
