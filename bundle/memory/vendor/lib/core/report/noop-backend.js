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
// ============================
// Noop Span
// ============================
/** 空操作 Span — 所有方法为 no-op */
const noopSpan = {
    end() { },
    setAttribute() { return this; },
    setAttributes() { return this; },
    setStatus() { return this; },
    recordException() { },
    spanContext() { return { traceId: "", spanId: "", traceFlags: 0 }; },
    isRecording() { return false; },
    updateName() { return this; },
    addEvent() { return this; },
};
// ============================
// Noop SpanProcessor
// ============================
/** 空操作 SpanProcessor */
const noopSpanProcessor = {
    onStart() { },
    onEnd() { },
    async forceFlush() { },
    async shutdown() { },
};
// ============================
// NoopTraceBackend
// ============================
export class NoopTraceBackend {
    type = "noop";
    report(_event, _attrs) {
        // no-op
    }
    start(_spanName, _kind) {
        return noopSpan;
    }
    startServer(_spanName) {
        return noopSpan;
    }
    startClient(_spanName) {
        return noopSpan;
    }
}
// ============================
// NoopLogBackend
// ============================
export class NoopLogBackend {
    type = "noop";
    info(_eventName, _attrs) {
        // no-op
    }
    warn(_eventName, _attrs) {
        // no-op
    }
    error(_eventName, _attrs, _error) {
        // no-op
    }
    debug(_eventName, _attrs) {
        // no-op
    }
}
// ============================
// NoopMetricBackend
// ============================
export class NoopMetricBackend {
    type = "noop";
    send(_msg) {
        // no-op
    }
    async initialize(_config) {
        // no-op
    }
    async destroy() {
        // no-op
    }
}
// ============================
// NoopLLMTraceBackend
// ============================
export class NoopLLMTraceBackend {
    type = "noop";
    createSpanProcessor() {
        return noopSpanProcessor;
    }
    async flush() {
        // no-op
    }
    async shutdown() {
        // no-op
    }
}
// ============================
// NoopTraceMiddleware
// ============================
export class NoopTraceMiddleware {
    type = "noop";
    async wrapWithTrace(_req, _res, handler) {
        // 直接透传到原始 handler
        return handler();
    }
    startChildSpan(_name, _attrs) {
        return noopSpan;
    }
    async withSpan(_name, _attrs, fn) {
        return fn(noopSpan);
    }
}
// ============================
// NoopTracePropagation
// ============================
export class NoopTracePropagation {
    serializeTraceContext() {
        return {};
    }
    deserializeTraceContext(_data) {
        return { parentContext: {}, parentSpanContext: null };
    }
}
// ============================
// NoopObservabilityBackend — 聚合
// ============================
/**
 * 空操作可观测性后端 — 所有子后端均为 no-op。
 * 开源环境下的默认实现。
 */
export class NoopObservabilityBackend {
    type = "noop";
    trace = new NoopTraceBackend();
    log = new NoopLogBackend();
    metric = new NoopMetricBackend();
    llmTrace = new NoopLLMTraceBackend();
    traceMiddleware = new NoopTraceMiddleware();
    tracePropagation = new NoopTracePropagation();
    async initialize(_config) {
        // no-op
    }
    async shutdown() {
        // no-op
    }
}
