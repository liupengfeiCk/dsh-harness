import { createHash } from "node:crypto";
function targetHash(value) {
    return createHash("sha256").update(value).digest("hex").slice(0, 32);
}
export function buildMemoryPromptSettingId(target, layer) {
    if (target.agentId) {
        if (!target.teamId)
            throw new Error("teamId is required for an agent prompt setting");
        return `mps:a:${targetHash(`${target.teamId}\0${target.agentId}`)}:${layer}`;
    }
    if (target.teamId)
        return `mps:t:${targetHash(target.teamId)}:${layer}`;
    return `mps:i:${layer}`;
}
export function getMemoryPromptTargetType(target) {
    if (target.agentId)
        return "agent";
    if (target.teamId)
        return "team";
    return "instance";
}
