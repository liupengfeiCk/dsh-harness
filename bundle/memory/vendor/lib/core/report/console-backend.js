/**
 * Console Observability Backend — 控制台输出实现。
 *
 * 将所有可观测性数据输出到 stdout/stderr，用于开发调试。
 * 所有方法都是安全的（不抛异常、不阻塞业务）。
 */
const TAG = "[observability][console]";
// ============================
// Console Span
// ============================
/** Console Span — 输出 Span 生命周期到 stdout */
class ConsoleSpan {
    name;
    attrs = {};
    startTime = Date.now();
    constructor(name, attrs) {
        this.name = name;
        if (attrs)
            this.attrs = { ...attrs };
    }
    end() {
        const durationMs = Date.now() - this.startTime;
        console.log(`${TAG}[trace] SPAN_END name=${this.name} duration=${durationMs}ms attrs=${JSON.stringify(this.attrs)}`);
    }
    setAttribute(key, value) {
        this.attrs[key] = value;
        return this;
    }
    setAttributes(attrs) {
        Object.assign(this.attrs, attrs);
        return this;
    }
    setStatus(_status) {
        return this;
    }
    recordException(exception) {
        const msg = exception instanceof Error ? exception.message : exception;
        console.error(`${TAG}[trace] EXCEPTION span=${this.name} error=${msg}`);
    }
    spanContext() {
        return { traceId: "console-trace-id", spanId: "console-span-id", traceFlags: 1 };
    }
    isRecording() {
        return true;
    }
    updateName(name) {
        this.name = name;
        return this;
    }
    addEvent(name, attrs) {
        console.log(`${TAG}[trace] EVENT span=${this.name} event=${name} attrs=${JSON.stringify(attrs ?? {})}`);
        return this;
    }
}
// ============================
// ConsoleTraceBackend
// ============================
export class ConsoleTraceBackend {
    type = "console";
    report(event, attrs = {}) {
        try {
            const filtered = {};
            for (const [k, v] of Object.entries(attrs)) {
                if (v !== null && v !== undefined)
                    filtered[k] = v;
            }
            console.log(`${TAG}[trace] REPORT event=tdai.${event} attrs=${JSON.stringify(filtered)}`);
        }
        catch {
            // 静默
        }
    }
    start(spanName, _kind) {
        console.log(`${TAG}[trace] SPAN_START name=${spanName}`);
        return new ConsoleSpan(spanName);
    }
    startServer(spanName) {
        console.log(`${TAG}[trace] SPAN_START name=${spanName} kind=SERVER`);
        return new ConsoleSpan(spanName);
    }
    startClient(spanName) {
        console.log(`${TAG}[trace] SPAN_START name=${spanName} kind=CLIENT`);
        return new ConsoleSpan(spanName);
    }
}
// ============================
// ConsoleLogBackend
// ============================
export class ConsoleLogBackend {
    type = "console";
    info(eventName, attrs = {}) {
        console.info(`${TAG}[log][INFO] ${eventName}`, attrs);
    }
    warn(eventName, attrs = {}) {
        console.warn(`${TAG}[log][WARN] ${eventName}`, attrs);
    }
    error(eventName, attrs = {}, error) {
        if (error) {
            console.error(`${TAG}[log][ERROR] ${eventName}`, { ...attrs, "error.message": error.message, "error.type": error.name });
        }
        else {
            console.error(`${TAG}[log][ERROR] ${eventName}`, attrs);
        }
    }
    debug(eventName, attrs = {}) {
        console.debug(`${TAG}[log][DEBUG] ${eventName}`, attrs);
    }
}
// ============================
// ConsoleMetricBackend
// ============================
export class ConsoleMetricBackend {
    type = "console";
    send(msg) {
        console.log(`${TAG}[metric] SEND metric=${msg.metric} instance=${msg.instanceId} value=${msg.value}`);
    }
    async initialize(_config) {
        console.log(`${TAG}[metric] Initialized (console mode)`);
    }
    async destroy() {
        console.log(`${TAG}[metric] Destroyed (console mode)`);
    }
}
// ============================
// ConsoleLLMTraceBackend
// ============================
export class ConsoleLLMTraceBackend {
    type = "console";
    createSpanProcessor() {
        // 返回一个简单的 console processor
        return {
            onStart(_span) {
                // no-op on start
            },
            onEnd(span) {
                try {
                    const s = span;
                    console.log(`${TAG}[llm-trace] SPAN_END name=${s.name ?? "unknown"}`);
                }
                catch {
                    // 静默
                }
            },
            async forceFlush() { },
            async shutdown() { },
        };
    }
    async flush() {
        console.log(`${TAG}[llm-trace] Flushed (console mode)`);
    }
    async shutdown() {
        console.log(`${TAG}[llm-trace] Shutdown (console mode)`);
    }
}
// ============================
// ConsoleTraceMiddleware
// ============================
export class ConsoleTraceMiddleware {
    type = "console";
    async wrapWithTrace(req, res, handler) {
        const method = req.method ?? "GET";
        const url = req.url ?? "/";
        const startTime = Date.now();
        console.log(`${TAG}[middleware] REQUEST_START ${method} ${url}`);
        try {
            await handler();
            const durationMs = Date.now() - startTime;
            console.log(`${TAG}[middleware] REQUEST_END ${method} ${url} status=${res.statusCode} duration=${durationMs}ms`);
        }
        catch (err) {
            const durationMs = Date.now() - startTime;
            const errMsg = err instanceof Error ? err.message : String(err);
            console.error(`${TAG}[middleware] REQUEST_ERROR ${method} ${url} error=${errMsg} duration=${durationMs}ms`);
            throw err;
        }
    }
    startChildSpan(name, attrs) {
        console.log(`${TAG}[middleware] CHILD_SPAN name=${name}`);
        return new ConsoleSpan(name, attrs);
    }
    async withSpan(name, attrs, fn) {
        const span = new ConsoleSpan(name, attrs);
        console.log(`${TAG}[middleware] WITH_SPAN name=${name}`);
        try {
            const result = await fn(span);
            span.end();
            return result;
        }
        catch (err) {
            span.recordException(err instanceof Error ? err : new Error(String(err)));
            span.end();
            throw err;
        }
    }
}
// ============================
// ConsoleTracePropagation
// ============================
export class ConsoleTracePropagation {
    serializeTraceContext() {
        return { _traceId: "console-trace-id", _spanId: "console-span-id", _traceFlags: 1 };
    }
    deserializeTraceContext(_data) {
        return { parentContext: {}, parentSpanContext: null };
    }
}
// ============================
// ConsoleObservabilityBackend — 聚合
// ============================
/**
 * Console 可观测性后端 — 所有数据输出到 stdout/stderr。
 * 用于开发调试环境。
 */
export class ConsoleObservabilityBackend {
    type = "console";
    trace = new ConsoleTraceBackend();
    log = new ConsoleLogBackend();
    metric = new ConsoleMetricBackend();
    llmTrace = new ConsoleLLMTraceBackend();
    traceMiddleware = new ConsoleTraceMiddleware();
    tracePropagation = new ConsoleTracePropagation();
    async initialize(_config) {
        console.log(`${TAG} ConsoleObservabilityBackend initialized`);
    }
    async shutdown() {
        console.log(`${TAG} ConsoleObservabilityBackend shutdown`);
    }
}
