/**
 * T9 unified injection — the four-stage memory-injection wiring that mounts
 * the T8 compaction engine and the memory recall into the agent loop.
 *
 * Exposes the pre-step handler, the stage ledger, the real raw store, and the
 * compression coordinator for the host entry (`src/index.ts`) and tests.
 *
 * @module dsh-harness-memory-bundle/injection
 */
export { StageLedger, planForStage, afterCompressionStage, INITIAL_STAGE, STAGE_ORDER } from "./stage.js";
export { assembleInjectionMessages, memorySource, MEMORY_PLUGIN } from "./inject.js";
export { createCompressionCoordinator, routedSummarizer, } from "./compaction.js";
export { createPreStepHandler } from "./pre-step.js";
export { createOverflowRescueHandler, DEFAULT_MAX_OVERFLOW_RETRIES, } from "./overflow.js";
export { sessionRawStore, projectEvent, estimateTokens, textOfMessage, compactionRole } from "./raw-store.js";
//# sourceMappingURL=index.js.map