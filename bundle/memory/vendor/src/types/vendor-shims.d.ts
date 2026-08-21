/**
 * Vendor Ambient Type Shims
 *
 * 为以下"可选/原生 peer"依赖提供类型占位，保证 vendor 独立 tsc 编译通过。
 * 这些模块在 DSH 运行环境中并非必需（按设计文档"向量默认关"等策略），
 * 运行时若未安装，走各模块既有的动态 import + try/catch 降级路径，
 * 编译期由本 shim 提供类型解析，避免 TS2307。
 *
 * 已裁剪的云基础设施依赖（ioredis 等）不应在此声明——相关代码已从 vendor 移除。
 */

/** node-llama-cpp — OpenClaw 的可选 peer，用于本地向量嵌入（设计文档：向量默认关）。 */
declare module "node-llama-cpp" {
  export const LlamaLogLevel: { error: number; info: number; warn: number; debug: number };
  export function getLlama(opts?: { logLevel?: number }): Promise<unknown>;
  export function resolveModelFile(model: string, cacheDir?: string): Promise<string>;
  const _default: unknown;
  export default _default;
}
