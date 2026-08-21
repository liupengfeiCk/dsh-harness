/**
 * 主代理 `query_memory` 工具——查记忆库（L1 三维事实 + L2 场景全文 + L3 画像）。
 *
 * 设计 §7 F6 / §3.3：深层细节不注入上下文，而是给主代理两个工具（查记忆/
 * 查原对话）自行调用。当注入的记忆片段不足以回答用户时，主代理调用本工具
 * 检索记忆库资产（vendor `TdaiCore.searchMemories`，经 `Memory` 服务暴露）。
 *
 * 触发场景（参照 TencentDB MEMORY_TOOLS_GUIDE）：用户涉及自身身份/偏好/习惯、
 * 要求回忆历史事实、答案强依赖历史记录——先查再答，检索无果明确说明，
 * 不凭空编造。
 *
 * 限次：`query_memory` 与 `query_conversation` 每会话合计 ≤ 3 次（共享
 * {@link MemoryToolBudget}），description 中声明；execute 内 `consume` 超限
 * 即 isError，另由宿主 `ctx.tools.guard` 权威闸门二次拒绝。
 *
 * @module dsh-harness-memory-bundle/tools/memory-tool
 */

import type { Context } from '@deepseek-ai/cordis'
import { getTraceable } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { MemoryToolBudget } from './budget.ts'

export const name = 'dsh-harness-memory-bundle/tools/memory-tool'
export const inject = ['tools']

/** 工具需要的最小记忆服务面（由 `Memory` 服务满足）。 */
export interface MemorySearchLike {
  searchMemories(params: {
    query: string
    limit?: number
    type?: string
    scene?: string
  }): Promise<{ text: string; total: number; strategy: string }>
}

/** 插件配置：模型可见的工具名与限次来源。 */
export interface Config {
  /** Model-facing tool name (default `query_memory`). */
  toolName?: string
  /** 共享的限次预算。缺省时在 apply 内自建。 */
  budget?: MemoryToolBudget
}

/** 描述：声明触发场景 + 调用上限（参照 TencentDB MEMORY_TOOLS_GUIDE 措辞）。 */
function buildDescription(limit: number): string {
  return '查询长期记忆库（L1 原子事实/偏好/约束 + L2 场景 + L3 画像）。'
    + '当用户涉及自身身份/偏好/习惯、要求回忆历史事实、或答案强依赖历史记录'
    + '（"我之前说过 / 我的偏好 / 上次方案 / 我们的约定"）时，先查再答。'
    + `调用限制：本工具与 query_conversation 每会话合计最多 ${limit} 次；`
    + '检索无果时明确说明"未在记忆中找到"，不要凭空编造。'
}

/**
 * Cordis 插件体：注册 `query_memory` 工具。作为 memory bundle 的一个 host 行
 * 挂载（cordis.patch.yml）。
 * @param ctx - 宿主插件上下文。
 * @param config - 校验后的插件配置。
 */
export function apply(ctx: Context, config: Config): void {
  const toolName = config.toolName ?? 'query_memory'
  const budget = config.budget ?? new MemoryToolBudget()

  // 工具注册沿用既有 bundle 的 `ctx.tools.register`（如 tasks/tool）——cordis
  // 在插件作用域卸载时自动清理该作用域注册的工具，无需手动持有 disposer。
  ctx.tools.register(defineTool({
    name: toolName,
    description: buildDescription(budget.limit),
    parameters: {
      query: {
        type: 'string',
        required: true,
        description: '要检索的记忆关键词或自然语言描述（身份/偏好/历史事实）。',
      },
      limit: {
        type: 'number',
        description: '最多返回的条目数（默认 5）。',
      },
      type: {
        type: 'string',
        description: '按记忆类型过滤（人格/情景/指令）。',
      },
      scene: {
        type: 'string',
        description: '按场景过滤。',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          text: { type: 'string', required: true },
          total: { type: 'number', required: true },
          strategy: { type: 'string', required: true },
        },
      },
      render: (_args, value) => [{ type: 'text', text: value.text }],
    },
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      const sessionId = exec.agent?.session?.id ?? 'default'
      const consumed = budget.consume(sessionId, exec.agent)
      if (!consumed.allowed) {
        throw new Error(
          `已达记忆工具调用上限（${budget.limit} 次）。`
          + '请在现有结果基础上作答；如仍缺信息，向用户说明并请其补充。',
        )
      }
      const memory = (getTraceable(ctx, ctx) as Context).get('memory') as MemorySearchLike | undefined
      if (memory === undefined) {
        throw new Error('query_memory: 记忆引擎未加载（加载 dsh-harness-memory-bundle 的 memory host 行）')
      }
      const result = await memory.searchMemories({
        query: args.query,
        ...args.limit === undefined ? {} : { limit: args.limit },
        ...args.type === undefined ? {} : { type: args.type },
        ...args.scene === undefined ? {} : { scene: args.scene },
      })
      return { text: result.text, total: result.total, strategy: result.strategy }
    },
  }))
}
