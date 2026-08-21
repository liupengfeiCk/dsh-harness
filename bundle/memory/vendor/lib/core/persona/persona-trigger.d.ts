/**
 * PersonaTrigger: determines whether to trigger persona generation.
 * Implements the 5 trigger conditions from the legacy system.
 */
import type { StorageAdapter } from "../storage/adapter.js";
import type { Logger } from "../types.js";
type TriggerLogger = Logger;
export interface TriggerResult {
    should: boolean;
    reason: string;
}
export declare class PersonaTrigger {
    private dataDir;
    private interval;
    private logger;
    private storage;
    constructor(opts: {
        dataDir: string;
        interval: number;
        logger?: TriggerLogger;
        storage?: StorageAdapter;
    });
    shouldGenerate(): Promise<TriggerResult>;
    private hasSceneFiles;
    /**
     * Check whether persona.md has a non-empty body (excluding scene navigation).
     * Returns false if the file doesn't exist, is empty, or only contains
     * scene navigation (no actual persona content).
     */
    private hasPersonaBody;
}
export {};
