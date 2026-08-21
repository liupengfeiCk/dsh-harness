import type { Logger } from "../types.js";
export declare function writeGenerationProvenanceBestEffort(params: {
    layer: "l1" | "l2" | "l3";
    logger?: Logger;
    writeLog: () => Promise<void>;
    writeRefs?: () => Promise<void>;
}): Promise<void>;
