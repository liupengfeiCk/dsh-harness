/**
 * 限次预算控制器——查记忆/查原对话工具共享的每会话调用配额。
 *
 * 参照 TencentDB MEMORY_TOOLS_GUIDE 的限次设计：`tdai_memory_search` +
 * `tdai_conversation_search` 每轮合计 ≤ 3 次。DSH 工具没有内置调用配额字段，
 * 故本控制器在宿主层提供一个按调用者会话 id 的同步计数，两个工具在 execute
 * 时先 `consume`，超限即拒绝（isError）；同一次配额也由
 * `ctx.tools.guard` 权威闸门二次拦截（guard 返回 reason 即拒绝整次调用）。
 *
 * 计数维度：会话（session）。设计 §3.3/§4.2 的"限 3 次"是主代理在需要深层
 * 细节时稀疏低频地主动回查，故按会话计费；会话结束即随上下文释放（本控制器
 * 持有的是弱引用 Map，条目在会话不再被引用后由 GC 回收）。
 *
 * @module dsh-harness-memory-bundle/tools/budget
 */
/** 一次消费的结果：允许继续调用，或已到上限。 */
export type BudgetConsumption = {
    readonly allowed: true;
    readonly remaining: number;
} | {
    readonly allowed: false;
    readonly remaining: 0;
};
/**
 * 按会话 id 计数的跨工具共享预算。计数器同步自增（JS 单线程，原子无竞态）。
 * 条目用 WeakRef 弱引用持有，避免会话结束后长期驻留内存。
 */
export declare class MemoryToolBudget {
    /** 每个会话的合计调用上限（默认 3，设计 §3.3/§4.2）。 */
    readonly limit: number;
    private readonly counts;
    constructor(limit?: number);
    /** 已消费（或借用）一次配额；`false` 表示已达上限。 */
    consume(sessionId: string, owner?: object): BudgetConsumption;
    /** 某会话剩余可调用次数（无记录则为上限）。 */
    remaining(sessionId: string): number;
    /** 显式释放某会话的计数（测试/会话结束调用）。 */
    reset(sessionId: string): void;
    /** 供单测断言：当前活跃（仍被引用）的会话数。 */
    get activeCount(): number;
}
//# sourceMappingURL=budget.d.ts.map