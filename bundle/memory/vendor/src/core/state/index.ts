/**
 * State Backend — 接口 + 默认实现导出 + 后端工厂。
 *
 * 默认实现 (LocalStateBackend) 跟接口同住 core，自带可用。
 * 远程状态后端在运行时按需动态加载；如果当前构建未包含对应实现，
 * 当配置要求使用远程后端时会抛出明确错误。
 */

export type {
  IStateBackend,
  PipelineSessionState,
  TimerEntry,
  TaskPayload,
  CaptureAtomicParams,
  CaptureAtomicResult,
} from "./types.js";
export { DEFAULT_PIPELINE_STATE } from "./types.js";

export { LocalStateBackend } from "./local-backend.js";

import type { IStateBackend, TimerEntry } from "./types.js";
import { LocalStateBackend } from "./local-backend.js";

export interface StateBackendConfig {
  type: "local";
  local?: {
    onTimerExpired?: (entry: TimerEntry) => void;
  };
}

/**
 * 工厂函数：根据配置创建对应的 State Backend。
 *
 * - type === "local": 内置 LocalStateBackend，零外部依赖。
 *   （原 Redis 分布式状态后端为云基础设施，已随多后端/分布式裁切移除；
 *     DSH 单机部署仅使用本地状态后端。）
 */
export async function createStateBackend(config: StateBackendConfig): Promise<IStateBackend> {
  // default: local
  const backend = new LocalStateBackend(config.local);
  await backend.initialize?.();
  return backend;
}
