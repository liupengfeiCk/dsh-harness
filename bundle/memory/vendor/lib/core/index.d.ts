/**
 * TDAI Core — barrel re-export for core types and service facade.
 *
 * This module exports ONLY the host-neutral interfaces and the TdaiCore facade.
 * Host-specific adapters live in `../adapters/`.
 */
export type { Logger, RuntimeContext, LLMRunParams, LLMRunner, LLMRunnerCreateOptions, LLMRunnerFactory, HostAdapter, CompletedTurn, RecallResult, CaptureResult, MemorySearchParams, ConversationSearchParams, } from "./types.js";
export { TdaiCore } from "./tdai-core.js";
export type { TdaiCoreOptions } from "./tdai-core.js";
export { LocalStorageBackend, StoragePaths, StorageAdapter, createStorageBackend, createLocalStorageBackend, } from "./storage/index.js";
export type { IStorageBackend, StorageBackendConfig, StorageObject, PutObjectOptions, ListObjectsOptions, ListResult, ListEntry, StorageLogger, } from "./storage/index.js";
