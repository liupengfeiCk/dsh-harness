/**
 * StandaloneHostAdapter — HostAdapter for the TDAI Gateway (Hermes sidecar).
 *
 * Does NOT depend on OpenClaw. Context is constructed from Gateway config
 * and per-request parameters (session_id, user_id, etc.).
 */
import type { StandaloneLLMConfig } from "./llm-runner.js";
import type { HostAdapter, RuntimeContext, Logger, LLMRunnerFactory } from "../../core/types.js";
export interface StandaloneHostAdapterOptions {
    /** Base data directory for TDAI storage. */
    dataDir: string;
    /** LLM configuration for model calls. */
    llmConfig: StandaloneLLMConfig;
    /** Logger instance. */
    logger: Logger;
    /** Default user ID (can be overridden per-request). */
    defaultUserId?: string;
    /** Platform identifier. */
    platform?: string;
}
export declare class StandaloneHostAdapter implements HostAdapter {
    readonly hostType: "standalone";
    private dataDir;
    private logger;
    private runnerFactory;
    private defaultUserId;
    private platform;
    constructor(opts: StandaloneHostAdapterOptions);
    getRuntimeContext(): RuntimeContext;
    /**
     * Build a RuntimeContext for a specific request.
     * Used by Gateway route handlers to scope each request to the correct user/session.
     */
    buildRuntimeContextForRequest(params: {
        userId?: string;
        sessionId?: string;
        sessionKey?: string;
        platform?: string;
    }): RuntimeContext;
    getLogger(): Logger;
    getLLMRunnerFactory(): LLMRunnerFactory;
}
