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
import { Memory } from './memory/service.ts';
export { Tasks } from './tasks/index.ts';
export { TaskStore, taskDbPath } from './tasks/store.ts';
export type { StoredTask, StoredTaskSession, Task, TaskCreateInput, TaskListFilter, TaskRole, TaskSession, TaskSessionKind, TaskStatus, TaskUpdateInput, } from './tasks/types.ts';
export * from './compaction/index.ts';
export { StageLedger, planForStage, afterCompressionStage, INITIAL_STAGE, STAGE_ORDER, } from './injection/stage.ts';
export type { InjectionPlan, InjectionStage } from './injection/stage.ts';
export { assembleInjectionMessages, memorySource, MEMORY_PLUGIN } from './injection/inject.ts';
export { createCompressionCoordinator, routedSummarizer, type CompressionCoordinator, } from './injection/compaction.ts';
export { createPreStepHandler, type PreStepDeps } from './injection/pre-step.ts';
export { sessionRawStore, projectEvent, estimateTokens, textOfMessage, compactionRole } from './injection/raw-store.ts';
export { installInjection, type InstallInjectionOptions, type RecallProvider } from './injection/host.ts';
export { Memory } from './memory/service.ts';
export type { MemoryRuntimeConfig } from './memory/service.ts';
export { MemoryHostAdapter } from './adapters/host-adapter.ts';
export { DshLLMRunner, DshLLMRunnerFactory, createDefaultRouteResolver } from './adapters/llm-runner.ts';
export type { RouteResolver } from './adapters/llm-runner.ts';
export { buildMemoryTdaiConfig } from './adapters/config.ts';
export type { MemoryEngineConfig } from './adapters/config.ts';
export { dshHomePath } from './home-path.ts';
export { installTurnCapture, buildCompletedTurn, projectTurnMessages, projectTurnMessage, textOf, } from './ingestion/turn-capture.ts';
export type { CompletedTurnLike, TurnCommitter, TurnMessage } from './ingestion/turn-capture.ts';
export { deriveTurnAttribution, encodeSessionKey, } from './ingestion/attribution.ts';
export type { TurnAttribution } from './ingestion/attribution.ts';
declare module '@deepseek-ai/cordis' {
    interface Context {
        /** The memory engine service, composed by the memory bundle. */
        memory: Memory;
    }
}
export default Memory;
//# sourceMappingURL=index.d.ts.map