/**
 * T10 工具回查与补召——共享限次预算的查记忆/查原对话工具组合行。
 *
 * 组合一个共享的 {@link MemoryToolBudget}（两工具每会话合计 ≤ 3 次），并把
 * `query_memory`（查记忆库）与 `query_conversation`（查原对话 + 补召细层）
 * 注册进 `ctx.tools`。作为 memory bundle 的一个 host 行挂载（cordis.patch.yml
 * id: `memory-tools`）。
 *
 * ⚠️ 本模块**必须命名导出 `inject` 且不得 `export default apply`**：cordis
 * Loader 的 `unwrapExports` 优先取 `default ?? exports`，若 default 存在则
 * 只返回 apply 函数、丢失命名导出的 `inject`，导致 cordis 不注入 `tools`
 * （报 "cannot get property tools without inject"）。与 `tasks/tool` 一致，
 * 用命名导出 apply + inject，使 Loader 拿到含 `inject` 的模块命名空间。
 *
 * @module dsh-harness-memory-bundle/tools
 */
import type { Context } from '@deepseek-ai/cordis';
import * as conversationTool from './conversation-tool.ts';
export declare const name = "dsh-harness-memory-bundle/tools";
export declare const inject: string[];
export { MemoryToolBudget, type BudgetConsumption } from './budget.ts';
export * as memoryTool from './memory-tool.ts';
export * as conversationTool from './conversation-tool.ts';
/** 组合行的配置：各工具的模型可见名称、共享限次上限、补召/存储选项。 */
export interface Config {
    /** 共享预算的每会话调用上限（默认 3）。 */
    limit?: number;
    /** 查记忆工具名（默认 `query_memory`）。 */
    memoryToolName?: string;
    /** 查原对话工具名（默认 `query_conversation`）。 */
    conversationToolName?: string;
    /** 补召摘要存储基目录（默认 `~/.dsh/memory/summaries`）。 */
    storageBase?: string;
    /** 覆盖补召实现（测试）。 */
    refine?: conversationTool.Config['refine'];
}
/**
 * 组合插件体：共享一个预算，注册查记忆 + 查原对话（补召）两个工具。
 *
 * 直接调用两个子工具的 `apply`（而非 `ctx.plugin`）：每个子 apply 内部已自管
 * `ctx.on('dispose')` 清理，且避免 cordis 对 `{ apply }` 对象插件的识别差异。
 * @param ctx - 宿主插件上下文。
 * @param config - 校验后的组合配置。
 */
export declare function apply(ctx: Context, config?: Config): void;
//# sourceMappingURL=index.d.ts.map