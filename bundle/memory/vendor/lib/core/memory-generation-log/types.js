import { createHash } from "node:crypto";
export function buildMemoryGenerationRefId(layer, memoryId) {
    const digest = createHash("sha256").update(memoryId).digest("hex").slice(0, 40);
    return `mgr:${layer}:${digest}`;
}
