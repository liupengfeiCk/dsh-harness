import { randomUUID } from "node:crypto";
import { StoragePaths } from "../storage/types.js";
export const REPORT_CONST = {
    PLUGIN: "plugin",
};
// ── Singleton ──
let _reporter;
export function initReporter(opts) {
    if (_reporter)
        return;
    if (!opts.enabled)
        return;
    switch (opts.type) {
        case "local":
            _reporter = new LocalReporter(opts.logger, opts.instanceId, opts.pluginVersion);
            break;
        // TODO: add new reporter type
        default:
            opts.logger.debug?.(`[memory-tdai] Unknown reporter type "${opts.type}", disabled reporting`);
            break;
    }
}
export function setReporter(reporter) {
    _reporter = reporter;
}
/**
 * Reset the reporter singleton so that the next `initReporter` call takes effect.
 * Must be called at plugin re-registration (hot-reload) to pick up config changes.
 */
export function resetReporter() {
    _reporter = undefined;
}
export function report(event, data) {
    if (!_reporter)
        return;
    try {
        _reporter.reportFunc(REPORT_CONST.PLUGIN, { event, ...data });
    }
    catch { /* never block business logic */ }
}
// ── LocalReporter (default) ──
class LocalReporter {
    logger;
    instanceId;
    pluginVersion;
    constructor(logger, instanceId, pluginVersion) {
        this.logger = logger;
        this.instanceId = instanceId;
        this.pluginVersion = pluginVersion;
    }
    reportFunc(category, payload) {
        try {
            this.logger.info(JSON.stringify({
                tag: "METRIC",
                category,
                plugin: "memory-tdai",
                instanceId: this.instanceId,
                pluginVersion: this.pluginVersion,
                ts: new Date().toISOString(),
                ...payload,
            }));
        }
        catch { /* swallow */ }
    }
}
// ── Instance ID (persisted per-install) ──
let _instanceIdCache;
export async function getOrCreateInstanceId(pluginDataDir, storage) {
    if (_instanceIdCache)
        return _instanceIdCache;
    try {
        let existing;
        if (storage) {
            existing = await storage.readFile(StoragePaths.instanceId);
        }
        else {
            const fs = await import("node:fs/promises");
            const path = await import("node:path");
            existing = await fs.default.readFile(path.default.join(pluginDataDir, ".metadata", "instance_id"), "utf-8");
        }
        if (existing?.trim()) {
            _instanceIdCache = existing.trim();
            return _instanceIdCache;
        }
    }
    catch { /* file doesn't exist */ }
    const newId = randomUUID();
    if (storage) {
        await storage.writeFile(StoragePaths.instanceId, newId);
    }
    else {
        const fs = await import("node:fs/promises");
        const path = await import("node:path");
        const idFile = path.default.join(pluginDataDir, ".metadata", "instance_id");
        await fs.default.mkdir(path.default.dirname(idFile), { recursive: true });
        await fs.default.writeFile(idFile, newId, "utf-8");
    }
    _instanceIdCache = newId;
    return newId;
}
