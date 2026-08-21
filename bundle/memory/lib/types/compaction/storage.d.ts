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
import type { LayerSummary, SummaryStorage } from './types.ts';
/** Root under which all session summaries live. */
export declare const SUMMARIES_ROOT = ".dsh/memory/summaries";
/** Resolve the absolute summaries directory for one session id. */
export declare function summariesRoot(base?: string): string;
/**
 * Sanitize a session id into a safe directory name, rejecting path escapes.
 * @throws when the id could traverse the filesystem (path injection).
 */
export declare function sanitizeSessionId(sessionId: string): string;
/** Filename for one summary layer, embedding level and covered seq range. */
export declare function layerFileName(layer: Pick<LayerSummary, 'level' | 'range'>): string;
/**
 * Filesystem-backed summary storage under a configurable base directory
 * (defaults to the user home, i.e. `~/.dsh/memory/summaries`).
 */
export declare class FileSummaryStorage implements SummaryStorage {
    private readonly base?;
    constructor(base?: string | undefined);
    save(sessionId: string, layer: LayerSummary): Promise<void>;
    load(sessionId: string): Promise<LayerSummary[]>;
    clear(sessionId: string): Promise<void>;
}
//# sourceMappingURL=storage.d.ts.map