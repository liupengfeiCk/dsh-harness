/**
 * Local BM25 Sparse Vector Encoder.
 *
 * Pure TypeScript replacement for the Python sidecar BM25 client.
 * Uses @tencentdb-agent-memory/tcvdb-text package for tokenization (jieba-wasm) and BM25 encoding.
 *
 * Two operations (same contract as the old BM25Client):
 * - `encodeTexts(texts)` — encode documents for upsert (TF-based)
 * - `encodeQueries(texts)` — encode queries for search (IDF-based)
 */
import type { SparseVector } from "@tencentdb-agent-memory/tcvdb-text";
import type { Logger } from "../types.js";
export type { SparseVector };
export interface BM25LocalConfig {
    /** Whether BM25 sparse encoding is enabled (default: true) */
    enabled: boolean;
    /** Language for BM25 pre-trained params: "zh" or "en" (default: "zh") */
    language?: "zh" | "en";
}
export declare class BM25LocalEncoder {
    private readonly encoder;
    private readonly logger?;
    constructor(language?: "zh" | "en", logger?: Logger);
    /**
     * Encode document texts for upsert (TF-based BM25 scoring).
     * Returns one SparseVector per input text.
     */
    encodeTexts(texts: string[]): SparseVector[];
    /**
     * Encode query texts for search (IDF-based BM25 scoring).
     * Returns one SparseVector per input text.
     */
    encodeQueries(texts: string[]): SparseVector[];
}
/**
 * Create a BM25LocalEncoder if BM25 is enabled in config.
 * Returns undefined if disabled — callers should check before using.
 */
export declare function createBM25Encoder(config: BM25LocalConfig, logger?: Logger): BM25LocalEncoder | undefined;
