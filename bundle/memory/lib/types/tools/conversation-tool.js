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
import { getTraceable } from '@deepseek-ai/cordis';
import { defineTool } from '@deepseek-ai/dsh-tools';
export const name = 'dsh-harness-memory-bundle/tools/conversation-tool';
export const inject = ['tools'];
import { FileSummaryStorage, NoCoverageError } from "../compaction/index.js";
import { sessionRawStore } from "../injection/raw-store.js";
import { MemoryToolBudget } from "./budget.js";
/** 描述：声明两种模式职责边界 + 触发场景 + 调用上限。 */
function buildDescription(limit) {
    return '查询原对话记录，两种模式职责不同，别混用：'
        + '(1) search 模式（提供 query）：按关键词全文检索老会话的 L0 原文，'
        + '用于跨会话查"上次聊到哪/之前说的细节"——跨会话老对话细节只能走本检索，不走注入；'
        + '(2) refine 模式（提供 seq）：补回当前会话内覆盖 seq（该消息序号）的细层摘要'
        + '（粗→细→更细，最细优先）与 L0 原文——用于会话内粗化过头后把粒度补回来。'
        + '当用户提及历史/过去/之前（"我之前说过 / 上次 / 你还记不记得 / 我们聊过 / '
        + '之前那个 bug"）时，先查 L0 原文找具体消息再答。'
        + `调用限制：本工具与 query_memory 每会话合计最多 ${limit} 次；`
        + '检索无果或补回无覆盖时明确说明，不要凭空编造。';
}
/**
 * 从摘要存储读覆盖 `seq` 的细层摘要——补召层级链的"逐级补回细层"核心。
 * 语义与 T8 `CompactionEngine.retrieve` 一致：过滤覆盖 seq 的层，按层数降序
 * （最细优先）。导出以便补召集成测试直接验证"粗化后能补回细层"。
 */
export async function loadFineLayers(storage, sessionId, seq) {
    return (await storage.load(sessionId))
        .filter((layer) => layer.range[0] <= seq && seq <= layer.range[1])
        .sort((a, b) => b.level - a.level);
}
/**
 * 构造对当前会话做补召的默认实现：从存储读覆盖 `seq` 的细层摘要（最细优先），
 * L0 原文经会话事件投影的 rawStore 读。只读，不写任何数据。
 */
function defaultRefine(storageBase) {
    const storage = new FileSummaryStorage(storageBase);
    return async (session, seq) => {
        const layers = await loadFineLayers(storage, session.id, seq);
        const raw = await sessionRawStore(session).read([seq, seq]);
        return {
            layers,
            rawMessages: raw.map((m) => ({ seq: m.seq, text: m.text, role: m.role })),
        };
    };
}
/**
 * Cordis 插件体：注册 `query_conversation` 工具。作为 memory bundle 的一个
 * host 行挂载（cordis.patch.yml）。
 * @param ctx - 宿主插件上下文。
 * @param config - 校验后的插件配置。
 */
export function apply(ctx, config) {
    const toolName = config.toolName ?? 'query_conversation';
    const budget = config.budget ?? new MemoryToolBudget();
    const refine = config.refine ?? defaultRefine(config.storageBase);
    // 工具注册沿用既有 bundle 的 `ctx.tools.register`（如 tasks/tool）——cordis
    // 在插件作用域卸载时自动清理该作用域注册的工具，无需手动持有 disposer。
    ctx.tools.register(defineTool({
        name: toolName,
        description: buildDescription(budget.limit),
        parameters: {
            query: {
                type: 'string',
                description: '要检索的原文关键词（search 模式）。提供 seq 时忽略。',
            },
            sessionKey: {
                type: 'string',
                description: '限定检索到某会话（search 模式，可选）。',
            },
            seq: {
                type: 'number',
                description: '补召模式：当前会话中要补回细节的消息序号。提供时返回该处的细层摘要 + 原文。',
            },
            limit: {
                type: 'number',
                description: 'search 模式最多返回的条目数（默认 5）。',
            },
        },
        output: {
            schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    text: { type: 'string', required: true },
                    mode: { type: 'string', required: true },
                },
            },
            render: (_args, value) => [{ type: 'text', text: value.text }],
        },
        isConcurrencySafe: () => true,
        async execute(args, exec) {
            const sessionId = exec.agent?.session?.id ?? 'default';
            const consumed = budget.consume(sessionId, exec.agent);
            if (!consumed.allowed) {
                throw new Error(`已达记忆工具调用上限（${budget.limit} 次）。`
                    + '请在现有结果基础上作答；如仍缺信息，向用户说明并请其补充。');
            }
            const session = exec.agent?.session;
            if (args.seq !== undefined) {
                // 补召模式：需在真实会话内按 seq 逐级补回细层摘要 + L0 原文。
                if (session === undefined) {
                    throw new Error('query_conversation: 补召模式需要调用者会话（exec.agent.session 缺失）');
                }
                try {
                    const detail = await refine(session, args.seq);
                    // 不信任注入实现的返回顺序：按层数降序（最细优先）稳定排序。
                    const ordered = [...detail.layers].sort((a, b) => b.level - a.level);
                    const lines = [];
                    if (ordered.length > 0) {
                        lines.push(`覆盖 seq ${args.seq} 的摘要层（最细优先）：`);
                        for (const layer of ordered) {
                            lines.push(`  L${layer.level} [${layer.range[0]}-${layer.range[1]}]: ${layer.text}`);
                        }
                    }
                    else {
                        lines.push(`seq ${args.seq} 无覆盖的摘要层。`);
                    }
                    if (detail.rawMessages.length > 0) {
                        lines.push(`L0 原文：`);
                        for (const m of detail.rawMessages)
                            lines.push(`  [${m.seq} ${m.role}] ${m.text}`);
                    }
                    else {
                        lines.push('该处无 L0 原文。');
                    }
                    return { text: lines.join('\n'), mode: 'refine' };
                }
                catch (error) {
                    if (error instanceof NoCoverageError) {
                        throw new Error(`补召失败：seq ${args.seq} 在该会话无摘要层覆盖（${error.message}）`);
                    }
                    throw error;
                }
            }
            // search 模式：全文检索 L0 原文。
            const memory = getTraceable(ctx, ctx).get('memory');
            if (memory === undefined) {
                throw new Error('query_conversation: 记忆引擎未加载（加载 dsh-harness-memory-bundle 的 memory host 行）');
            }
            if (args.query === undefined || args.query.trim() === '') {
                throw new Error('query_conversation: search 模式需提供 query（或改用 seq 做补召）');
            }
            const result = await memory.searchConversations({
                query: args.query,
                ...args.limit === undefined ? {} : { limit: args.limit },
                ...args.sessionKey === undefined ? {} : { sessionKey: args.sessionKey },
            });
            return { text: result.text, mode: 'search' };
        },
    }));
}
//# sourceMappingURL=conversation-tool.js.map