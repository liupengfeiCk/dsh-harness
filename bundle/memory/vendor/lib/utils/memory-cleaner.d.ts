import type { IMemoryStore } from "../core/store/types.js";
import type { Logger } from "../core/types.js";
export interface MemoryCleanerOptions {
    baseDir: string;
    retentionDays: number;
    cleanTime: string;
    logger?: Logger;
    vectorStore?: IMemoryStore;
}
export declare class LocalMemoryCleaner {
    private readonly opts;
    private readonly timer;
    private destroyed;
    private vectorStore?;
    constructor(opts: MemoryCleanerOptions);
    setVectorStore(vectorStore: IMemoryStore | undefined): void;
    start(): void;
    destroy(): void;
    runOnce(nowMs?: number): Promise<void>;
    private scheduleNext;
    private runAndReschedule;
    private cleanDirectory;
}
