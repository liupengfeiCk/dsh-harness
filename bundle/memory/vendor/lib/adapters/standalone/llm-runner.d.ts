/**
 * StandaloneLLMRunner — powered by Vercel AI SDK (`ai` + `@ai-sdk/openai`).
 *
 * This runner does NOT depend on OpenClaw's `runEmbeddedPiAgent`. It is designed
 * for the Hermes Gateway scenario where TDAI runs as an independent Node.js sidecar
 * without the OpenClaw host.
 *
 * Capabilities:
 * - `enableTools: false`: pure text output (L1 extraction, L1 dedup)
 * - `enableTools: true`: automatic tool-call loop with local file operations
 *   (L2 scene, L3 persona) via AI SDK's `maxSteps`
 *
 * Tool sandbox:
 *   When tools are enabled, three basic file operations are exposed:
 *   `read`, `write`, `edit` — aligned with OpenClaw host tool names.
 *   All file paths are resolved relative to `workspaceDir`, enforcing sandbox boundaries.
 */
import type { LLMRunner, LLMRunParams, LLMRunnerFactory, LLMRunnerCreateOptions, Logger } from "../../core/types.js";
/**
 * Token usage side-channel 类型。
 * 原由 core/report/metric-tracking-runner.js 导出（计费观测，已随多租户/计费裁切移除）。
 * 此处本地保留该最小类型，供 runner 的 lastUsage 侧信道与装饰器读取。
 */
export interface LLMUsage {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
}
export interface StandaloneLLMConfig {
    /** OpenAI-compatible API base URL (e.g. "https://api.openai.com/v1"). */
    baseUrl: string;
    /** API key for authentication. */
    apiKey: string;
    /** Default model name (e.g. "gpt-4o"). */
    model: string;
    /** Default max output tokens. */
    maxTokens?: number;
    /** Request timeout in milliseconds (default: 120_000). */
    timeoutMs?: number;
    /**
     * LLM 访问模式（gateway 层解释；runner 拿到的是已解析后的 baseUrl/apiKey）：
     *   - "openai": 直连通用 OpenAI 兼容服务（默认，向后兼容）
     *   - "proxy":  走 context_proxy，运行时会自动把 baseUrl 拼成
     *               `${baseUrl}/proxy/<instanceId>/v1`，apiKey 用 metadata.systemUser.memory.userKey
     */
    provider?: "openai" | "proxy";
    /** provider=proxy 时的可选配置。 */
    proxy?: {
        /** 是否用 memory systemUser.userKey 作为 Authorization（默认 true）。 */
        useMemorySystemUserKey?: boolean;
    };
}
export declare class StandaloneLLMRunner implements LLMRunner {
    private config;
    private model;
    private enableTools;
    private logger?;
    /**
     * Side-channel: 最近一次 run() 调用的 token usage。
     * 由 MetricTrackingRunner 装饰器读取，用于精确上报 credit。
     * 不改变 LLMRunner 接口签名。
     */
    lastUsage?: LLMUsage;
    constructor(opts: {
        config: StandaloneLLMConfig;
        model?: string;
        enableTools?: boolean;
        logger?: Logger;
    });
    run(params: LLMRunParams): Promise<string>;
}
export interface StandaloneLLMRunnerFactoryOptions {
    /** LLM API configuration. */
    config: StandaloneLLMConfig;
    /** Logger instance. */
    logger?: Logger;
}
/**
 * Factory that creates StandaloneLLMRunner instances.
 *
 * Used by the Gateway and Hermes host adapters.
 */
export declare class StandaloneLLMRunnerFactory implements LLMRunnerFactory {
    private config;
    private logger?;
    constructor(opts: StandaloneLLMRunnerFactoryOptions);
    createRunner(opts?: LLMRunnerCreateOptions): LLMRunner;
}
