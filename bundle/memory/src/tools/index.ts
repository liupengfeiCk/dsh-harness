/**
 * T10 工具回查与补召——共享限次预算的查记忆/查原对话工具组合行。
 *
 * 组合一个共享的 {@link MemoryToolBudget}（两工具每会话合计 ≤ 3 次），并把
 * `query_memory`（查记忆库）与 `query_conversation`（查原对话 + 补召细层）
 * 注册进 `ctx.tools`。作为 memory bundle 的一个 host 行挂载（cordis.patch.yml
 * id: `memory-tools`），插件体默认导出本 apply。
 *
 * @module dsh-harness-memory-bundle/tools
 */

import type { Context } from '@deepseek-ai/cordis'
import { MemoryToolBudget } from './budget.ts'
import * as memoryTool from './memory-tool.ts'
import * as conversationTool from './conversation-tool.ts'

export const name = 'dsh-harness-memory-bundle/tools'
export const inject = ['tools']

export { MemoryToolBudget, type BudgetConsumption } from './budget.ts'
export * as memoryTool from './memory-tool.ts'
export * as conversationTool from './conversation-tool.ts'

/** 组合行的配置：各工具的模型可见名称、共享限次上限、补召/存储选项。 */
export interface Config {
  /** 共享预算的每会话调用上限（默认 3）。 */
  limit?: number
  /** 查记忆工具名（默认 `query_memory`）。 */
  memoryToolName?: string
  /** 查原对话工具名（默认 `query_conversation`）。 */
  conversationToolName?: string
  /** 补召摘要存储基目录（默认 `~/.dsh/memory/summaries`）。 */
  storageBase?: string
  /** 覆盖补召实现（测试）。 */
  refine?: conversationTool.Config['refine']
}

/**
 * 组合插件体：共享一个预算，注册查记忆 + 查原对话（补召）两个工具。
 *
 * 直接调用两个子工具的 `apply`（而非 `ctx.plugin`）：每个子 apply 内部已自管
 * `ctx.on('dispose')` 清理，且避免 cordis 对 `{ apply }` 对象插件的识别差异。
 * @param ctx - 宿主插件上下文。
 * @param config - 校验后的组合配置。
 */
export function apply(ctx: Context, config: Config = {}): void {
  const budget = new MemoryToolBudget(config.limit)
  // 组合行同时加载两个工具；共享预算即"两工具每会话合计 ≤ limit 次"。
  memoryTool.apply(ctx, {
    ...config.memoryToolName === undefined ? {} : { toolName: config.memoryToolName },
    budget,
  })
  conversationTool.apply(ctx, {
    ...config.conversationToolName === undefined ? {} : { toolName: config.conversationToolName },
    budget,
    ...config.storageBase === undefined ? {} : { storageBase: config.storageBase },
    ...config.refine === undefined ? {} : { refine: config.refine },
  })
}

export default apply
