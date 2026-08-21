/**
 * PersonaGenerator: generates or updates user persona using the four-layer
 * deep scan model via CleanContextRunner.
 */
import type { MemoryPromptMode } from "../../config.js";
import type { LLMRunner, Logger, TraceContext } from "../types.js";
import type { StorageAdapter } from "../storage/adapter.js";
import type { ResolvedMemoryPrompt } from "../memory-prompt/types.js";
export declare class PersonaGenerator {
    private dataDir;
    private runner;
    private logger;
    private backupCount;
    private promptMode;
    private memoryPrompt;
    private instanceId;
    private storage;
    private traceContext;
    constructor(opts: {
        dataDir: string;
        config: unknown;
        model?: string;
        /** Prompt family for L3 generation (default: chat). */
        promptMode?: MemoryPromptMode;
        /** Resolved custom strategy. Undefined preserves the current system prompt exactly. */
        memoryPrompt?: ResolvedMemoryPrompt;
        backupCount?: number;
        logger?: Logger;
        /** Plugin instance ID for metric reporting (optional) */
        instanceId?: string;
        /**
         * Host-neutral LLM runner. When provided, used instead of creating
         * a CleanContextRunner (decouples from OpenClaw runtime).
         * Must be configured with `enableTools: true`.
         */
        llmRunner?: LLMRunner;
        /** StorageAdapter for file operations (COS/local). Falls back to fs when absent. */
        storage?: StorageAdapter;
        /** langfuse 上报身份四元组（team/user/agent/session），填充 trace 顶级字段。 */
        traceContext?: TraceContext;
    });
    /**
     * Execute local persona generation without advancing checkpoint.
     */
    generateLocalPersona(triggerReason?: string): Promise<boolean>;
    /**
     * Backward-compatible wrapper: local generation + checkpoint advance.
     */
    generate(triggerReason?: string): Promise<boolean>;
}
