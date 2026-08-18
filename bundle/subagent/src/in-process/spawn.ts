/**
 * The harness-owned in-process SPAWN subagent backend: registers a
 * {@link SubagentProvider} on `ctx.subagents` that runs each child as a fresh
 * child {@link Agent} on the same cordis context (its own session, own system
 * prompt, zero parent context), composed by OUR engine so the inheritance
 * switch and subagent model override apply. This replaces the official
 * `@deepseek-ai/dsh-subagent-spawn-in-process` in the shipped composition.
 * @module dsh-harness-subagent-bundle/in-process/spawn
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {
  ContinuableCreateSpec,
  ResolvedSubagentStartRequest,
  SubagentCapabilities,
  SubagentProvider,
} from '@deepseek-ai/dsh-subagent'
import type { HarnessResolvedSubagentStartRequest } from './request-types.ts'
import { startInProcessRun } from './engine.ts'

export const name = 'subagent-in-process-spawn'
// `tools` is deliberately not injected: the child factory already provides it during setup,
// and adding it here would unnecessarily change this provider's apply timing.
export const inject = ['subagents']

/** Config: the registry name to register the provider under. */
export interface Config {
  /** Provider name on `ctx.subagents` (default `spawn`). */
  providerName: string
}

export const Config: z<Config> = z.object({
  providerName: z.string().default('spawn'),
})

/**
 * The spawn provider. Supports every start-time capability: `depthLimit` (it
 * constructs the child, so it can enforce a recursion cap), `outputSchema`
 * (the scoped structured runtime), and `toolFilter`/`persona` (scoped
 * `restrict()` and a scoped shadowing persona section, applied in the child's
 * creation window).
 */
class SpawnInProcessProvider implements SubagentProvider {
  readonly capabilities: SubagentCapabilities = { outputSchema: true, depthLimit: true, toolFilter: true, persona: true }
  // Context contract: a spawned child starts fresh — it never sees the parent conversation.
  readonly inheritsParentContext = false

  constructor(readonly name: string) {}

  start(request: ResolvedSubagentStartRequest) {
    // Fresh child: no seed. Our engine mints ids, stamps cwd/lineage/depth,
    // composes the child with the inheritance switch, drives the one-shot
    // (including the structured capture), and maps the result. The runtime
    // request may carry the optional `subagent` id the engine reads.
    return startInProcessRun(request as HarnessResolvedSubagentStartRequest, {})
  }

  prepareContinuable(): Promise<ContinuableCreateSpec> {
    // A spawned child starts fresh, so it contributes no seed; the continuation
    // manager owns every later operation on it.
    return Promise.resolve({})
  }
}

export function apply(ctx: Context, config: Config): void {
  ctx.subagents.registerProvider(new SpawnInProcessProvider(config.providerName))
}
