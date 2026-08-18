/**
 * The harness-owned in-process FORK subagent backend: registers a
 * {@link SubagentProvider} on `ctx.subagents` that runs each child as a child
 * {@link Agent} SEEDED with the parent's CONVERSATION SURFACE — so the child
 * inherits the parent's conversation context instead of starting fresh — and
 * composes it through OUR engine (inheritance switch + subagent model override).
 * This replaces the official `@deepseek-ai/dsh-subagent-fork-in-process` in the
 * shipped composition.
 *
 * UPSTREAM-SYNC NOTE: the official `subagent-fork-in-process` seeds the child
 * with a PREFIX OF THE PARENT'S RAW SESSION LOG (everything up to the last
 * `turn/end`). We DELIBERATELY DIVERGE and seed from the parent's LIVE SURFACE
 * (`Session.deriveMessages`) instead, re-materialized as a fresh append-only
 * event sequence. Reason: compaction REPLACES the surface (a summary shadows
 * the old history) while the append-only log never shrinks — a raw-log prefix
 * therefore hands a forked child the FULL pre-compaction history, diverging
 * from the main agent, which at that moment reasons over the summary + its new
 * progress. Seeding from the surface makes the fork inherit exactly the context
 * the parent currently sees, before and after compaction alike.
 * @module dsh-harness-subagent-bundle/in-process/fork
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { foldSurface, isSurfaceEvent } from '@deepseek-ai/dsh-session'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type {
  ContinuableCreateRequest,
  ContinuableCreateSpec,
  ResolvedSubagentStartRequest,
  SubagentCapabilities,
  SubagentProvider,
} from '@deepseek-ai/dsh-subagent'
import type { HarnessResolvedSubagentStartRequest } from './request-types.ts'
import { startInProcessRun } from './engine.ts'

export const name = 'subagent-in-process-fork'
// `tools` is deliberately NOT injected — same rationale as the spawn backend:
// the per-run structured runtime gates its capture-tool registration on
// `tools` itself, so this backend's apply timing is unchanged by structured output.
export const inject = ['subagents']

/** Config: the registry name to register the provider under. */
export interface Config {
  /** Provider name on `ctx.subagents` (default `fork`). */
  providerName: string
}

export const Config: z<Config> = z.object({
  providerName: z.string().default('fork'),
})

/**
 * The parent's CONVERSATION SURFACE re-materialized as a fork seed: every
 * surface node (the messages `parent.session.deriveMessages()` derives) that
 * belongs to a completed turn, re-emitted as a fresh append-only event sequence
 * from seq 0. This is the harness's deliberate deviation from the official
 * raw-log prefix (see the module header): the child inherits what the parent
 * CURRENTLY reasons over — including a compaction summary — instead of the
 * full append-only history.
 *
 * Trimming rule (pinned by the fork's delegate-time observation): a fork is
 * requested while the parent's DELEGATING turn is in flight, so the current
 * turn's `user/message` and `assistant/message` sit AFTER that turn's
 * `turn/start` and must be excluded — the child inherits only the parent's
 * COMPLETED context. When the last turn boundary is a `turn/end` (parent idle,
 * no in-flight turn) the whole surface is inherited verbatim, so a compressed
 * parent hands down its summary rather than the shadowed history. Compaction
 * `replace` nodes are re-emitted as plain appends (their `sourceEventSeqs` are
 * dropped — re-numbering would invalidate them — and `surfaceOp` becomes
 * `append`), so the rebuilt seed is a self-consistent surface from seq 0.
 *
 * @param parent - the agent whose conversation surface to inherit.
 * @returns the seed events, contiguous from seq 0; empty when nothing is inherited.
 */
function completedTurnSurfaceSeed(parent: Agent): SessionEvent[] {
  const events = parent.session.events
  // The last turn boundary decides whether a turn is in flight: a trailing
  // `turn/start` without its paired `turn/end` marks the delegating turn.
  const lastBoundary = events.findLast(e => e.type === 'turn/start' || e.type === 'turn/end')
  const inFlight = lastBoundary !== undefined && lastBoundary.type === 'turn/start'
  // The full-log surface fold already applies compaction semantics: shadowed
  // nodes are gone, and any summary `replace` node is the current surface node.
  const { nodes } = foldSurface(events)
  const kept = inFlight && lastBoundary !== undefined
    // Exclude the in-flight turn: everything appended at or after its turn/start.
    ? nodes.filter(seq => seq < lastBoundary.seq)
    : [...nodes]
  if (kept.length === 0) return []
  return kept.map((seq, index) => {
    const original = events[seq]
    // foldSurface guarantees every node is a surface-eligible event.
    if (original === undefined || !isSurfaceEvent(original)) {
      throw new Error(`fork seed: surface node seq ${seq} is not a message-producing event`)
    }
    // Re-emit as an append: seq renumbered from 0, replace metadata dropped.
    // `original` is narrowed to a surface event by `isSurfaceEvent`, so `type`
    // and `data` agree; the cast re-widens to the `SessionEvent` union because
    // the object literal cannot prove the per-`type` data discriminant.
    return {
      type: original.type,
      seq: index,
      time: original.time,
      data: original.data,
      surfaceOp: 'append' as const,
    } as SessionEvent
  })
}

/**
 * The fork provider. Supports `depthLimit` and `outputSchema` (via the shared
 * in-process structured runtime), plus `toolFilter`/`persona` (scoped
 * restrict() and a scoped shadowing persona section).
 */
class ForkInProcessProvider implements SubagentProvider {
  readonly capabilities: SubagentCapabilities = { outputSchema: true, depthLimit: true, toolFilter: true, persona: true }
  // Context contract: a forked child IS seeded with the parent's completed surface.
  readonly inheritsParentContext = true

  constructor(readonly name: string) {}

  start(request: ResolvedSubagentStartRequest) {
    const seed = completedTurnSurfaceSeed(request.parent)
    return startInProcessRun(request as HarnessResolvedSubagentStartRequest, {
      // Only pass a seed when there's inherited surface to carry; an empty seed
      // is equivalent to a fresh child, so omit it to keep the session unseeded.
      ...seed.length > 0 ? { seed } : {},
    })
  }

  prepareContinuable(request: ContinuableCreateRequest): Promise<ContinuableCreateSpec> {
    // The fork surface is captured ONCE, at creation: it becomes part of the
    // child's own durable transcript, so a later cold resume replays that
    // surface instead of re-forking the parent's newer history.
    const seed = completedTurnSurfaceSeed(request.parent)
    return Promise.resolve(seed.length > 0 ? { seed } : {})
  }
}

export function apply(ctx: Context, config: Config): void {
  ctx.subagents.registerProvider(new ForkInProcessProvider(config.providerName))
}
