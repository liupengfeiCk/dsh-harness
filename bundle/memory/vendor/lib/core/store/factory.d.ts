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
import type { MemoryTdaiConfig } from "../../config.js";
import type { IMemoryStore, IEmbeddingService, StoreLogger } from "./types.js";
import type { BM25LocalEncoder } from "./bm25-local.js";
export type { IMemoryStore, IEmbeddingService, StoreLogger, BM25LocalEncoder };
export interface StoreBundle {
    store: IMemoryStore;
    embedding: IEmbeddingService;
    bm25Encoder?: BM25LocalEncoder;
    /** Snapshot of current store config for manifest writing. */
    storeSnapshot: import("../../utils/manifest.js").StoreConfigSnapshot;
}
/**
 * Create the storage backend, embedding service, and optional BM25 encoder
 * based on plugin configuration.
 *
 * @param config       Fully resolved plugin config.
 * @param options.dataDir    Plugin data directory.
 * @param options.logger     Logger instance.
 */
export declare function createStoreBundle(config: MemoryTdaiConfig, options: {
    dataDir: string;
    logger?: StoreLogger;
}): StoreBundle;
