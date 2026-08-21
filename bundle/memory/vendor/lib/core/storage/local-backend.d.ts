/**
 * LocalStorageBackend — file-system based implementation of IStorageBackend.
 *
 * Used for local development and "free" mode where no COS is available.
 * Maps object keys to local file paths under a configurable root directory.
 */
import type { IStorageBackend, StorageObject, PutObjectOptions, ListObjectsOptions, ListResult, StorageLogger } from "./types.js";
export interface LocalStorageBackendOptions {
    /** Root directory for all stored files. */
    rootDir: string;
    /** Logger instance. */
    logger?: StorageLogger;
}
export declare class LocalStorageBackend implements IStorageBackend {
    readonly type: "local";
    private readonly rootDir;
    private readonly logger?;
    constructor(opts: LocalStorageBackendOptions | string);
    /**
     * Resolve a storage key to an absolute filesystem path under rootDir.
     *
     * CR-6 fix (2026-05-19): rejects path-traversal attempts. Without this guard
     * a key containing "../" or absolute paths could read/write arbitrary files
     * on disk (e.g. getObject("../../../etc/passwd") would resolve outside
     * rootDir). Affects standalone mode where user-controllable fields like
     * instanceId / sceneName / sessionKey end up in the key.
     *
     * Rejected:
     * - Empty key
     * - Keys containing NUL (\0) — POSIX/Linux path terminator, can confuse
     *   downstream tooling (sqlite, file managers).
     * - Keys with leading "/" or "\" (absolute paths).
     * - Keys whose resolved path falls outside rootDir (../ traversal).
     */
    private resolvePath;
    putObject(key: string, content: string | Buffer, opts?: PutObjectOptions): Promise<void>;
    /**
     * Append content to the end of a file. CR-1 fix (2026-05-19): uses POSIX
     * fs.appendFile (with O_APPEND flag) which is atomic per call on local fs,
     * so concurrent appendObject calls to the same key do not race.
     */
    appendObject(key: string, content: string | Buffer): Promise<void>;
    getObject(key: string): Promise<StorageObject | null>;
    exists(key: string): Promise<boolean>;
    listObjects(prefix: string, opts?: ListObjectsOptions): Promise<ListResult>;
    deleteObject(key: string): Promise<void>;
    deleteByPrefix(prefix: string): Promise<number>;
    private walkDir;
}
