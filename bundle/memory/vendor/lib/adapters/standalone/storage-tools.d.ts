/**
 * Storage-backed LLM tool definitions — drop-in replacement for the local-FS
 * sandboxed tools in `llm-runner.ts`.
 *
 * Used in service mode (COS) so that L2/L3 LLM agents read/write files via
 * StorageAdapter instead of the local filesystem.
 *
 * Tool names and schemas are **identical** to `createSandboxedTools`, so
 * LLM prompts work unchanged.
 */
import type { StorageAdapter } from "../../core/storage/adapter.js";
interface Logger {
    debug?: (message: string) => void;
    info?: (message: string) => void;
    warn: (message: string) => void;
    error: (message: string) => void;
}
/**
 * Create storage-backed read/write/edit tools.
 *
 * @param storage    - StorageAdapter instance (COS or local backend)
 * @param prefix     - Key prefix acting as sandbox root (e.g. "scene_blocks/")
 * @param logger     - Optional logger for diagnostics
 */
export declare function createStorageTools(storage: StorageAdapter, prefix: string, logger?: Logger): {
    read: import("ai").Tool<{
        path: string;
    }, unknown>;
    write: import("ai").Tool<{
        path: string;
        content: string;
    }, unknown>;
    edit: import("ai").Tool<{
        path: string;
        edits: Array<{
            oldText: string;
            newText: string;
        }>;
    }, unknown>;
};
/** Read-only subset for storage tools (mirrors createReadOnlyTools). */
export declare function createStorageReadOnlyTools(storage: StorageAdapter, prefix: string, logger?: Logger): {
    read: import("ai").Tool<{
        path: string;
    }, unknown>;
};
export {};
