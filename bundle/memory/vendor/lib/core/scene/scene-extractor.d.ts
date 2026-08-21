/**
 * SceneExtractor: LLM-driven memory extraction into scene blocks.
 *
 * Replaces the keyword-based SceneManager.processNewMemories() with an
 * LLM agent that autonomously reads/writes scene block files using tools.
 *
 * Security: The LLM is sandboxed — workspaceDir is set to scene_blocks/
 * so it can ONLY operate on .md scene files. System files (checkpoint,
 * scene_index, persona.md) are physically invisible to the LLM.
 *
 * Flow:
 *   1. Backup + load scene index + build summaries
 *   2. Assemble extraction prompt with memories + scene context
 *   3. Run via CleanContextRunner (tools enabled, sandboxed to scene_blocks/)
 *   4. Cleanup: remove soft-deletes, sync index, update navigation
 *   5. Parse LLM text output for out-of-band persona update signals
 */
import type { MemoryPromptMode } from "../../config.js";
import type { LLMRunner, Logger, TraceContext } from "../types.js";
import type { StorageAdapter } from "../storage/adapter.js";
import type { ResolvedMemoryPrompt } from "../memory-prompt/types.js";
type ExtractorLogger = Logger;
export interface ExtractionResult {
    memoriesProcessed: number;
    success: boolean;
    error?: string;
    /** True if LLM ran but produced no file changes (scene_index unchanged). */
    emptyExtraction?: boolean;
}
export interface SceneExtractorOptions {
    dataDir: string;
    config: unknown;
    model?: string;
    maxScenes?: number;
    /** Prompt family for L2 scene extraction (default: chat). */
    promptMode?: MemoryPromptMode;
    /** Resolved custom strategy. Undefined preserves the current system prompt exactly. */
    memoryPrompt?: ResolvedMemoryPrompt;
    sceneBackupCount?: number;
    timeoutMs?: number;
    logger?: ExtractorLogger;
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
    /** langfuse 上报身份四元组（team/user/agent/session）。传下来会填充 trace 顶级字段。 */
    traceContext?: TraceContext;
}
/**
 * Parse LLM text output for a persona update request signal.
 *
 * Supports multiple formats for robustness:
 * - Block: [PERSONA_UPDATE_REQUEST]reason: xxx[/PERSONA_UPDATE_REQUEST]
 * - Inline: PERSONA_UPDATE_REQUEST: xxx
 */
export declare function parsePersonaUpdateSignal(text: string): {
    reason: string;
} | null;
export declare class SceneExtractor {
    private dataDir;
    private runner;
    private maxScenes;
    private sceneBackupCount;
    private promptMode;
    private memoryPrompt;
    private timeoutMs;
    private logger;
    private instanceId;
    private storage;
    private traceContext;
    constructor(opts: SceneExtractorOptions);
    /**
     * Extract a batch of memories into scene blocks using the LLM agent.
     *
     * @param memories - Array of raw memory records from the API
     * @returns Extraction result with count and success flag
     */
    extract(memories: Array<{
        content: string;
        created_at: string;
        id?: string;
    }>): Promise<ExtractionResult>;
    /**
     * Build human-readable scene summaries for the prompt,
     * and collect the list of existing scene filenames (relative).
     *
     * Includes a capacity counter at the top (e.g. "当前场景总数：5 / 15")
     * so the LLM can immediately see how close it is to the limit.
     */
    private buildSceneSummaries;
    /**
     * Update the scene navigation section at the end of persona.md.
     *
     * Reads the current scene index, generates the navigation block, then
     * strips any existing navigation from persona.md and appends the new one.
     *
     * IMPORTANT: If the persona body is empty (PersonaGenerator hasn't run yet),
     * we skip writing to avoid creating a persona.md that only contains the
     * scene navigation. PersonaGenerator.generate() will write the full
     * persona + navigation when it runs.
     */
    private updateSceneNavigation;
}
export {};
