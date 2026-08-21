/**
 * Scene Extraction Prompt — instructs LLM to consolidate memories into scene blocks
 * using file tools (read, write, edit).
 *
 * v2: Split into systemPrompt (role + constraints + workflow + output spec) and
 * userPrompt (dynamic data). Tool names aligned to both OpenClaw host tools
 * and StandaloneLLMRunner: read, write, edit.
 *
 * Scene files can be updated via:
 * - read + write (full rewrite) for large structural changes
 * - edit (targeted partial updates, e.g. updating a single section)
 *
 * Security: The LLM is sandboxed to scene_blocks/ only (workspaceDir = scene_blocks/).
 * It has NO visibility into checkpoint, scene_index, persona.md, or any other system file.
 * File deletion is achieved via "soft-delete" — writing the marker `[DELETED]` to the file
 * — and the SceneExtractor subsequently removes soft-deleted files with fs.unlink.
 * Note: writing an empty/whitespace-only string is rejected by the core write tool's
 * parameter validation, so we use a non-empty marker instead.
 *
 * Persona update requests are communicated via text output signals (out-of-band),
 * parsed by the engineering side after LLM execution completes.
 */
import type { MemoryPromptMode } from "../../config.js";
export interface SceneExtractionPromptParams {
    memoriesJson: string;
    sceneSummaries: string;
    currentTimestamp: string;
    sceneCountWarning?: string;
    /** List of existing scene filenames (relative, e.g. ["work.md", "hobby.md"]) */
    existingSceneFiles?: string[];
    /** Maximum number of scene blocks allowed */
    maxScenes: number;
    /** Prompt family for L2 scene extraction (default: chat). */
    promptMode?: MemoryPromptMode;
}
export interface SceneExtractionPromptResult {
    systemPrompt: string;
    userPrompt: string;
}
export declare function buildSceneExtractionPrompt(params: SceneExtractionPromptParams): SceneExtractionPromptResult;
