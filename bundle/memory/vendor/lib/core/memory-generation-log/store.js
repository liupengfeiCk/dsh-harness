import { createHash, randomUUID } from "node:crypto";
import { createScopedStorageAdapter } from "../storage/adapter.js";
const ROOT = "memory-generation-logs/v1";
const MAX_TS = 9_999_999_999_999;
const SAFE_ID = /^[A-Za-z0-9._-]{1,128}$/;
function safeId(value) {
    return SAFE_ID.test(value)
        ? value
        : `h_${createHash("sha256").update(value).digest("hex").slice(0, 24)}`;
}
function utcParts(timestampMs) {
    const iso = new Date(timestampMs).toISOString();
    return { date: iso.slice(0, 10), hour: iso.slice(11, 13) };
}
function reverseTimestamp(timestampMs) {
    return String(MAX_TS - timestampMs).padStart(13, "0");
}
export function buildGenerationLogIdentity(layer, finishedAtMs, anchorMemoryId, status = "succeeded") {
    const generationId = `mg_${randomUUID().replace(/-/g, "")}`;
    const anchor = safeId(anchorMemoryId ?? "none");
    const suffix = generationId.slice(3, 19);
    const logId = `mgl_${layer}_${status}_${finishedAtMs}_${anchor}_${suffix}`;
    const { date, hour } = utcParts(finishedAtMs);
    const key = `${ROOT}/layer=${layer}/date=${date}/hour=${hour}/${reverseTimestamp(finishedAtMs)}__mid=${anchor}__lid=${logId}.json`;
    if (Buffer.byteLength(key, "utf8") > 850)
        throw new Error("Generation log object key exceeds COS limit");
    return { generationId, logId, key };
}
export function buildPromptGenerationRef(resolved, layer) {
    if (!resolved) {
        return { memory_prompt_id: `builtin:${layer}`, version: 1, source: "system", prompt_sha256: "" };
    }
    return {
        memory_prompt_id: resolved.memory_prompt_id,
        version: resolved.version,
        source: resolved.source,
        prompt_sha256: createHash("sha256").update(resolved.prompt).digest("hex"),
    };
}
export function buildGenerationProvenance(identity, prompt) {
    return {
        generation_id: identity.generationId,
        generation_log_id: identity.logId,
        generation_log_key: identity.key,
        memory_prompt_id: prompt.memory_prompt_id,
        memory_prompt_version: prompt.version,
        memory_prompt_source: prompt.source,
    };
}
function parseListItem(key, size) {
    const match = key.match(/layer=(l1|l2|l3)\/date=\d{4}-\d{2}-\d{2}\/hour=\d{2}\/\d{13}__mid=([^/]+)__lid=(mgl_(?:l1|l2|l3)_(succeeded|failed)_(\d+)_.*)\.json$/);
    if (!match)
        return null;
    return {
        log_id: match[3],
        layer: match[1],
        status: match[4],
        anchor_memory_id: match[2] === "none" ? undefined : match[2],
        finished_at_ms: Number(match[5]),
        size,
        key,
    };
}
export class MemoryGenerationLogStore {
    instanceId;
    storage;
    constructor(storage, instanceId) {
        this.instanceId = instanceId;
        const safeInstance = safeId(instanceId);
        this.storage = storage.type === "local"
            ? createScopedStorageAdapter(storage, `instances/${safeInstance}`)
            : storage;
    }
    async write(log, key) {
        if (!key.startsWith(`${ROOT}/`) || key.includes("..") || key.startsWith("/")) {
            throw new Error("Invalid generation log key");
        }
        await this.storage.getBackend().putObject(key, JSON.stringify(log), {
            contentType: "application/json",
            metadata: {
                log_id: log.log_id,
                layer: log.layer,
                status: log.status,
                instance_id: this.instanceId,
            },
            tags: {
                "tdai-log-type": "memory-generation",
            },
        });
    }
    async getByKey(key) {
        if (!key.startsWith(`${ROOT}/`) || key.includes("..") || key.startsWith("/"))
            return null;
        const raw = await this.storage.readFile(key);
        if (!raw)
            return null;
        const parsed = JSON.parse(raw);
        return parsed.instance_id === this.instanceId ? parsed : null;
    }
    async getByLogId(logId) {
        const match = logId.match(/^mgl_(l1|l2|l3)_(succeeded|failed)_(\d+)_([A-Za-z0-9._-]+)_([a-f0-9]+)$/);
        if (!match)
            return null;
        const layer = match[1];
        const timestamp = Number(match[3]);
        const anchor = match[4];
        const { date, hour } = utcParts(timestamp);
        const key = `${ROOT}/layer=${layer}/date=${date}/hour=${hour}/${reverseTimestamp(timestamp)}__mid=${anchor}__lid=${logId}.json`;
        return this.getByKey(key);
    }
    async list(filter) {
        const layers = filter.layer ? [filter.layer] : ["l1", "l2", "l3"];
        const items = [];
        let boundary;
        if (filter.cursor) {
            const decoded = JSON.parse(Buffer.from(filter.cursor, "base64url").toString("utf8"));
            if (!Number.isFinite(decoded.beforeMs) || typeof decoded.afterLogId !== "string") {
                throw new Error("Invalid generation log cursor");
            }
            boundary = { beforeMs: Number(decoded.beforeMs), afterLogId: decoded.afterLogId };
        }
        let hourMs = Math.floor(filter.endTimeMs / 3_600_000) * 3_600_000;
        while (hourMs + 3_600_000 - 1 >= filter.startTimeMs && items.length <= filter.limit) {
            const { date, hour } = utcParts(hourMs);
            for (const layer of layers) {
                let marker;
                do {
                    const result = await this.storage.getBackend().listObjects(`${ROOT}/layer=${layer}/date=${date}/hour=${hour}/`, { maxKeys: 1000, marker, recursive: true });
                    for (const entry of result.entries) {
                        if (entry.isDirectory)
                            continue;
                        const parsed = parseListItem(entry.key, entry.size);
                        if (!parsed || parsed.finished_at_ms < filter.startTimeMs || parsed.finished_at_ms > filter.endTimeMs)
                            continue;
                        if (boundary && (parsed.finished_at_ms > boundary.beforeMs ||
                            (parsed.finished_at_ms === boundary.beforeMs && parsed.log_id <= boundary.afterLogId)))
                            continue;
                        if (filter.status && parsed.status !== filter.status)
                            continue;
                        items.push(parsed);
                    }
                    marker = result.nextMarker;
                } while (marker && items.length <= filter.limit);
            }
            hourMs -= 3_600_000;
        }
        items.sort((a, b) => b.finished_at_ms - a.finished_at_ms || a.log_id.localeCompare(b.log_id));
        const page = items.slice(0, filter.limit);
        const hasMore = items.length > filter.limit || hourMs + 3_600_000 - 1 >= filter.startTimeMs;
        const last = page.at(-1);
        return {
            items: page,
            ...(hasMore && last
                ? { next_cursor: Buffer.from(JSON.stringify({ beforeMs: last.finished_at_ms, afterLogId: last.log_id }), "utf8").toString("base64url") }
                : {}),
        };
    }
}
