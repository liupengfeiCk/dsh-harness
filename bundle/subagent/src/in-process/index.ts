/**
 * Harness-owned in-process subagent delegation.
 *
 * This package replaces the official `dsh-tool-subagent`,
 * `dsh-subagent-spawn-in-process`, `dsh-subagent-fork-in-process`, and
 * `dsh-subagent-in-process-driver` in the shipped composition, so the official
 * packages stay untouched upstream. It ships the model-facing delegation tool
 * (`./tool`), the spawn/fork providers (`./spawn`, `./fork`), and the shared
 * engine (`./engine`) that composes children with the harness inheritance
 * switch and subagent model override.
 * @module dsh-harness-subagent-bundle/in-process
 */

export { startInProcessRun, setupChildComposition } from './engine.ts'
export type { InProcessRunOptions } from './engine.ts'
export { STRUCTURED_OUTPUT_TOOL, STRUCTURED_OUTPUT_INSTRUCTION } from './engine.ts'
