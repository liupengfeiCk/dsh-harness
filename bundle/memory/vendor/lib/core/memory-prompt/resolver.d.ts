import type { IMemoryStore } from "../store/types.js";
import { type MemoryPromptLayer, type MemoryPromptStore, type ResolvedMemoryPrompt } from "./types.js";
export interface MemoryPromptResolveTarget {
    teamId?: string;
    agentId?: string;
    layer: MemoryPromptLayer;
}
export declare function memoryPromptResolveKey(target: MemoryPromptResolveTarget): string;
export declare function resolveMemoryPrompts(store: IMemoryStore | MemoryPromptStore | undefined, targets: MemoryPromptResolveTarget[]): Promise<Map<string, ResolvedMemoryPrompt | undefined>>;
export declare function resolveMemoryPrompt(store: IMemoryStore | MemoryPromptStore | undefined, target: MemoryPromptResolveTarget): Promise<ResolvedMemoryPrompt | undefined>;
