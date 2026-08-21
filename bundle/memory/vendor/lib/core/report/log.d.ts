/**
 * Log 结构化日志门面 — Debug/Info/Warn/Error
 *
 * 使用方式：
 *
 *   import { log } from "./core/report/log.js";
 *
 *   log.info("recall completed", { count: 10, latencyMs: 42 });
 *   log.error("embedding failed", { provider: "zhipu", error: err.message });
 *
 * 底层通过 ILogBackend 发送结构化日志（内部环境：OTel Logs API → 智研 + ClickHouse）。
 * 自动关联当前 Trace 上下文（如果在 Span 内打日志，Log 自动带 TraceID/SpanID）。
 * 同时写入本地日志文件（通过 FileLogger）。
 * 如果后端未初始化，fallback 到 文件 + console。
 *
 * 公开 API 签名保持不变，调用方无需修改。
 */
export declare const log: {
    debug(message: string, data?: Record<string, unknown>): void;
    info(message: string, data?: Record<string, unknown>): void;
    warn(message: string, data?: Record<string, unknown>): void;
    error(message: string, data?: Record<string, unknown>): void;
};
