/**
 * L1 Memory Extractor: extracts structured memories from L0 conversation messages
 * using a single LLM call with JSON-mode structured output.
 *
 * v3: Aligned with Kenty's prompt — scene segmentation + memory extraction in one call,
 * followed by batch conflict detection.
 *
 * Pipeline:
 * 1. Read recent messages from L0 (split into background + new)
 * 2. Call LLM to extract scene-segmented memories
 * 3. Batch conflict detection against existing records
 * 4. Write to L1 JSONL files
 */
import { formatExtractionPrompt, getExtractMemoriesSystemPrompt } from "../prompts/l1-extraction.js";
import { batchDedup } from "./l1-dedup.js";
import { writeMemory, generateMemoryId } from "./l1-writer.js";
import { sanitizeJsonForParse, shouldExtractL1 } from "../../utils/sanitize.js";
import { report } from "../report/reporter.js";
import { buildTraceParams } from "../types.js";
import { StorageAdapter } from "../storage/adapter.js";
import { composeMemorySystemPrompt } from "../memory-prompt/composer.js";
import { LocalStorageBackend } from "../storage/local-backend.js";
import { buildGenerationLogIdentity, buildGenerationProvenance, buildPromptGenerationRef, MemoryGenerationLogStore, } from "../memory-generation-log/store.js";
import { writeGenerationProvenanceBestEffort } from "../memory-generation-log/best-effort.js";
import { buildMemoryGenerationRefId, } from "../memory-generation-log/types.js";
const TAG = "[memory-tdai][l1-extractor]";
// ============================
// Core function
// ============================
/**
 * Run the full L1 extraction pipeline on conversation messages.
 *
 * @param messages - Filtered conversation messages (from L0 or directly from hook)
 * @param sessionKey - The session key
 * @param baseDir - Base data directory (~/.openclaw/memory-tdai/)
 * @param config - OpenClaw config (for LLM access)
 * @param options - Extraction options
 * @param logger - Optional logger
 */
export async function extractL1Memories(params) {
    const { messages, sessionKey, sessionId, taskId, teamId, userId, agentId, baseDir, config, logger, instanceId: metricInstanceId, storage } = params;
    const options = params.options ?? {};
    const maxNewMessages = options.maxMessagesPerExtraction ?? 10;
    const maxBgMessages = options.maxBackgroundMessages ?? 5;
    const enableDedup = options.enableDedup ?? true;
    const maxMemoriesPerSession = options.maxMemoriesPerSession ?? 10;
    if (messages.length === 0) {
        logger?.debug?.(`${TAG} No messages to extract from`);
        return { success: true, extractedCount: 0, storedCount: 0, records: [], sceneNames: [] };
    }
    const l1StartMs = Date.now();
    // Quality gate: filter messages through L1 extraction rules (length, symbols,
    // prompt injection, etc.) before sending to the LLM. L0 deliberately captures
    // everything; the strict filtering happens here at L1 stage.
    const qualifiedMessages = messages.filter((m) => shouldExtractL1(m.content));
    if (qualifiedMessages.length < messages.length) {
        logger?.debug?.(`${TAG} L1 quality filter: ${messages.length} → ${qualifiedMessages.length} messages ` +
            `(${messages.length - qualifiedMessages.length} filtered out)`);
    }
    if (qualifiedMessages.length === 0) {
        logger?.debug?.(`${TAG} All messages filtered out by L1 quality gate`);
        return { success: true, extractedCount: 0, storedCount: 0, records: [], sceneNames: [] };
    }
    // Split messages into background (older) + new (recent)
    const newMessages = qualifiedMessages.slice(-maxNewMessages);
    const bgEndIdx = qualifiedMessages.length - newMessages.length;
    const backgroundMessages = bgEndIdx > 0
        ? qualifiedMessages.slice(Math.max(0, bgEndIdx - maxBgMessages), bgEndIdx)
        : [];
    logger?.debug?.(`${TAG} Extracting from ${newMessages.length} new messages (+ ${backgroundMessages.length} background) [${qualifiedMessages.length} qualified from ${messages.length} input]`);
    // Step 1: LLM extraction (scene segmentation + memory extraction)
    let scenes;
    try {
        scenes = await callLlmExtraction({
            newMessages,
            backgroundMessages,
            previousSceneName: options.previousSceneName,
            config,
            logger,
            model: options.model,
            promptMode: options.promptMode,
            memoryPrompt: options.memoryPrompt,
            traceContext: { teamId, userId, agentId, sessionId },
            llmRunner: options.llmRunner,
        });
        logger?.debug?.(`${TAG} LLM detected ${scenes.length} scene(s)`);
    }
    catch (err) {
        logger?.error(`${TAG} LLM extraction failed: ${err instanceof Error ? err.message : String(err)}`);
        return { success: false, extractedCount: 0, storedCount: 0, records: [], sceneNames: [] };
    }
    // Flatten all memories across scenes
    const allExtracted = [];
    const sceneNames = [];
    for (const scene of scenes) {
        sceneNames.push(scene.scene_name);
        for (const mem of scene.memories) {
            const memType = normalizeType(mem.type);
            if (!memType) {
                logger?.warn?.(`${TAG} Skipping memory with invalid type "${mem.type}"`);
                continue;
            }
            allExtracted.push({
                content: mem.content,
                type: memType,
                priority: typeof mem.priority === "number" ? mem.priority : 50,
                source_message_ids: Array.isArray(mem.source_message_ids) ? mem.source_message_ids : [],
                metadata: mem.metadata ?? {},
                scene_name: scene.scene_name,
            });
        }
    }
    logger?.debug?.(`${TAG} Total extracted memories: ${allExtracted.length} across ${scenes.length} scene(s)`);
    if (allExtracted.length === 0) {
        // NOTE: 原 L1 提取率评测指标（metricProducer，Kafka 计费观测）已随
        // 多租户/计费裁切移除（设计文档 §8.4）。
        return {
            success: true,
            extractedCount: 0,
            storedCount: 0,
            records: [],
            sceneNames,
            lastSceneName: sceneNames[sceneNames.length - 1],
        };
    }
    // Limit per session
    let extracted = allExtracted;
    if (extracted.length > maxMemoriesPerSession) {
        logger?.debug?.(`${TAG} Limiting from ${extracted.length} to ${maxMemoriesPerSession} memories per session`);
        extracted = extracted.slice(0, maxMemoriesPerSession);
    }
    // Assign temporary IDs to extracted memories (needed for batch dedup)
    const memoriesWithIds = extracted.map((m) => ({
        ...m,
        record_id: generateMemoryId(),
    }));
    // Step 2: Batch Conflict Detection + Write
    let storedRecords;
    let dedupLatencyMs = null;
    const generationFinishedAt = Date.now();
    const generationIdentity = buildGenerationLogIdentity("l1", generationFinishedAt, memoriesWithIds[0]?.record_id);
    const generationPrompt = buildPromptGenerationRef(options.memoryPrompt, "l1");
    const generation = buildGenerationProvenance(generationIdentity, generationPrompt);
    if (enableDedup) {
        try {
            const dedupStartMs = Date.now();
            const decisions = await batchDedup({
                memories: memoriesWithIds,
                config,
                logger,
                model: options.model,
                promptMode: options.promptMode,
                vectorStore: options.vectorStore,
                embeddingService: options.embeddingService,
                conflictRecallTopK: options.conflictRecallTopK,
                embeddingTimeoutMs: options.embeddingTimeoutMs,
                llmRunner: options.llmRunner,
                traceContext: { teamId, userId, agentId, sessionId },
                ...(teamId || userId || agentId || sessionId || taskId ? { filter: { teamId, userId, agentId, sessionId, taskId } } : {}),
            });
            dedupLatencyMs = Date.now() - dedupStartMs;
            // NOTE: 原去重决策分布评测指标（metricProducer，Kafka 计费观测）已随
            // 多租户/计费裁切移除（设计文档 §8.4）。
            storedRecords = await applyDecisions({
                memoriesWithIds,
                decisions,
                baseDir,
                sessionKey,
                sessionId,
                taskId,
                teamId,
                userId,
                agentId,
                logger,
                vectorStore: options.vectorStore,
                embeddingService: options.embeddingService,
                storage,
            });
        }
        catch (err) {
            logger?.warn?.(`${TAG} Batch dedup failed, storing all as new: ${err instanceof Error ? err.message : String(err)}`);
            storedRecords = await storeAllDirectly(memoriesWithIds, baseDir, sessionKey, sessionId, taskId, teamId, userId, agentId, logger, options.vectorStore, options.embeddingService, storage);
        }
    }
    else {
        storedRecords = await storeAllDirectly(memoriesWithIds, baseDir, sessionKey, sessionId, taskId, teamId, userId, agentId, logger, options.vectorStore, options.embeddingService, storage);
    }
    const logStorage = storage ?? new StorageAdapter(new LocalStorageBackend(baseDir));
    const generationLogStore = new MemoryGenerationLogStore(logStorage, metricInstanceId ?? "standalone");
    const generationLog = {
        schema_version: 1,
        log_id: generationIdentity.logId,
        generation_id: generationIdentity.generationId,
        instance_id: metricInstanceId ?? "standalone",
        layer: "l1",
        status: "succeeded",
        team_id: teamId,
        agent_id: agentId,
        user_id: userId,
        session_id: sessionId,
        task_id: taskId,
        prompt: generationPrompt,
        anchor_memory_id: storedRecords[0]?.id ?? memoriesWithIds[0]?.record_id,
        input_refs: newMessages.map((message) => ({ layer: "l0", record_id: message.id })),
        output_refs: storedRecords.map((record) => ({ layer: "l1", record_id: record.id })),
        model: options.model,
        prompt_mode: options.promptMode ?? "chat",
        started_at_ms: l1StartMs,
        finished_at_ms: generationFinishedAt,
        latency_ms: generationFinishedAt - l1StartMs,
    };
    await writeGenerationProvenanceBestEffort({
        layer: "l1",
        logger,
        writeLog: async () => generationLogStore.write(generationLog, generationIdentity.key),
        writeRefs: options.vectorStore?.upsertMemoryGenerationRefs && storedRecords.length > 0
            ? async () => options.vectorStore.upsertMemoryGenerationRefs(storedRecords.map((record) => ({
                generation_ref_id: buildMemoryGenerationRefId("l1", record.id),
                layer: "l1",
                memory_id: record.id,
                ...generation,
                created_at_ms: generationFinishedAt,
            })))
            : undefined,
    });
    logger?.info(`${TAG} Extraction complete: extracted=${extracted.length}, stored=${storedRecords.length}`);
    // ── l1_extraction metric ──
    if (metricInstanceId && logger) {
        // Build type distribution of stored memories
        const memoriesByType = {};
        for (const r of storedRecords) {
            memoriesByType[r.type] = (memoriesByType[r.type] ?? 0) + 1;
        }
        report("l1_extraction", {
            sessionKey,
            inputMessageCount: messages.length,
            memoriesExtracted: extracted.length,
            memoriesStored: storedRecords.length,
            memoriesStoredContent: storedRecords.map((r) => ({
                content: r.content,
                type: r.type,
                scene: r.scene_name ?? null,
            })),
            memoriesByType,
            totalDurationMs: Date.now() - l1StartMs,
            success: true,
            error: null,
        });
    }
    // NOTE: 原 L1 提取率 / 延迟评测指标（metricProducer + reportL1LatencyMetrics，
    // Kafka 计费观测）已随多租户/计费裁切移除（设计文档 §8.4）。
    return {
        success: true,
        extractedCount: extracted.length,
        storedCount: storedRecords.length,
        records: storedRecords,
        sceneNames,
        lastSceneName: sceneNames[sceneNames.length - 1],
    };
}
// ============================
// LLM call
// ============================
/**
 * Call LLM to extract scene-segmented memories from conversation messages.
 */
async function callLlmExtraction(params) {
    const { newMessages, backgroundMessages, previousSceneName, config, logger, model, promptMode = "chat", memoryPrompt, llmRunner, traceContext } = params;
    const systemPrompt = composeMemorySystemPrompt(getExtractMemoriesSystemPrompt(promptMode), memoryPrompt);
    const userPrompt = formatExtractionPrompt({
        newMessages,
        backgroundMessages,
        previousSceneName,
    });
    // [l1-debug] ENTRY — what are we about to ask the LLM to extract?
    logger?.debug?.(`${TAG} [l1-debug] ENTRY taskId=l1-extraction, promptMode=${promptMode}, newMsgs=${newMessages.length}, bgMsgs=${backgroundMessages.length}, userPromptLen=${userPrompt.length}, sysPromptLen=${systemPrompt.length}, model=${model ?? "(default)"}, previousSceneName=${previousSceneName ? JSON.stringify(previousSceneName) : "(none)"}, runnerKind=${llmRunner ? "llmRunner" : "CleanContextRunner"}`);
    let result;
    // langfuse trace 语义：让此次 L1 抽取在 UI 有稳定 name / 顶级 user/session 列
    // / 可筛选 tags。避免所有记忆抽取都显示为 Unnamed trace。
    const traceParams = buildTraceParams("memory.l1-extract", traceContext);
    if (llmRunner) {
        // Use the host-neutral LLMRunner interface
        result = await llmRunner.run({
            prompt: userPrompt,
            systemPrompt,
            taskId: "l1-extraction",
            timeoutMs: 180_000,
            ...traceParams,
        });
    }
    else {
        // NOTE: 原 fallback 为 OpenClaw 专用 CleanContextRunner（openclaw 插件壳，
        // 已随设计文档 §8.2 裁切）。DSH 适配层始终注入 host-neutral LLMRunner，
        // 此处不再提供 OpenClaw fallback，缺 runner 时明确报错。
        throw new Error(`${TAG} L1 extraction requires an LLMRunner — DSH host must inject one ` +
            `(OpenClaw CleanContextRunner fallback has been removed).`);
    }
    return parseExtractionResult(result, logger);
}
/**
 * Parse the LLM's JSON response into SceneSegment array.
 * Expected format: [{scene_name, message_ids, memories: [...]}]
 */
function parseExtractionResult(raw, logger) {
    try {
        // Strip markdown code block wrappers if present
        let cleaned = raw.trim();
        if (cleaned.startsWith("```")) {
            cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");
        }
        // Try to extract JSON array
        const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
        if (!arrayMatch) {
            logger?.warn?.(`${TAG} No JSON array found in extraction response`);
            // [l1-debug] NO_JSON — dump the full raw so we can see what the LLM actually said
            const rawPreview = raw.slice(0, 2048);
            logger?.warn?.(`${TAG} [l1-debug] NO_JSON taskId=l1-extraction, rawLen=${raw.length}, cleanedLen=${cleaned.length}, rawFull=${JSON.stringify(rawPreview)}${raw.length > 2048 ? `…(+${raw.length - 2048})` : ""}`);
            return [];
        }
        // Sanitize control characters inside JSON string literals that LLM may produce.
        // Some weaker OpenAI-compatible models occasionally emit bare identifiers for
        // numeric fields (e.g. `"priority": sheet`). Repair only known safe fields and
        // retry once so one bad scalar does not drop the whole extraction result.
        const sanitized = sanitizeJsonForParse(arrayMatch[0]);
        let parsed;
        try {
            parsed = JSON.parse(sanitized);
        }
        catch (err) {
            const repaired = repairExtractionJson(sanitized);
            if (repaired === sanitized)
                throw err;
            parsed = JSON.parse(repaired);
            logger?.warn?.(`${TAG} Repaired non-strict extraction JSON: ${err instanceof Error ? err.message : String(err)}`);
        }
        if (!Array.isArray(parsed)) {
            logger?.warn?.(`${TAG} Extraction response is not an array`);
            return [];
        }
        const scenes = [];
        for (const item of parsed) {
            if (!item || typeof item !== "object")
                continue;
            const s = item;
            scenes.push({
                scene_name: typeof s.scene_name === "string" ? s.scene_name : "未知情境",
                message_ids: Array.isArray(s.message_ids) ? s.message_ids.map(String) : [],
                memories: Array.isArray(s.memories)
                    ? s.memories
                        .filter((m) => m && typeof m === "object" && typeof m.content === "string" && m.content.length > 0)
                        .map((m) => ({
                        content: String(m.content),
                        type: String(m.type ?? "episodic"),
                        priority: typeof m.priority === "number" ? m.priority : 50,
                        source_message_ids: Array.isArray(m.source_message_ids) ? m.source_message_ids.map(String) : [],
                        metadata: (m.metadata && typeof m.metadata === "object" ? m.metadata : {}),
                    }))
                    : [],
            });
        }
        return scenes;
    }
    catch (err) {
        logger?.warn?.(`${TAG} Failed to parse extraction result: ${err instanceof Error ? err.message : String(err)}`);
        const rawPreview = raw.slice(0, 2048);
        logger?.warn?.(`${TAG} [l1-debug] PARSE_FAIL rawLen=${raw.length}, rawFull=${JSON.stringify(rawPreview)}${raw.length > 2048 ? `…(+${raw.length - 2048})` : ""}`);
        return [];
    }
}
function repairExtractionJson(json) {
    return json
        .replace(/("priority"\s*:\s*)(?!-?\d+(?:\.\d+)?\s*[,}]|"[^"\\]*(?:\\.[^"\\]*)*"\s*[,}])([\s\S]*?)(?=,\s*"(?:content|type|priority|source_message_ids|metadata)"\s*:|[}\]])/g, (_m, prefix) => `${prefix}50`)
        .replace(/,\s*([}\]])/g, "$1");
}
// ============================
// Write helpers
// ============================
/**
 * Apply batch dedup decisions — write memories according to their decisions.
 */
async function applyDecisions(params) {
    const { memoriesWithIds, decisions, baseDir, sessionKey, sessionId, taskId, teamId, userId, agentId, logger, vectorStore, embeddingService, storage } = params;
    const storedRecords = [];
    // Build a map from record_id → decision
    const decisionMap = new Map();
    for (const d of decisions) {
        decisionMap.set(d.record_id, d);
    }
    for (const memoryWithId of memoriesWithIds) {
        const decision = decisionMap.get(memoryWithId.record_id) ?? {
            record_id: memoryWithId.record_id,
            action: "store",
            target_ids: [],
        };
        try {
            const record = await writeMemory({
                memory: memoryWithId,
                decision,
                baseDir,
                sessionKey,
                sessionId,
                taskId,
                teamId,
                userId,
                agentId,
                logger,
                vectorStore,
                embeddingService,
                storage,
            });
            if (record) {
                storedRecords.push(record);
            }
        }
        catch (err) {
            logger?.warn?.(`${TAG} Write failed for memory "${memoryWithId.content.slice(0, 50)}...": ${err instanceof Error ? err.message : String(err)}`);
        }
    }
    return storedRecords;
}
/**
 * Store all memories directly (no dedup).
 */
async function storeAllDirectly(memoriesWithIds, baseDir, sessionKey, sessionId, taskId, teamId, userId, agentId, logger, vectorStore, embeddingService, storage) {
    const storedRecords = [];
    for (const memoryWithId of memoriesWithIds) {
        try {
            const record = await writeMemory({
                memory: memoryWithId,
                decision: {
                    record_id: memoryWithId.record_id,
                    action: "store",
                    target_ids: [],
                },
                baseDir,
                sessionKey,
                sessionId,
                taskId,
                teamId,
                userId,
                agentId,
                logger,
                vectorStore,
                embeddingService,
                storage,
            });
            if (record) {
                storedRecords.push(record);
            }
        }
        catch (err) {
            logger?.warn?.(`${TAG} Write failed for memory "${memoryWithId.content.slice(0, 50)}...": ${err instanceof Error ? err.message : String(err)}`);
        }
    }
    return storedRecords;
}
// ============================
// Helpers
// ============================
const VALID_TYPES = ["persona", "episodic", "instruction", "work_fact", "work_task", "work_method", "work_artifact"];
function normalizeType(raw) {
    const lower = raw.toLowerCase().trim();
    if (VALID_TYPES.includes(lower)) {
        return lower;
    }
    // Handle legacy type names
    if (lower === "episode")
        return "episodic";
    if (lower === "instruct")
        return "instruction";
    if (lower === "preference")
        return "persona"; // fold preference into persona
    return null;
}
