import type { ResolvedMemoryPrompt } from "./types.js";
/**
 * Preserve the existing system prompt byte-for-byte when no custom prompt is
 * resolved. A custom strategy is appended only for agent/team/instance hits.
 */
export declare function composeMemorySystemPrompt(currentSystemPrompt: string, resolved?: ResolvedMemoryPrompt): string;
