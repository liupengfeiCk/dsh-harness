/**
 * Observability Abstraction Layer — Core Types & Interfaces.
 *
 * This module defines the observability contracts for Trace, Log, Metric,
 * LLM Trace, and HTTP Trace Middleware.
 *
 * Design principles:
 * 1. **Backend-agnostic**: Upper layers (trace.ts, obs-logger.ts, etc.) depend
 *    only on these interfaces — never on OTel SDK, Kafka, or Langfuse directly.
 * 2. **Async-first**: All lifecycle methods return Promises; hot-path methods
 *    (report, send) are synchronous for zero-overhead.
 * 3. **Extensible**: Interface is minimal for v1; implementations can add
 *    backend-specific features without changing the contract.
 * 4. **Safe by default**: All implementations must be error-silent — never
 *    throw exceptions that could affect business logic.
 *
 * Relationship to IStorageBackend (src/core/storage/types.ts):
 *   - IStorageBackend = file storage abstraction (L2/L3 files → COS/local-fs)
 *   - IObservabilityBackend = observability abstraction (Trace/Log/Metric → OTel/Kafka/Langfuse)
 *   Both follow the same pattern: interface + factory + dynamic import for private impl.
 */
export {};
