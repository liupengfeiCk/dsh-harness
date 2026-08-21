/**
 * Noop Observability Backend — 空操作实现。
 *
 * 所有方法为空操作，不产生任何副作用。
 * 用于开源环境下未配置任何可观测性后端时的默认实现。
 *
 * 设计原则：
 * - 所有方法不抛异常
 * - 不产生任何 I/O 或副作用
 * - 零性能开销
 */
import type http from "node:http";
import type { ITraceBackend, ILogBackend, IMetricBackend, ILLMTraceBackend, ITraceMiddleware, ITracePropagation, IObservabilityBackend, ISpan, ISpanProcessor, TraceAttrs, LogAttrs, MetricMessage, MetricBackendConfig, ObservabilityConfig } from "./types.js";
export declare class NoopTraceBackend implements ITraceBackend {
    readonly type = "noop";
    report(_event: string, _attrs?: TraceAttrs): void;
    start(_spanName: string, _kind?: number): ISpan;
    startServer(_spanName: string): ISpan;
    startClient(_spanName: string): ISpan;
}
export declare class NoopLogBackend implements ILogBackend {
    readonly type = "noop";
    info(_eventName: string, _attrs?: LogAttrs): void;
    warn(_eventName: string, _attrs?: LogAttrs): void;
    error(_eventName: string, _attrs?: LogAttrs, _error?: Error): void;
    debug(_eventName: string, _attrs?: LogAttrs): void;
}
export declare class NoopMetricBackend implements IMetricBackend {
    readonly type = "noop";
    send(_msg: MetricMessage): void;
    initialize(_config: MetricBackendConfig): Promise<void>;
    destroy(): Promise<void>;
}
export declare class NoopLLMTraceBackend implements ILLMTraceBackend {
    readonly type = "noop";
    createSpanProcessor(): ISpanProcessor | null;
    flush(): Promise<void>;
    shutdown(): Promise<void>;
}
export declare class NoopTraceMiddleware implements ITraceMiddleware {
    readonly type = "noop";
    wrapWithTrace(_req: http.IncomingMessage, _res: http.ServerResponse, handler: () => Promise<void>): Promise<void>;
    startChildSpan(_name: string, _attrs?: Record<string, string | number | boolean>): ISpan;
    withSpan<T>(_name: string, _attrs: Record<string, string | number | boolean>, fn: (span: ISpan) => Promise<T>): Promise<T>;
}
export declare class NoopTracePropagation implements ITracePropagation {
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
 * 空操作可观测性后端 — 所有子后端均为 no-op。
 * 开源环境下的默认实现。
 */
export declare class NoopObservabilityBackend implements IObservabilityBackend {
    readonly type = "noop";
    readonly trace: ITraceBackend;
    readonly log: ILogBackend;
    readonly metric: IMetricBackend;
    readonly llmTrace: ILLMTraceBackend;
    readonly traceMiddleware: ITraceMiddleware;
    readonly tracePropagation: ITracePropagation;
    initialize(_config: ObservabilityConfig): Promise<void>;
    shutdown(): Promise<void>;
}
