/**
 * Plugin configuration types and parser (v3).
 *
 * Config is organized into flat functional groups:
 *   capture, extraction, persona, pipeline, recall, embedding
 *
 * Minimal config (zero config): {} — all fields have sensible defaults.
 */
/** Prompt family for L1-L3 memory pipeline. */
export type MemoryPromptMode = "chat" | "code";
/** Capture settings — controls L0 conversation recording. */
export interface CaptureConfig {
    /** Enable auto-capture (default: true) */
    enabled: boolean;
    /** Glob patterns to exclude agents (e.g. "bench-judge-*"); matched agents are fully ignored */
    excludeAgents: string[];
    /**
     * L0/L1 local file retention days used as TTL switch.
     * 0 means cleanup disabled.(default: 0)
     */
    l0l1RetentionDays: number;
    /**
     * Allow dangerous low retention (1 or 2 days).
     * Default false: when disabled, non-zero retention must be >= 3.
     */
    allowAggressiveCleanup: boolean;
}
/** Extraction settings (L1) — controls memory extraction from conversations. */
export interface ExtractionConfig {
    /** Enable background extraction (default: true) */
    enabled: boolean;
    /** Enable L1 smart dedup (default: true) */
    enableDedup: boolean;
    /** Max memories per session (default: 20) */
    maxMemoriesPerSession: number;
    /** LLM model for extraction, format: "provider/model" (falls back to OpenClaw default model when omitted) */
    model?: string;
    /** Prompt family for L1 extraction (default: chat). */
    promptMode: MemoryPromptMode;
}
/** Persona (L2/L3) settings — controls scene extraction (L2) and user profile generation (L3). */
export interface PersonaConfig {
    /** Trigger persona generation every N new memories (default: 50) */
    triggerEveryN: number;
    /** Max scene blocks (default: 20) */
    maxScenes: number;
    /** Persona backup count (default: 3) */
    backupCount: number;
    /** Scene blocks backup count (default: 10) */
    sceneBackupCount: number;
    /** LLM model for persona generation, format: "provider/model" (falls back to OpenClaw default model when omitted) */
    model?: string;
    /** Prompt family for L2/L3 prompts (default: chat; code prompts will be wired as they are added). */
    promptMode: MemoryPromptMode;
}
/** Pipeline trigger settings (L1→L2→L3 scheduling). */
export interface PipelineTriggerConfig {
    /** Trigger L1 after every N conversation rounds (default: 5) */
    everyNConversations: number;
    /** Enable warm-up: start threshold at 1, double after each L1 (1→2→4→...→everyN) (default: true) */
    enableWarmup: boolean;
    /** L1 idle timeout: trigger L1 after this many seconds of inactivity (default: 30) */
    l1IdleTimeoutSeconds: number;
    /** L2 delay after L1: wait this many seconds after L1 completes before triggering L2 (default: 90) */
    l2DelayAfterL1Seconds: number;
    /** L2 min interval: minimum seconds between L2 runs per session (default: 900 = 15 min) */
    l2MinIntervalSeconds: number;
    /** L2 max interval: even without new conversations, trigger L2 at most this often per session (default: 3600 = 60 min) */
    l2MaxIntervalSeconds: number;
    /** Sessions inactive longer than this (hours) stop L2 polling (default: 24) */
    sessionActiveWindowHours: number;
}
/** Recall settings — controls memory retrieval for context injection. */
export interface RecallConfig {
    /** Enable auto-recall (default: true) */
    enabled: boolean;
    /** Max results to return (default: 5) */
    maxResults: number;
    /** Max characters injected for a single recalled L1 memory. 0 disables the per-memory limit. */
    maxCharsPerMemory: number;
    /** Max total characters injected for all recalled L1 memories. 0 disables the total limit. */
    maxTotalRecallChars: number;
    /** Minimum score threshold (default: 0.3) */
    scoreThreshold: number;
    /** Search strategy (default: "hybrid") */
    strategy: "embedding" | "keyword" | "hybrid";
    /** Overall recall timeout in milliseconds (default: 5000). When exceeded, recall is skipped with a warning. */
    timeoutMs: number;
}
/** Embedding service configuration for vector search. */
export interface EmbeddingConfig {
    /** User-facing default is true in schema, but provider="none" still disables embedding effectively. */
    enabled: boolean;
    /** Embedding provider: default "none" disables vector search; other values (e.g. "openai", "deepseek") are treated as OpenAI-compatible remote providers. */
    provider: string;
    /** API Base URL (required for remote provider). */
    baseUrl: string;
    /** API Key (required for remote provider). */
    apiKey: string;
    /** Model name (required for remote provider). */
    model: string;
    /** Vector dimensions (required for remote provider, must match model). */
    dimensions: number;
    /**
     * Whether to send the `dimensions` field in the embeddings request body.
     * Default true (compatible with OpenAI text-embedding-3-* Matryoshka models).
     * Set to false for self-hosted / OSS models that reject unknown `dimensions`
     * (e.g. BGE-M3, which returns HTTP 400 "does not support matryoshka representation").
     */
    sendDimensions: boolean;
    /** Top-K candidates to recall during conflict detection (default: 5) */
    conflictRecallTopK: number;
    /** Proxy URL for qclaw provider — when provider="qclaw", requests are forwarded through this local proxy */
    proxyUrl?: string;
    /** Max input text length in characters before truncation (default: 5000). Texts exceeding this limit are truncated with a warning. */
    maxInputChars: number;
    /** Timeout per embedding API call in milliseconds (default: 10000). */
    timeoutMs: number;
    /** Override timeoutMs for recall-path embedding calls (user-facing, should be shorter). Falls back to timeoutMs. */
    recallTimeoutMs?: number;
    /** Override timeoutMs for capture-path embedding calls (background L1 dedup, can be longer). Falls back to timeoutMs. */
    captureTimeoutMs?: number;
    /** Internal-only local model cache directory, not exposed in plugin schema. */
    modelCacheDir?: string;
    /** If set, contains an error message about invalid remote config (embedding is disabled) */
    configError?: string;
}
/** Daily cleaner settings for local JSONL data (L0/L1). */
export interface MemoryCleanupConfig {
    /** TTL switch from capture.l0l1RetentionDays. Undefined means disabled. */
    retentionDays?: number;
    /** Whether cleanup is enabled. True only when retentionDays is a valid positive number. */
    enabled: boolean;
    /** Daily execution time in HH:mm format (default: 03:00). */
    cleanTime: string;
}
/** BM25 sparse vector encoding configuration (local @tencentdb-agent-memory/tcvdb-text). */
export interface BM25Config {
    /** Whether BM25 sparse encoding is enabled (default: true) */
    enabled: boolean;
    /** Language for BM25 pre-trained params: "zh" or "en" (default: "zh") */
    language: "zh" | "en";
}
/** Tencent Cloud VectorDB configuration. */
export interface TcvdbConfig {
    /** Instance URL (e.g. "http://10.0.1.1:80" or external domain) */
    url: string;
    /** Account name (default: "root") */
    username: string;
    /** API Key */
    apiKey: string;
    /** Database name (auto-generated from instance_id if empty) */
    database: string;
    /** User-friendly alias for this database (optional, for identification in database.json) */
    alias: string;
    /** Whether to enable VectorDB server-side dense embedding/vector index. Default false: BM25 sparse only. */
    embeddingEnabled?: boolean;
    /** Built-in embedding model (default: "bge-large-zh"; used only when embeddingEnabled=true) */
    embeddingModel: string;
    /** Request timeout in ms (default: 10000) */
    timeout: number;
    /** Path to CA certificate PEM file (for HTTPS connections) */
    caPemPath?: string;
}
/** Storage backend type. */
export type StoreBackend = "sqlite" | "tcvdb";
/** Report settings — controls metric/event reporting. */
export interface ReportConfig {
    /** Enable reporting (default: true) */
    enabled: boolean;
    /** Reporter type: "local" logs structured JSON via logger (default: "local") */
    type: string;
}
/**
 * Standalone LLM configuration — when set, TDAI uses direct API calls
 * instead of the host's built-in LLM runner (e.g. OpenClaw's runEmbeddedPiAgent).
 *
 * This allows using a different (often cheaper/faster) model for memory
 * extraction while the main agent uses a premium model.
 *
 * Leave undefined (default) to use the host's native LLM mechanism.
 */
export interface StandaloneLLMOverrideConfig {
    /** Enable standalone LLM mode (default: false). When false, uses host LLM. */
    enabled: boolean;
    /** OpenAI-compatible API base URL (e.g. "https://api.openai.com/v1"). */
    baseUrl: string;
    /** API key for authentication. */
    apiKey: string;
    /** Model name (e.g. "gpt-4o", "deepseek-v3", "claude-sonnet-4-6"). */
    model: string;
    /** Max output tokens (default: 4096). */
    maxTokens: number;
    /** Request timeout in milliseconds (default: 120000). */
    timeoutMs: number;
    /**
     * LLM 访问模式：
     *   - "openai": 直连 OpenAI 兼容服务（默认）
     *   - "proxy":  走 context_proxy，运行时把 baseUrl 拼成
     *               `${baseUrl}/proxy/<instanceId>/v1`，Authorization 用 memory 系统用户 key
     * gateway 层负责在构造 runner 前把 baseUrl / apiKey 换成解析后的最终值，
     * 因此 runner 无需感知 provider 字段。
     */
    provider?: "openai" | "proxy";
    /** provider=proxy 时的可选配置。 */
    proxy?: {
        /** 是否用 memory systemUser.userKey 作为 Authorization（默认 true）。 */
        useMemorySystemUserKey?: boolean;
    };
}
/** Context Offload settings — controls multi-layer context compression. */
export interface OffloadConfig {
    /** Enable context offload (default: false) */
    enabled: boolean;
    /**
     * LLM execution mode for L1/L1.5/L2 tasks.
     * - "local": call LLM directly via AI SDK (uses offload.model or main agent model)
     * - "backend": route through remote backend service (requires backendUrl)
     * - "client": stateless client mode — all compression delegated to offload server v2
     * - "collect": data collection only — runs L1/L1.5/L2 asynchronously but disables
     *   L3 compression and does NOT occupy the contextEngine slot (uses legacy compaction)
     * Default: "local" (auto-detects based on backendUrl presence for backward compat)
     */
    mode: "local" | "backend" | "client" | "collect";
    /** LLM model for offload tasks, format: "provider/model-id". Falls back to agents.defaults.model when omitted. */
    model?: string;
    /** LLM temperature (default: 0.2) */
    temperature: number;
    /** Force-trigger L1 when pending tool pairs >= this threshold (default: 4) */
    forceTriggerThreshold: number;
    /** Custom data directory (absolute path). Default: ~/.openclaw/context-offload */
    dataDir?: string;
    /** Default context window size (default: 200000) */
    defaultContextWindow: number;
    /** Max tool pairs per L1 batch (default: 20) */
    maxPairsPerBatch: number;
    /** Trigger L2 when node_id=null entries >= this count (default: 4) */
    l2NullThreshold: number;
    /** Trigger L2 if hasn't run for this many seconds (default: 300) */
    l2TimeoutSeconds: number;
    /** Mild compression ratio threshold (default: 0.5) */
    mildOffloadRatio: number;
    /** Aggressive compression ratio threshold (default: 0.85) */
    aggressiveCompressRatio: number;
    /** MMD injection token budget ratio (default: 0.2) */
    mmdMaxTokenRatio: number;
    /** Backend service URL. When set, L1/L1.5/L2/L4 LLM calls go through the backend. */
    backendUrl?: string;
    /** Backend API authentication token */
    backendApiKey?: string;
    /** Backend call timeout in milliseconds (default: 10000) */
    backendTimeoutMs: number;
    /**
     * Offload data retention days. Sessions/refs/mmds older than this are cleaned up.
     * 0 = disabled (default). Values in (0, 3) are treated as invalid and forced to 0.
     * Minimum effective value: 3.
     */
    offloadRetentionDays: number;
    /**
     * Max total size in MB for offload debug log files (*.log in dataRoot).
     * When exceeded, the largest logs are truncated to zero.
     * 0 = disabled. Default: 50.
     */
    logMaxSizeMb: number;
    /**
     * User identifier sent as `X-User-Id` on backend requests. This is the
     * primary key used by the backend `/offload/v1/store` endpoint to upsert
     * per-user state. When omitted the plugin falls back to the machine's
     * primary non-loopback IPv4 address.
     */
    userId?: string;
    /** Offload server v2 base URL (e.g. "http://localhost:9100"). */
    serverUrl?: string;
    /** Bearer token for offload server v2 Authorization header. */
    apiKey?: string;
    /** X-TDAI-Service-Id header value. */
    serviceId?: string;
    /** Agent name used in storage path (default: "default"). */
    agentName?: string;
    /** Client-side threshold: skip compaction when ratio < this value (default: 0.5). */
    compactionRatio?: number;
    /** Ingest request timeout in ms (default: 5000). */
    ingestTimeoutMs?: number;
    /** Compaction request timeout in ms (default: 30000). */
    compactionTimeoutMs?: number;
}
/** Fully resolved plugin configuration (v3). */
export interface MemoryTdaiConfig {
    /** Global prompt family; group-level promptMode can override it. */
    promptMode: MemoryPromptMode;
    capture: CaptureConfig;
    extraction: ExtractionConfig;
    persona: PersonaConfig;
    pipeline: PipelineTriggerConfig;
    recall: RecallConfig;
    embedding: EmbeddingConfig;
    /** Storage backend: "sqlite" (default) or "tcvdb" */
    storeBackend: StoreBackend;
    /** Tencent Cloud VectorDB configuration (required when storeBackend = "tcvdb") */
    tcvdb: TcvdbConfig;
    /** BM25 sparse vector encoding (local @tencentdb-agent-memory/tcvdb-text) */
    bm25: BM25Config;
    /** Local JSONL cleanup settings */
    memoryCleanup: MemoryCleanupConfig;
    report: ReportConfig;
    /**
     * Standalone LLM override — when enabled, TDAI bypasses the host's LLM
     * (e.g. OpenClaw's runEmbeddedPiAgent) and uses direct OpenAI-compatible
     * API calls for L1/L2/L3 extraction.
     *
     * Default: disabled (uses host LLM).
     */
    llm: StandaloneLLMOverrideConfig;
    offload: OffloadConfig;
}
/**
 * Parse plugin config from raw user input.
 * All fields have sensible defaults — minimal config is just {}.
 */
export declare function parseConfig(raw: Record<string, unknown> | undefined): MemoryTdaiConfig;
