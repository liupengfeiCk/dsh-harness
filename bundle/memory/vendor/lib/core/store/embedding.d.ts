/**
 * Embedding Service: converts text to vector embeddings.
 *
 * Supports two providers:
 * - "openai": OpenAI-compatible embedding APIs (OpenAI, Azure OpenAI, self-hosted)
 * - "local": node-llama-cpp with embeddinggemma-300m GGUF model (fully offline)
 *
 * When no remote embedding is configured, automatically falls back to local provider.
 *
 * Design:
 * - Single `embed()` for one text, `embedBatch()` for multiple.
 * - `getDimensions()` returns configured vector dimensions.
 * - Throws on failure; callers decide fallback strategy.
 */
import type { Logger } from "../types.js";
export interface OpenAIEmbeddingConfig {
    /** Provider identifier — any value other than "local" (e.g. "openai", "deepseek", "azure", "qclaw") */
    provider: string;
    /** API base URL (required — must be specified by user, e.g. "https://api.openai.com/v1") */
    baseUrl: string;
    /** API Key (required) */
    apiKey: string;
    /** Model name (required — must be specified by user) */
    model: string;
    /** Output dimensions (required — must match the chosen model) */
    dimensions: number;
    /**
     * Whether to include the `dimensions` field in the embeddings request body.
     * Defaults to `true` for backward compatibility with OpenAI's `text-embedding-3-*`
     * (Matryoshka representation). Some self-hosted / OSS models (e.g. BGE-M3) reject
     * unknown `dimensions` parameters with HTTP 400; set this to `false` for those.
     */
    sendDimensions?: boolean;
    /** Local proxy URL (only for provider="qclaw") — requests are forwarded through this proxy with Remote-URL header */
    proxyUrl?: string;
    /** Max input text length in characters before truncation (default: 5000). */
    maxInputChars?: number;
    /** Timeout per API call in milliseconds (default: 10000). */
    timeoutMs?: number;
}
export interface LocalEmbeddingConfig {
    provider: "local";
    /** Custom GGUF model path (default: embeddinggemma-300m from HuggingFace) */
    modelPath?: string;
    /** Model cache directory (default: node-llama-cpp default cache) */
    modelCacheDir?: string;
}
export type EmbeddingConfig = OpenAIEmbeddingConfig | LocalEmbeddingConfig;
/** Identifies the embedding provider + model for change detection. */
export interface EmbeddingProviderInfo {
    /** Provider identifier (e.g. "local", "openai", "deepseek") */
    provider: string;
    /** Model identifier (e.g. "embeddinggemma-300m", "text-embedding-3-large") */
    model: string;
}
export interface EmbeddingCallOptions {
    /** Override the default timeout for this call (milliseconds). */
    timeoutMs?: number;
}
export interface EmbeddingService {
    /** Get embedding for a single text */
    embed(text: string, options?: EmbeddingCallOptions): Promise<Float32Array>;
    /** Get embeddings for multiple texts (batched API call) */
    embedBatch(texts: string[], options?: EmbeddingCallOptions): Promise<Float32Array[]>;
    /** Return the configured vector dimensions */
    getDimensions(): number;
    /** Return provider + model identifiers for change detection */
    getProviderInfo(): EmbeddingProviderInfo;
    /**
     * Whether the service is ready to serve embed requests.
     * For remote providers (OpenAI), always true (stateless HTTP).
     * For local providers, true only after model download + load completes.
     */
    isReady(): boolean;
    /**
     * Start background warmup (model download + load).
     * For remote providers, this is a no-op.
     * For local providers, triggers async initialization without blocking.
     * Safe to call multiple times (idempotent).
     */
    startWarmup(): void;
    /** Optional: release resources (model memory, GPU, etc.) on shutdown */
    close?(): void | Promise<void>;
}
/**
 * Error thrown when embed() / embedBatch() is called before the local
 * embedding model has finished downloading and loading.
 * Callers should catch this and fall back to keyword-only mode.
 */
export declare class EmbeddingNotReadyError extends Error {
    constructor(message?: string);
}
/** Function that dynamically imports node-llama-cpp. Overridable for testing. */
export type ImportLlamaFn = () => Promise<{
    getLlama: (opts: {
        logLevel: number;
    }) => Promise<unknown>;
    resolveModelFile: (model: string, cacheDir?: string) => Promise<string>;
    LlamaLogLevel: {
        error: number;
    };
}>;
export declare class LocalEmbeddingService implements EmbeddingService {
    private readonly modelPath;
    private readonly modelCacheDir?;
    private readonly logger?;
    private readonly importLlama;
    private initState;
    private initPromise;
    private initError;
    private embeddingContext;
    constructor(config?: LocalEmbeddingConfig, logger?: Logger, importLlama?: ImportLlamaFn);
    getDimensions(): number;
    getProviderInfo(): EmbeddingProviderInfo;
    /**
     * Whether the local model is fully loaded and ready to serve requests.
     */
    isReady(): boolean;
    /**
     * Start background warmup: download model (if needed) and load into memory.
     * Does NOT block the caller — returns immediately.
     * Safe to call multiple times (idempotent); re-triggers on "failed" state.
     */
    startWarmup(): void;
    /**
     * Get embedding for a single text.
     * @throws {EmbeddingNotReadyError} if model is not yet ready.
     */
    embed(text: string, _options?: EmbeddingCallOptions): Promise<Float32Array>;
    /**
     * Get embeddings for multiple texts.
     * @throws {EmbeddingNotReadyError} if model is not yet ready.
     */
    embedBatch(texts: string[], _options?: EmbeddingCallOptions): Promise<Float32Array[]>;
    /**
     * Release the node-llama-cpp embedding context and model resources.
     * Safe to call multiple times (idempotent).
     */
    close(): void;
    /**
     * Assert the model is ready. Throws EmbeddingNotReadyError if not.
     */
    private assertReady;
    /**
     * Truncate input text to stay within the model's context window.
     * embeddinggemma-300m has a 256-token limit; we use a character-based
     * heuristic (LOCAL_MAX_INPUT_CHARS) as a safe proxy.
     */
    private truncateInput;
    /**
     * Internal: perform the actual model download + load.
     * Called by startWarmup(), runs in background.
     */
    private _doInitialize;
    /**
     * Wait for ongoing warmup to complete (used internally by tests).
     * Returns immediately if already ready or idle.
     */
    waitForReady(): Promise<void>;
}
export declare class OpenAIEmbeddingService implements EmbeddingService {
    private readonly baseUrl;
    private readonly apiKey;
    private readonly model;
    private readonly dims;
    private readonly sendDimensions;
    private readonly providerName;
    private readonly proxyUrl?;
    private readonly maxInputChars?;
    private readonly timeoutMs;
    private readonly logger?;
    constructor(config: OpenAIEmbeddingConfig, logger?: Logger);
    getDimensions(): number;
    getProviderInfo(): EmbeddingProviderInfo;
    /** Remote embedding is always ready (stateless HTTP). */
    isReady(): boolean;
    /** No-op for remote embedding (no local model to warm up). */
    startWarmup(): void;
    embed(text: string, options?: EmbeddingCallOptions): Promise<Float32Array>;
    embedBatch(texts: string[], options?: EmbeddingCallOptions): Promise<Float32Array[]>;
    /**
     * Truncate input text to stay within the configured maxInputChars limit.
     * Logs a warning when truncation occurs.
     */
    private truncateInput;
    private _callApi;
}
/**
 * Create an EmbeddingService from config.
 *
 * Strategy:
 * - If config has provider != "local" with valid apiKey, model, and dimensions → use remote OpenAI-compatible embedding
 * - If config has provider="local" → use node-llama-cpp local embedding
 * - If config is undefined or missing required fields → fall back to local embedding
 *
 * NOTE: For local providers, `startWarmup()` is NOT called here.
 * The caller is responsible for calling `startWarmup()` at the right time
 * (e.g. on first conversation) to avoid triggering model download during
 * short-lived CLI commands like `gateway stop` or `agents list`.
 */
export declare function createEmbeddingService(config: EmbeddingConfig | undefined, logger?: Logger): EmbeddingService;
/**
 * No-op embedding service for backends with built-in server-side embedding
 * (e.g., TCVDB with Collection-level embedding config).
 *
 * All embed() calls return an empty Float32Array because the server generates
 * vectors automatically from the text field during upsert/search.
 */
export declare class NoopEmbeddingService implements EmbeddingService {
    embed(_text: string): Promise<Float32Array>;
    embedBatch(texts: string[]): Promise<Float32Array[]>;
    getDimensions(): number;
    getProviderInfo(): EmbeddingProviderInfo;
    isReady(): boolean;
    startWarmup(): void;
}
