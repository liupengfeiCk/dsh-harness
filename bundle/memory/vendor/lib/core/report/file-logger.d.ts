/**
 * file-logger.ts — 本地日志文件写入器
 *
 * 将日志双写到本地文件，支持：
 * - 文件轮转（rotate）
 * - 备份数量限制
 * - 目录自动创建
 * - 错误静默处理（不影响主业务流程）
 *
 * 使用同步文件写入（appendFileSync），避免 WriteStream 导致进程无法退出。
 * 日志写入量小且不频繁，同步开销可忽略。
 */
export interface FileLoggerConfig {
    /** 日志文件目录，如 /data/log/。为空时禁用文件写入。 */
    path: string;
    /** 日志文件名，如 core.log */
    filename: string;
    /** 单文件最大字节数，超出后轮转 */
    rotateSizeBytes: number;
    /** 保留的备份文件数量 */
    rotateBackupLimit: number;
}
/**
 * FileLogger 本地日志文件写入器。
 * 实现日志双写到本地文件，支持 rotate。
 */
export declare class FileLogger {
    private cfg;
    private currentSize;
    private disabled;
    private filePath;
    constructor(cfg: FileLoggerConfig);
    /**
     * write 写入一条日志。
     * 格式：[时间][级别] 消息 {json数据}\n
     */
    write(level: string, message: string, data?: Record<string, unknown>): void;
    /**
     * flush 刷新缓冲区到磁盘（同步写入模式下为 no-op，保留接口兼容）。
     */
    flush(): Promise<void>;
    /**
     * close 关闭（同步写入模式下为 no-op，保留接口兼容）。
     */
    close(): void;
    private formatLine;
    private writeLine;
    private initFile;
    private rotate;
    private cleanOldBackups;
}
