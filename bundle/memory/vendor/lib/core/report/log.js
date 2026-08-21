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
import { FileLogger } from "./file-logger.js";
// 初始化文件写入器（降级策略：初始化失败不影响业务）
const fileLogger = new FileLogger({
    path: process.env.LOG_PATH || "/data/log/",
    filename: "core.log",
    rotateSizeBytes: 100 * 1024 * 1024, // 100MB
    rotateBackupLimit: 10,
});
/**
 * 发送一条结构化日志。
 *
 * NOTE: 原通过 OTel Logs API / 观测后端（factory.ts）上报的路径已随
 * 云基础设施观测裁切移除（设计文档 §8.4）。此处仅保留本地文件 + console
 * 输出，语义不变（调用方无需修改）。
 */
function emit(level, message, data) {
    try {
        // 本地 console 输出（观测后端裁切后改为本地直出）
        if (level === "DEBUG") {
            // debug 级别不默认输出到 console，避免噪音；仍写文件
        }
        else if (level === "ERROR") {
            console.error(`[memory-tdai][log] ${message}`, data ?? "");
        }
        else {
            console.log(`[memory-tdai][log] ${message}`, data ?? "");
        }
        // 写入本地日志文件（无论后端是否可用）
        fileLogger.write(level, message, data);
    }
    catch {
        // 不阻塞业务
    }
}
export const log = {
    debug(message, data) {
        emit("DEBUG", message, data);
    },
    info(message, data) {
        emit("INFO", message, data);
    },
    warn(message, data) {
        emit("WARN", message, data);
    },
    error(message, data) {
        emit("ERROR", message, data);
    },
};
