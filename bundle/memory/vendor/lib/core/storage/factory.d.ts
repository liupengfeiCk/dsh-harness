/**
 * Storage Backend Factory — creates the appropriate IStorageBackend
 * based on configuration.
 *
 * The default `local` backend is bundled with core. The optional `cos` backend
 * is loaded dynamically; when unavailable, the factory throws a clear error
 * directing the operator to either provide the backend or switch to `type=local`.
 */
import type { IStorageBackend, StorageBackendConfig, StorageLogger } from "./types.js";
/**
 * Create a storage backend instance based on configuration.
 *
 * Async because the optional COS backend is dynamically imported only when needed.
 *
 * @param config Backend configuration (type + backend-specific options)
 * @param logger Optional logger
 * @returns IStorageBackend instance
 */
export declare function createStorageBackend(config: StorageBackendConfig, logger?: StorageLogger): Promise<IStorageBackend>;
/**
 * Create a local storage backend for development.
 * Convenience helper for quick local setup.
 */
export declare function createLocalStorageBackend(rootDir: string, logger?: StorageLogger): IStorageBackend;
