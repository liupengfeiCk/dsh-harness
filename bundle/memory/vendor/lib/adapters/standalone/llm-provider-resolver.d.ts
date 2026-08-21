/**
 * 内核侧的 LLM provider 解析器 —— 不依赖 gateway 层，从纯 config + env 计算
 * 最终 (baseUrl, apiKey)。
 *
 * gateway 侧另有一个 llm-resolver.ts 做启动期校验；两者共享同一套字段语义：
 *   - provider="openai"：透传
 *   - provider="proxy"：baseUrl = `${baseUrl}/proxy/<iid>/v1`，
 *                       apiKey  = env.TDAI_MEMORY_SYSTEM_USER_KEY（sk-mem-xxx）
 *
 * 之所以再写一份而不直接 import gateway/llm-resolver：core/ 层不应反向依赖
 * gateway/；且 gateway 侧关心的是 GatewayMetadataConfig，而 core 侧只能拿到
 * process.env（gateway 启动时用 applyMetadataEnvFromGatewayConfig 回填）。
 */
import type { StandaloneLLMConfig } from "./llm-runner.js";
export declare class LlmProviderResolveError extends Error {
    constructor(message: string);
}
/**
 * 给定 core 侧的 llm 配置 + 当前 instanceId，计算实际发起 LLM 请求时的
 * (baseUrl, apiKey)。
 *
 * 输入的 llm 段应带上 provider / proxy 字段（gateway loader 已经填充；
 * OpenClaw 内嵌场景等价于 provider="openai" 走透传路径）。
 */
export declare function resolveStandaloneLlmForRuntime(llm: StandaloneLLMConfig, instanceId: string | undefined): StandaloneLLMConfig;
