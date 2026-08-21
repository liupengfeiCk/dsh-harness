/**
 * Storage — barrel re-export for the storage abstraction layer.
 *
 * This file is the open-source / standalone surface of the storage layer.
 * It only re-exports the interface, the local backend, and the generic
 * credential primitives.
 *
 * Optional remote object storage support is loaded dynamically by the storage
 * factory at runtime.
 */
export type { IStorageBackend, ICredentialProvider, StorageBackendConfig, StorageObject, PutObjectOptions, ListObjectsOptions, ListResult, ListEntry, CosCredential, StorageLogger, } from "./types.js";
export { StoragePaths } from "./types.js";
export { LocalStorageBackend } from "./local-backend.js";
export type { LocalStorageBackendOptions } from "./local-backend.js";
export { StorageAdapter } from "./adapter.js";
export { createStorageBackend, createLocalStorageBackend, } from "./factory.js";
