/**
 * dsh-harness-memory-bundle — the Harness-owned memory subsystem as a profile
 * bundle. Pure host package: the bundle's substance is `cordis.patch.yml`
 * (declared by the `dsh.bundle.patch` manifest field and resolved by the profile
 * composer through that field). This host entry aggregates the bundle's public
 * surface:
 *
 *   - `tasks` — the task-entity registry (design §7 F10): `Tasks` host service
 *     plus its `/memory-task` wire and `create_task` tool (mounted as separate
 *     host rows via subpath exports).
 *   - `compaction` — the session-internal hierarchical compaction subsystem
 *     (T8), a pure data model + engine imported by T9/T10.
 *   - `memory` — (T3) the TencentDB memory engine adaptation (vendor MemoryCore)
 *     as the `memory` host service, constructed with the bundle's HostAdapter +
 *     LLMRunner.
 *
 * Note: the `tasks`/`memory-task-wire`/`memory-task-tool` patch rows mount their
 * modules via subpath exports (`./tasks`, `./tasks/wire`, `./tasks/tool`), so
 * this entry carries no default plugin body in the T2 skeleton. The `memory`
 * engine row (T3) will mount `name: 'dsh-harness-memory-bundle'` and add the
 * engine's host wiring here.
 * @module dsh-harness-memory-bundle
 */

import { Memory } from './memory/service.ts'

// Task-entity registry (design §7 F10). `Tasks` is the cordis service default
// exported from `./tasks`, mounted by the `tasks` patch row.
export { Tasks } from './tasks/index.ts'
export { TaskStore, taskDbPath } from './tasks/store.ts'
export type {
  StoredTask, StoredTaskSession, Task, TaskCreateInput, TaskListFilter,
  TaskRole, TaskSession, TaskSessionKind, TaskStatus, TaskUpdateInput,
} from './tasks/types.ts'

// Session-internal hierarchical compaction subsystem (T8) — public surface.
// The subsystem's own barrel (`./compaction/index.ts`) is the single public
// face; re-export it wholesale so host consumers get the engine, the layer
// planner, the summarizer, the storage, and the tagging helpers.
export * from './compaction/index.ts'

// T9 unified injection — the four-stage memory-injection wiring that mounts the
// compaction engine and the memory recall into the agent loop. Exported for
// the host entry and for programmatic composition (e.g. tests, or a profile
// that builds the injection handler directly).
export {
  StageLedger,
  planForStage,
  afterCompressionStage,
  INITIAL_STAGE,
  STAGE_ORDER,
} from './injection/stage.ts'
export type { InjectionPlan, InjectionStage } from './injection/stage.ts'
export { assembleInjectionMessages, memorySource, MEMORY_PLUGIN } from './injection/inject.ts'
export {
  createCompressionCoordinator,
  routedSummarizer,
  type CompressionCoordinator,
} from './injection/compaction.ts'
export { createPreStepHandler, type PreStepDeps } from './injection/pre-step.ts'
export { sessionRawStore, projectEvent, estimateTokens, textOfMessage, compactionRole } from './injection/raw-store.ts'
export { installInjection, type InstallInjectionOptions, type RecallProvider } from './injection/host.ts'

// T10 工具回查与补召——组合行（cordis.patch.yml id: `memory-tools`）的插件体
// 与共享限次预算控制器。
export { default as memoryTools, MemoryToolBudget } from './tools/index.ts'
export type { Config as MemoryToolsConfig } from './tools/index.ts'

// T12 子对话继承——主对话分层摘要作为公共记忆注入子会话（继承/非继承双模式）。
export {
  installInheritance,
  assemblePublicSection,
  INHERITED_MAIN_ORDER,
  INHERITED_MAIN_SECTION,
  PublicSectionCache,
} from './inheritance/index.ts'
export type { InheritanceDeps } from './inheritance/index.ts'

// Memory engine host service (T4): assembles the vendor TdaiCore behind the
// bundle's host adapter. Default export is the `memory` patch row's plugin body
// (cordis.patch.yml `name: 'dsh-harness-memory-bundle'`).
export { Memory } from './memory/service.ts'
export type { MemoryRuntimeConfig } from './memory/service.ts'
export { MemoryHostAdapter } from './adapters/host-adapter.ts'
export { DshLLMRunner, DshLLMRunnerFactory, createDefaultRouteResolver } from './adapters/llm-runner.ts'
export type { RouteResolver } from './adapters/llm-runner.ts'
export { buildMemoryTdaiConfig } from './adapters/config.ts'
export type { MemoryEngineConfig } from './adapters/config.ts'
export { dshHomePath } from './home-path.ts'
// T5 turn-capture wiring + identity attribution — public surface for tests and
// programmatic composition.
export {
  installTurnCapture,
  buildCompletedTurn,
  projectTurnMessages,
  projectTurnMessage,
  textOf,
} from './ingestion/turn-capture.ts'
export type { CompletedTurnLike, TurnCommitter, TurnMessage } from './ingestion/turn-capture.ts'
export {
  deriveTurnAttribution,
  encodeSessionKey,
} from './ingestion/attribution.ts'
export type { TurnAttribution } from './ingestion/attribution.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** The memory engine service, composed by the memory bundle. */
    memory: Memory
  }
}

export default Memory
