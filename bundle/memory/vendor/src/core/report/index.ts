/**
 * Observability Module — Barrel Export (trimmed)
 *
 * 统一导出可观测性模块的公开类型与本地默认实现。
 *
 * NOTE（设计文档 §8.4 观测裁切）：
 * - 原云端/分布式观测（OTel、OTLP、Kafka、ClickHouse、Langfuse、trace 传播、
 *   metric-tracking 计费观测）均已裁切移除。
 * - 仅保留本地无外部依赖的实现：Noop（零开销默认）+ Console（调试输出）
 *   + FileLogger（本地日志文件）+ 业务上报 reporter。
 */

// ============================
// Types & Interfaces
// ============================
export type {
  ITraceBackend,
  ILogBackend,
  IMetricBackend,
  ILLMTraceBackend,
  ITraceMiddleware,
  ITracePropagation,
  IObservabilityBackend,
  ISpan,
  ISpanProcessor,
  TraceAttrs,
  LogAttrs,
  MetricMessage,
  MetricBackendConfig,
  ObservabilityLogger,
} from "./types.js";

// ============================
// Local Implementations
// ============================
export {
  NoopObservabilityBackend,
  NoopTraceBackend,
  NoopLogBackend,
  NoopMetricBackend,
  NoopLLMTraceBackend,
  NoopTraceMiddleware,
  NoopTracePropagation,
} from "./noop-backend.js";

export {
  ConsoleObservabilityBackend,
  ConsoleTraceBackend,
  ConsoleLogBackend,
  ConsoleMetricBackend,
  ConsoleLLMTraceBackend,
  ConsoleTraceMiddleware,
  ConsoleTracePropagation,
} from "./console-backend.js";

export { FileLogger } from "./file-logger.js";
export type { FileLoggerConfig } from "./file-logger.js";

// ============================
// Facade Modules (local)
// ============================
export { log } from "./log.js";

// ============================
// Business Reporting (local JSONL)
// ============================
export {
  initReporter,
  setReporter,
  resetReporter,
  report,
  getOrCreateInstanceId,
} from "./reporter.js";
export type { IReporter, ReportPayload } from "./reporter.js";
