/**
 * TDAI Core — barrel re-export for core types and service facade.
 *
 * This module exports ONLY the host-neutral interfaces and the TdaiCore facade.
 * Host-specific adapters live in `../adapters/`.
 */
// TdaiCore service facade
export { TdaiCore } from "./tdai-core.js";
// Storage backend (unified file/object abstraction).
// Remote object storage (COS) backends and credential providers have been
// trimmed (cloud infra) — only local file storage remains.
export { LocalStorageBackend, StoragePaths, StorageAdapter, createStorageBackend, createLocalStorageBackend, } from "./storage/index.js";
