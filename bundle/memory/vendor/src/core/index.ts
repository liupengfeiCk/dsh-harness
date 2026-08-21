/**
 * TDAI Core — barrel re-export for core types and service facade.
 *
 * This module exports ONLY the host-neutral interfaces and the TdaiCore facade.
 * Host-specific adapters live in `../adapters/`.
 */

// Types & interfaces
export type {
  Logger,
  RuntimeContext,
  LLMRunParams,
  LLMRunner,
  LLMRunnerCreateOptions,
  LLMRunnerFactory,
  HostAdapter,
  CompletedTurn,
  RecallResult,
  CaptureResult,
  MemorySearchParams,
  ConversationSearchParams,
} from "./types.js";

// TdaiCore service facade
export { TdaiCore } from "./tdai-core.js";
export type { TdaiCoreOptions } from "./tdai-core.js";

// Storage backend (unified file/object abstraction).
// Remote object storage (COS) backends and credential providers have been
// trimmed (cloud infra) — only local file storage remains.
export {
  LocalStorageBackend,
  StoragePaths,
  StorageAdapter,
  createStorageBackend,
  createLocalStorageBackend,
} from "./storage/index.js";
export type {
  IStorageBackend,
  StorageBackendConfig,
  StorageObject,
  PutObjectOptions,
  ListObjectsOptions,
  ListResult,
  ListEntry,
  StorageLogger,
} from "./storage/index.js";
