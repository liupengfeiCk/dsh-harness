/**
 * T9 unified injection — the four-stage memory-injection wiring that mounts
 * the T8 compaction engine and the memory recall into the agent loop.
 *
 * Exposes the pre-step handler, the stage ledger, the real raw store, and the
 * compression coordinator for the host entry (`src/index.ts`) and tests.
 *
 * @module dsh-harness-memory-bundle/injection
 */
export { StageLedger, planForStage, afterCompressionStage, INITIAL_STAGE, STAGE_ORDER } from './stage.ts';
export type { InjectionPlan, InjectionStage } from './stage.ts';
export { assembleInjectionMessages, memorySource, MEMORY_PLUGIN } from './inject.ts';
export { createCompressionCoordinator, routedSummarizer, type CompressionCoordinator, } from './compaction.ts';
export { createPreStepHandler, type PreStepDeps } from './pre-step.ts';
export { sessionRawStore, projectEvent, estimateTokens, textOfMessage, compactionRole } from './raw-store.ts';
//# sourceMappingURL=index.d.ts.map