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
import type { Context } from '@deepseek-ai/cordis';
import { MemoryToolBudget } from './budget.ts';
export declare const name = "dsh-harness-memory-bundle/tools/memory-tool";
export declare const inject: string[];
/** 工具需要的最小记忆服务面（由 `Memory` 服务满足）。 */
export interface MemorySearchLike {
    searchMemories(params: {
        query: string;
        limit?: number;
        type?: string;
        scene?: string;
    }): Promise<{
        text: string;
        total: number;
        strategy: string;
    }>;
}
/** 插件配置：模型可见的工具名与限次来源。 */
export interface Config {
    /** Model-facing tool name (default `query_memory`). */
    toolName?: string;
    /** 共享的限次预算。缺省时在 apply 内自建。 */
    budget?: MemoryToolBudget;
}
/**
 * Cordis 插件体：注册 `query_memory` 工具。作为 memory bundle 的一个 host 行
 * 挂载（cordis.patch.yml）。
 * @param ctx - 宿主插件上下文。
 * @param config - 校验后的插件配置。
 */
export declare function apply(ctx: Context, config: Config): void;
//# sourceMappingURL=memory-tool.d.ts.map