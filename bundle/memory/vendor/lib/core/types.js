/**
 * TDAI Core — Host-neutral type definitions and abstract interfaces.
 *
 * These types define the boundary between TDAI Core (memory algorithms)
 * and the host environment (OpenClaw, Hermes, standalone Gateway, etc.).
 *
 * Design principles:
 * 1. TDAI Core depends ONLY on these interfaces — never on a specific host.
 * 2. Each host provides its own implementation of HostAdapter + LLMRunnerFactory.
 * 3. RuntimeContext is the single source of truth for session/user identity.
 */
/**
 * 把 TraceContext 展平进 LLMRunParams 的 langfuse 三字段。
 *   - traceName: 传业务锚点（如 "memory.l1-extract"）
 *   - userId:    langfuse 顶级 userId 列
 *   - sessionId: langfuse 顶级 sessionId 列
 *   - tags:      ["team:<id>", "agent:<id>"] 便于侧栏筛选
 * 三者结合后 langfuse UI 上一眼能定位某个 (user, agent, session) 的 trace 组。
 */
export function buildTraceParams(traceName, ctx) {
    const out = { traceName };
    if (ctx?.userId)
        out.userId = ctx.userId;
    if (ctx?.sessionId)
        out.sessionId = ctx.sessionId;
    const tags = [];
    if (ctx?.teamId)
        tags.push(`team:${ctx.teamId}`);
    if (ctx?.agentId)
        tags.push(`agent:${ctx.agentId}`);
    if (tags.length > 0)
        out.tags = tags;
    return out;
}
