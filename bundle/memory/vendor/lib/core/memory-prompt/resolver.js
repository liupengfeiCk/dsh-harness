import { buildMemoryPromptSettingId, } from "./types.js";
export function memoryPromptResolveKey(target) {
    return `${target.teamId ?? ""}\0${target.agentId ?? ""}\0${target.layer}`;
}
function candidates(target) {
    const result = [];
    if (target.agentId && target.teamId) {
        result.push({
            id: buildMemoryPromptSettingId({ teamId: target.teamId, agentId: target.agentId }, target.layer),
            source: "agent",
            teamId: target.teamId,
            agentId: target.agentId,
        });
    }
    if (target.teamId) {
        result.push({
            id: buildMemoryPromptSettingId({ teamId: target.teamId }, target.layer),
            source: "team",
            teamId: target.teamId,
        });
    }
    result.push({ id: buildMemoryPromptSettingId({}, target.layer), source: "instance" });
    return result;
}
export async function resolveMemoryPrompts(store, targets) {
    const result = new Map();
    const promptStore = store;
    if (!promptStore?.getMemoryPromptSettings || !promptStore.getMemoryPrompts) {
        for (const target of targets)
            result.set(memoryPromptResolveKey(target), undefined);
        return result;
    }
    const uniqueTargets = [...new Map(targets.map((target) => [memoryPromptResolveKey(target), target])).values()];
    const candidateMap = new Map();
    const settingIds = new Set();
    for (const target of uniqueTargets) {
        const list = candidates(target);
        candidateMap.set(memoryPromptResolveKey(target), list);
        for (const candidate of list)
            settingIds.add(candidate.id);
    }
    const settings = await promptStore.getMemoryPromptSettings([...settingIds]);
    const settingsById = new Map(settings.map((setting) => [setting.setting_id, setting]));
    const promptIds = [...new Set(settings.map((setting) => setting.memory_prompt_id))];
    const prompts = promptIds.length > 0 ? await promptStore.getMemoryPrompts(promptIds) : [];
    const promptsById = new Map(prompts.map((prompt) => [prompt.memory_prompt_id, prompt]));
    for (const target of uniqueTargets) {
        let resolved;
        for (const candidate of candidateMap.get(memoryPromptResolveKey(target)) ?? []) {
            const setting = settingsById.get(candidate.id);
            if (!setting || setting.layer !== target.layer || setting.target_type !== candidate.source)
                continue;
            if ((candidate.teamId ?? "") !== (setting.team_id ?? ""))
                continue;
            if ((candidate.agentId ?? "") !== (setting.agent_id ?? ""))
                continue;
            const prompt = promptsById.get(setting.memory_prompt_id);
            if (!prompt || prompt.status !== "active" || prompt.layer !== target.layer)
                continue;
            resolved = {
                memory_prompt_id: prompt.memory_prompt_id,
                prompt: prompt.prompt,
                layer: prompt.layer,
                source: candidate.source,
                version: prompt.version,
            };
            break;
        }
        result.set(memoryPromptResolveKey(target), resolved);
    }
    return result;
}
export async function resolveMemoryPrompt(store, target) {
    return (await resolveMemoryPrompts(store, [target])).get(memoryPromptResolveKey(target));
}
