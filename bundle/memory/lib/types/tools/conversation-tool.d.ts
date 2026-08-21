/**
 * 主代理 `query_conversation` 工具——查原对话 L0 原文 + 补召细层摘要。
 *
 * 设计 §7 F6 / §3.3 第二个工具：查原对话。§4.2 注入白名单：会话内分层摘要
 * 永不跨会话注入，跨会话需要老会话过程细节时一律走工具按需回查（连同摘要层
 * 与 L0 原文）。本工具提供两种模式：
 *
 *   1. **search（默认）**：按关键词全文检索 L0 原文（vendor
 *      `TdaiCore.searchConversations`），可按 `sessionKey` 限定到某会话——用于
 *      跨会话查老会话的原始消息。
 *   2. **refine（补召）**：给定当前会话的一条消息序号 `seq`，逐级补回该处
 *      覆盖 `seq` 的细层摘要（T8 `CompactionEngine.retrieve` 层级链：粗→细→
 *      更细，最细优先）与 L0 原文（`sessionRawStore.read`）。用于会话内粗化
 *      过头后需要更细粒度时，把细节从存储补回上下文。
 *
 * **职责边界**：refine 只补当前会话内"覆盖 seq 的细层摘要"；跨会话的老对话
 * 细节走 search（关键词检索 L0 原文）——两者别混。
 *
 * 触发场景（参照 TencentDB MEMORY_TOOLS_GUIDE）：用户提及历史/过去/之前
 * （"我之前说过 / 上次 / 你还记不记得 / 我们聊过"）→ search 查 L0 原文找
 * 具体消息。
 *
 * 限次：与 `query_memory` 每会话合计 ≤ 3 次（共享 {@link MemoryToolBudget}）。
 *
 * @module dsh-harness-memory-bundle/tools/conversation-tool
 */
import type { Context } from '@deepseek-ai/cordis';
import type { Session } from '@deepseek-ai/dsh-session';
export declare const name = "dsh-harness-memory-bundle/tools/conversation-tool";
export declare const inject: string[];
import type { LayerSummary } from '../compaction/types.ts';
import { MemoryToolBudget } from './budget.ts';
/** 工具需要的最小记忆服务面（由 `Memory` 服务满足）。 */
export interface ConversationSearchLike {
    searchConversations(params: {
        query: string;
        limit?: number;
        sessionKey?: string;
    }): Promise<{
        text: string;
        total: number;
    }>;
}
/** 补召链路：返回覆盖 `seq` 的细层摘要（最细优先）与 L0 原文。 */
export interface RefinedDetail {
    readonly layers: readonly LayerSummary[];
    readonly rawMessages: readonly {
        seq: number;
        text: string;
        role: string;
    }[];
}
/** 补召实现 seam（默认走真实 engine + sessionRawStore；测试可注入）。 */
export type RefineFn = (session: Session, seq: number) => Promise<RefinedDetail>;
/** 插件配置：模型可见工具名、限次来源、存储基目录、补召实现。 */
export interface Config {
    /** Model-facing tool name (default `query_conversation`). */
    toolName?: string;
    /** 共享的限次预算。缺省时在 apply 内自建。 */
    budget?: MemoryToolBudget;
    /** 摘要存储基目录（默认 `~/.dsh/memory/summaries`）。 */
    storageBase?: string;
    /** 覆盖默认补召实现（测试）。 */
    refine?: RefineFn;
}
/**
 * 从摘要存储读覆盖 `seq` 的细层摘要——补召层级链的"逐级补回细层"核心。
 * 语义与 T8 `CompactionEngine.retrieve` 一致：过滤覆盖 seq 的层，按层数降序
 * （最细优先）。导出以便补召集成测试直接验证"粗化后能补回细层"。
 */
export declare function loadFineLayers(storage: {
    load(sessionId: string): Promise<LayerSummary[]>;
}, sessionId: string, seq: number): Promise<LayerSummary[]>;
/**
 * Cordis 插件体：注册 `query_conversation` 工具。作为 memory bundle 的一个
 * host 行挂载（cordis.patch.yml）。
 * @param ctx - 宿主插件上下文。
 * @param config - 校验后的插件配置。
 */
export declare function apply(ctx: Context, config: Config): void;
//# sourceMappingURL=conversation-tool.d.ts.map