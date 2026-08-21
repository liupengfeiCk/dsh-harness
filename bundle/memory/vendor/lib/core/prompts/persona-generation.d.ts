/**
 * Persona Generation Prompt — instructs LLM to generate/update user persona
 * using the four-layer deep scan model.
 *
 * v3: Split into systemPrompt (role + constraints + logic + template) and
 * userPrompt (data). Tool names aligned to OpenClaw actual API (write/edit).
 */
import type { MemoryPromptMode } from "../../config.js";
export interface PersonaPromptParams {
    mode: "first" | "incremental";
    /** Prompt family for L3 generation (default: chat). */
    promptMode?: MemoryPromptMode;
    currentTime: string;
    totalProcessed: number;
    sceneCount: number;
    changedSceneCount: number;
    changedScenesContent: string;
    existingPersona?: string;
    triggerInfo?: string;
    /** @deprecated Kept for call-site compatibility; no longer used in prompt. */
    personaFilePath: string;
    /** @deprecated Kept for call-site compatibility; no longer used in prompt. */
    checkpointPath: string;
}
export interface PersonaPromptResult {
    systemPrompt: string;
    userPrompt: string;
}
export declare function buildPersonaPrompt(params: PersonaPromptParams): PersonaPromptResult;
