import { type StorageAdapter } from "../storage/adapter.js";
import type { MemoryGenerationLayer, MemoryGenerationLog, MemoryGenerationLogListFilter, MemoryGenerationStatus, MemoryGenerationLogListItem, MemoryGenerationProvenance } from "./types.js";
import type { ResolvedMemoryPrompt } from "../memory-prompt/types.js";
export declare function buildGenerationLogIdentity(layer: MemoryGenerationLayer, finishedAtMs: number, anchorMemoryId?: string, status?: MemoryGenerationStatus): {
    generationId: string;
    logId: string;
    key: string;
};
export declare function buildPromptGenerationRef(resolved: ResolvedMemoryPrompt | undefined, layer: MemoryGenerationLayer): MemoryGenerationLog["prompt"];
export declare function buildGenerationProvenance(identity: ReturnType<typeof buildGenerationLogIdentity>, prompt: MemoryGenerationLog["prompt"]): MemoryGenerationProvenance;
export declare class MemoryGenerationLogStore {
    private readonly instanceId;
    private readonly storage;
    constructor(storage: StorageAdapter, instanceId: string);
    write(log: MemoryGenerationLog, key: string): Promise<void>;
    getByKey(key: string): Promise<MemoryGenerationLog | null>;
    getByLogId(logId: string): Promise<MemoryGenerationLog | null>;
    list(filter: MemoryGenerationLogListFilter): Promise<{
        items: MemoryGenerationLogListItem[];
        next_cursor?: string;
    }>;
}
