/**
 * Console Observability Backend — 控制台输出实现。
 *
 * 将所有可观测性数据输出到 stdout/stderr，用于开发调试。
 * 所有方法都是安全的（不抛异常、不阻塞业务）。
 */
import type http from "node:http";
import type { ITraceBackend, ILogBackend, IMetricBackend, ILLMTraceBackend, ITraceMiddleware, ITracePropagation, IObservabilityBackend, ISpan, ISpanProcessor, TraceAttrs, LogAttrs, MetricMessage, MetricBackendConfig, ObservabilityConfig } from "./types.js";
export declare class ConsoleTraceBackend implements ITraceBackend {
    readonly type = "console";
    report(event: string, attrs?: TraceAttrs): void;
    start(spanName: string, _kind?: number): ISpan;
    startServer(spanName: string): ISpan;
    startClient(spanName: string): ISpan;
}
export declare class ConsoleLogBackend implements ILogBackend {
    readonly type = "console";
    info(eventName: string, attrs?: LogAttrs): void;
    warn(eventName: string, attrs?: LogAttrs): void;
    error(eventName: string, attrs?: LogAttrs, error?: Error): void;
    debug(eventName: string, attrs?: LogAttrs): void;
}
export declare class ConsoleMetricBackend implements IMetricBackend {
    readonly type = "console";
    send(msg: MetricMessage): void;
    initialize(_config: MetricBackendConfig): Promise<void>;
    destroy(): Promise<void>;
}
export declare class ConsoleLLMTraceBackend implements ILLMTraceBackend {
    readonly type = "console";
    createSpanProcessor(): ISpanProcessor | null;
    flush(): Promise<void>;
    shutdown(): Promise<void>;
}
export declare class ConsoleTraceMiddleware implements ITraceMiddleware {
    readonly type = "console";
    wrapWithTrace(req: http.IncomingMessage, res: http.ServerResponse, handler: () => Promise<void>): Promise<void>;
    startChildSpan(name: string, attrs?: Record<string, string | number | boolean>): ISpan;
    withSpan<T>(name: string, attrs: Record<string, string | number | boolean>, fn: (span: ISpan) => Promise<T>): Promise<T>;
}
export declare class ConsoleTracePropagation implements ITracePropagation {
    serializeTraceContext(): Record<string, string | number>;
    deserializeTraceContext(_data?: Record<string, unknown>): {
        parentContext: unknown;
        parentSpanContext: {
            traceId: string;
            spanId: string;
            traceFlags: number;
            isRemote: boolean;
        } | null;
    };
}
/**
 * Console 可观测性后端 — 所有数据输出到 stdout/stderr。
 * 用于开发调试环境。
 */
export declare class ConsoleObservabilityBackend implements IObservabilityBackend {
    readonly type = "console";
    readonly trace: ITraceBackend;
    readonly log: ILogBackend;
    readonly metric: IMetricBackend;
    readonly llmTrace: ILLMTraceBackend;
    readonly traceMiddleware: ITraceMiddleware;
    readonly tracePropagation: ITracePropagation;
    initialize(_config: ObservabilityConfig): Promise<void>;
    shutdown(): Promise<void>;
}
