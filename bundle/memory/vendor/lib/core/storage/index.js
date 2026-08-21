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
export { StoragePaths } from "./types.js";
// Default implementation (always available)
export { LocalStorageBackend } from "./local-backend.js";
export { StorageAdapter } from "./adapter.js";
// NOTE: COS 凭据提供方（credential-provider.ts）已随云基础设施裁切移除。
// 本地部署不需要云端对象存储凭据。
// Factory (dynamically loads optional COS backend when requested)
export { createStorageBackend, createLocalStorageBackend, } from "./factory.js";
