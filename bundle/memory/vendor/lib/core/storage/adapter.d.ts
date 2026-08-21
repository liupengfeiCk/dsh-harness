/**
 * StorageAdapter — adapts IStorageBackend to a fs-like interface
 * for compatibility with upper-layer code.
 *
 * Progressive migration strategy:
 *   Existing L2/L3/Recall code uses `fs.readFile(path.join(dataDir, ...))`.
 *   StorageAdapter provides equivalent method signatures, internally delegating
 *   to IStorageBackend, so existing code only needs to swap the import.
 *
 * Eventually, callers may inline IStorageBackend calls directly and
 * this adapter can be removed.
 */
import type { IStorageBackend, ListEntry, ListObjectsOptions, ListResult } from "./types.js";
export declare function createScopedStorageAdapter(base: StorageAdapter, prefix: string): StorageAdapter;
export declare class StorageAdapter {
    private backend;
    constructor(backend: IStorageBackend);
    get type(): "local" | "cos";
    readFile(key: string): Promise<string | null>;
    readFileOrThrow(key: string): Promise<string>;
    readFileBuffer(key: string): Promise<Buffer | null>;
    writeFile(key: string, content: string | Buffer): Promise<void>;
    /**
     * Append to a storage object atomically.
     *
     * CR-1 fix (2026-05-19): previously implemented as read-modify-write
     * (readFile + concat + putObject), which lost data under concurrency
     * (audit/exp1 reproduced 99% loss at 100 parallel writes). Now delegates
     * to backend.appendObject which uses:
     *   - LocalStorageBackend: POSIX fs.appendFile (O_APPEND atomic)
     *   - CosStorageBackend: COS Append Object API (server-side atomic + 409 retry)
     */
    appendFile(key: string, content: string): Promise<void>;
    readdir(prefix: string, suffix?: string): Promise<ListEntry[]>;
    /**
     * Read one page without changing the legacy all-at-once `readdir` contract.
     * Pass the returned `nextMarker` into the next call to continue listing.
     */
    readdirPage(prefix: string, opts?: ListObjectsOptions & {
        suffix?: string;
    }): Promise<ListResult>;
    readdirNames(prefix: string, suffix?: string): Promise<string[]>;
    unlink(key: string): Promise<void>;
    rmdir(prefix: string): Promise<void>;
    mkdir(_prefix: string): Promise<void>;
    exists(key: string): Promise<boolean>;
    stat(key: string): Promise<{
        key: string;
        size: number;
        lastModified: number;
        createdAt: number;
    } | null>;
    rename(sourceKey: string, destKey: string): Promise<void>;
    copyFile(sourceKey: string, destKey: string): Promise<void>;
    /**
     * Recursively copy all objects under `srcPrefix` to `dstPrefix`.
     *
     * 路径映射：每个 src 下的 object key `${srcPrefix}/path/to/x` 都会被复制到
     * `${dstPrefix}/path/to/x`。`prefix` 之间的相对路径保持不变。
     *
     * 行为：
     *   - srcPrefix 下没有任何对象 → throw `STORAGE_NOT_FOUND: <srcPrefix>`
     *   - dstPrefix 已存在 ≥1 个对象 → 默认 throw `DESTINATION_EXISTS: <dstPrefix>`
     *   - 传入 `{ overwrite: true }` 时允许覆盖（dst 端可能存在残留也照写）
     *
     * 在 Phase 5 之后被 skill-versioning 使用：每次 owner 改动触发新版本时，
     * 把上一版本目录拷贝到新版本目录，再应用本次资源变更（write/remove）。
     */
    copyTree(srcPrefix: string, dstPrefix: string, opts?: {
        overwrite?: boolean;
    }): Promise<void>;
    getBackend(): IStorageBackend;
}
