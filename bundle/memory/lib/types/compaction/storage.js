/**
 * Per-layer summary persistence to `~/.dsh/memory/summaries/{sessionId}/`.
 *
 * Each summary layer is written as its own file (level + covered range in the
 * name) so a resumed session can reuse it directly and the refine (recall)
 * chain can pull back a finer layer by range. Writes are atomic (write-then-
 * rename) so a crash never leaves a half-written layer. Recovery tolerates a
 * missing/corrupt layer by skipping it and keeping the rest.
 *
 * Uses only `node:fs`/`node:path`/`node:os` — self-contained, matching the
 * bundle's home-path convention (the hot-mount environment may not carry
 * `@deepseek-ai/dsh-home-paths`).
 *
 * @module dsh-harness-memory-bundle/compaction/storage
 */
import { homedir } from 'node:os';
import { join } from 'node:path';
import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { LayerRecoveryError } from "./types.js";
/** Root under which all session summaries live. */
export const SUMMARIES_ROOT = '.dsh/memory/summaries';
/** Resolve the absolute summaries directory for one session id. */
export function summariesRoot(base) {
    return join(base ?? homedir(), SUMMARIES_ROOT);
}
/**
 * Sanitize a session id into a safe directory name, rejecting path escapes.
 * @throws when the id could traverse the filesystem (path injection).
 */
export function sanitizeSessionId(sessionId) {
    if (sessionId.length === 0) {
        throw new LayerRecoveryError('summary storage: empty session id');
    }
    if (sessionId.includes('/') || sessionId.includes('\\') || sessionId.includes('..') || sessionId === '.' || sessionId === '..') {
        throw new LayerRecoveryError(`summary storage: session id "${sessionId}" is not a safe directory name`);
    }
    return sessionId;
}
/** Filename for one summary layer, embedding level and covered seq range. */
export function layerFileName(layer) {
    return `l${layer.level}.${layer.range[0]}-${layer.range[1]}.json`;
}
/** Validate a parsed stored layer before it is trusted as a `LayerSummary`. */
function parseStoredLayer(raw) {
    if (typeof raw !== 'object' || raw === null)
        return undefined;
    const layer = raw;
    if (typeof layer.level !== 'number'
        || !Array.isArray(layer.range) || layer.range.length !== 2
        || typeof layer.range[0] !== 'number' || typeof layer.range[1] !== 'number'
        || typeof layer.text !== 'string'
        || typeof layer.tokens !== 'number'
        || typeof layer.generatedAt !== 'string')
        return undefined;
    return {
        level: layer.level,
        range: [layer.range[0], layer.range[1]],
        text: layer.text,
        tokens: layer.tokens,
        generatedAt: layer.generatedAt,
        ...(typeof layer.model === 'string' ? { model: layer.model } : {}),
        nonDistillable: layer.nonDistillable === true,
    };
}
/**
 * Filesystem-backed summary storage under a configurable base directory
 * (defaults to the user home, i.e. `~/.dsh/memory/summaries`).
 */
export class FileSummaryStorage {
    base;
    constructor(base) {
        this.base = base;
    }
    async save(sessionId, layer) {
        const dir = join(summariesRoot(this.base), sanitizeSessionId(sessionId));
        await mkdir(dir, { recursive: true });
        const payload = {
            level: layer.level,
            range: [layer.range[0], layer.range[1]],
            text: layer.text,
            tokens: layer.tokens,
            generatedAt: layer.generatedAt,
            ...(layer.model === undefined ? {} : { model: layer.model }),
            nonDistillable: layer.nonDistillable,
        };
        const file = join(dir, layerFileName(layer));
        const temp = `${file}.${process.pid}.tmp`;
        await writeFile(temp, JSON.stringify(payload), 'utf8');
        await rename(temp, file);
    }
    async load(sessionId) {
        const dir = join(summariesRoot(this.base), sanitizeSessionId(sessionId));
        let names;
        try {
            names = await readdir(dir);
        }
        catch {
            // No directory yet → no layers.
            return [];
        }
        const layers = [];
        for (const name of names) {
            if (!name.endsWith('.json') || name.endsWith('.tmp'))
                continue;
            try {
                const raw = JSON.parse(await readFile(join(dir, name), 'utf8'));
                const layer = parseStoredLayer(raw);
                if (layer !== undefined)
                    layers.push(layer);
            }
            catch {
                // Skip corrupt/unreadable layer files; do not fail the whole recovery.
                continue;
            }
        }
        return layers.sort((a, b) => a.level - b.level);
    }
    async clear(sessionId) {
        const dir = join(summariesRoot(this.base), sanitizeSessionId(sessionId));
        await rm(dir, { recursive: true, force: true });
    }
}
//# sourceMappingURL=storage.js.map