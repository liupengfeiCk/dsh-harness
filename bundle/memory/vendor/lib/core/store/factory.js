/**
 * Store Factory — creates the appropriate storage backend and embedding service
 * based on plugin configuration.
 *
 * Supports:
 * - "sqlite" (default): local SQLite + sqlite-vec + FTS5
 * - "tcvdb": Tencent Cloud VectorDB (server-side embedding + hybridSearch)
 *
 * Both backends ship with core — TCVDB is a vendor-provided store that has
 * always been part of the open-source surface of this plugin (matches the
 * historical behavior prior to the open-source repackaging).
 */
import path from "node:path";
import { VectorStore } from "./sqlite.js";
import { createEmbeddingService } from "./embedding.js";
import { createBM25Encoder } from "./bm25-local.js";
const TAG = "[memory-tdai][factory]";
/**
 * Create the storage backend, embedding service, and optional BM25 encoder
 * based on plugin configuration.
 *
 * @param config       Fully resolved plugin config.
 * @param options.dataDir    Plugin data directory.
 * @param options.logger     Logger instance.
 */
export function createStoreBundle(config, options) {
    const { logger } = options;
    // ── BM25 local encoder ──
    const bm25Encoder = createBM25Encoder(config.bm25, logger);
    switch (config.storeBackend) {
        // NOTE: 原 TCVDB 云端向量库后端已随云基础设施裁切移除（设计文档 §8.3
        // 多后端存储抽象仅保留 SQLite + 本地文件）。此处统一回落到 sqlite。
        case "tcvdb":
        case "sqlite":
        default: {
            // ── Embedding service (only when enabled) ──
            let embeddingService;
            if (config.embedding.enabled && config.embedding.provider !== "local" && config.embedding.apiKey) {
                embeddingService = createEmbeddingService({
                    provider: config.embedding.provider,
                    baseUrl: config.embedding.baseUrl,
                    apiKey: config.embedding.apiKey,
                    model: config.embedding.model,
                    dimensions: config.embedding.dimensions,
                    sendDimensions: config.embedding.sendDimensions,
                    maxInputChars: config.embedding.maxInputChars,
                }, logger);
            }
            // dimensions from config (0 when provider="none" → vec0 deferred)
            const dims = config.embedding.dimensions;
            const dbPath = path.join(options.dataDir, "vectors.db");
            const store = new VectorStore(dbPath, dims, logger);
            logger?.debug?.(`${TAG} Store created: backend=sqlite, dbPath=${dbPath}, dimensions=${dims}, ` +
                `embedding=${embeddingService ? "enabled" : "disabled"}, ` +
                `bm25=${bm25Encoder ? "enabled" : "disabled"}`);
            return {
                store,
                embedding: embeddingService,
                bm25Encoder,
                storeSnapshot: {
                    type: "sqlite",
                    sqlitePath: path.relative(options.dataDir, dbPath),
                },
            };
        }
    }
}
