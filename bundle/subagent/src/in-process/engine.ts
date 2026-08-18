/**
 * Harness-owned in-process ONE-SHOT subagent engine.
 *
 * This module is the replacement for the official
 * `@deepseek-ai/dsh-subagent-in-process-driver`'s `startInProcessRun`. It
 * drives one published child through the same lifecycle (signal handoff, one
 * turn, result settlement, quiescent disposal) but composes the child with
 * OUR inheritance switch, which the official `applyChildComposition` no longer
 * carries once the official package is restored upstream (task 3).
 *
 * UPSTREAM-SYNC NOTE: the driver pieces below — `attachDescriptorAppend`,
 * `drivePublishedRun`, `readResult`, `toStopReason`, `prePublicationAbort`,
 * and the outline of `startInProcessRun` — are copied line-for-line from
 * `@deepseek-ai/dsh-subagent-in-process-driver/src/index.ts` so behaviour stays
 * byte-identical with the official seam. When that package changes upstream,
 * re-sync this file. The ONE deliberate deviation is `setupChildComposition`
 * below, which replaces the official `setup` closure so the inheritance switch
 * and subagent model override live in our package rather than the official
 * `applyChildComposition`.
 *
 * @module dsh-harness-subagent-bundle/in-process/engine
 */

import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import { foldConsumedWork } from '@deepseek-ai/dsh-agent'
import type { Agent, AgentHandle } from '@deepseek-ai/dsh-agent'
import { installModelSelection, type ModelSelectionRef } from '@deepseek-ai/dsh-agent'
import { SessionId, type SessionEvent, type TurnEndReason } from '@deepseek-ai/dsh-session'
import { createUserMessage, type ContentBlock } from '@deepseek-ai/dsh-llm'
import {
  appendDelegatedPolicyOverrides,
  assertSubagentMaxDepth,
  captureDelegatedPolicyOverrides,
  childSessionMeta,
  finalAssistantOutput,
  resolveChildAgentOptions,
  resolveChildDepth,
} from '@deepseek-ai/dsh-subagent'
import type {
  SubagentDescriptorData,
  SubagentResult,
  SubagentRun,
  SubagentStopReason,
} from '@deepseek-ai/dsh-subagent'
import type { HarnessResolvedSubagentStartRequest } from './request-types.ts'
// Type-only: make `ctx.get('agentPresets')` / `ctx.get('subagentPresets')` resolve
// to their registries when composed — a child inherits its parent's composition
// and may mount a named subagent's plugin tree opportunistically (the documented
// `ctx.get` pattern), never as a hard dep.
import type {} from '@deepseek-ai/dsh-agent-presets'
import type {} from '../preset/index.ts'
import {
  attachStructuredRuntime,
  type StructuredAttachment,
} from './structured.ts'

export {
  STRUCTURED_OUTPUT_TOOL,
  STRUCTURED_OUTPUT_INSTRUCTION,
} from './structured.ts'

/** Map a session turn outcome to the subagent seam's terminal vocabulary. */
function toStopReason(reason: TurnEndReason | undefined): SubagentStopReason {
  switch (reason?.kind) {
    case 'completed':
      return 'completed'
    case 'max-tokens':
      return 'max-tokens'
    case 'aborted':
      return 'aborted'
    // A pre-step rejection discarded the claimed prompt: the task was
    // declined, and the caller must not read the run as done.
    case 'blocked':
      return 'refusal'
    case 'error':
    case 'interrupted':
    default:
      return 'error'
  }
}

/** Extra inputs the spawn and fork providers supply to the shared engine. */
export interface InProcessRunOptions {
  /** Completed-turn seed for fork, or undefined for a fresh spawn. */
  readonly seed?: SessionEvent[]
}

/** Error used when cancellation wins before the child publication boundary. */
function prePublicationAbort(): Error {
  return new Error('subagent request was aborted before child publication')
}

/**
 * Model-facing delegation-scope statement for every in-process child. Copied
 * from the official `applyChildComposition` so our own composition stays
 * text-identical with the seam's runtime-context contribution.
 */
const SUBAGENT_DELEGATION_CONTEXT
  = 'You are a delegated subagent: your permission scope was fixed when you were started and cannot be '
    + 'widened from inside this session — operations that require approval are rejected automatically. '
    + 'When the task needs access beyond that scope, do not retry the denied operation; state the '
    + 'limitation in your reply so the delegating agent can handle it.'

/** The scoped composition a child agent's creation window applies. */
export interface ChildComposition {
  /** Per-child persona shadowing the deployment persona. */
  readonly persona?: string | undefined
  /** Per-child tool scoping. */
  readonly toolFilter?: import('@deepseek-ai/dsh-tools').ToolRestriction | undefined
  /** User-defined subagent id whose plugin tree mounts onto the child's own scope. */
  readonly subagent?: string | undefined
}

/**
 * Compose one child inside its creation window, honouring the inheritance
 * switch, a named subagent's model override, and the instance persona/tool
 * filter. This is the harness-owned replacement for the official
 * `applyChildComposition`, whose `inheritParent` branch disappears when the
 * official package is restored upstream.
 *
 * UPSTREAM-SYNC NOTE: copied line-for-line from the CURRENT (harness-modified)
 * `applyChildComposition` in `@deepseek-ai/dsh-subagent/src/child-agent.ts`
 * (`composeFrom` on the parent preset, the named-subagent mount, the
 * `inheritParent`-gated join, the subagent model override, the fixed delegation
 * statement, and the shadowing persona/tool restriction). When the official
 * child composition semantics change upstream, re-sync this function; it is
 * deliberately self-contained so the official function never needs the branch.
 *
 * @param childCtx - the child agent's scoped creation context.
 * @param parent - the delegating parent whose composition the child may join.
 * @param composition - the per-child persona, tool filter, and subagent to install.
 */
export async function setupChildComposition(
  childCtx: Context,
  parent: Agent,
  composition: ChildComposition,
): Promise<void> {
  if (composition.subagent === undefined) {
    // A delegation without a named subagent runs on the instance's configured
    // persona/tool scope, so the child always inherits its parent's preset —
    // that is the pre-existing instance-persona/toolFilter mode, untouched by
    // the subagent inheritance switch.
    childCtx.get('agentPresets')?.composeFrom(childCtx, parent.ctx)
  }
  if (composition.subagent !== undefined) {
    const registry = childCtx.get('subagentPresets')
    const mounted = registry === undefined
      ? undefined
      : await registry.mountOnChild(childCtx, composition.subagent)
    // A named subagent inherits the parent composition ONLY when it opts in.
    // `inheritParent: true` keeps the historical behaviour — inherit the main
    // agent's preset whole, then overlay the subagent's own tree. Absent or
    // `false` (the default) keeps the subagent self-contained: the child runs
    // solely on the subagent's own tree.
    if (mounted?.metadata.inheritParent === true) {
      childCtx.get('agentPresets')?.composeFrom(childCtx, parent.ctx)
    }
    // A named subagent may carry its own model override. When it does, couple
    // that fixed provider/model pair to the child's own scope so the child's
    // requests route to the selected model instead of the parent's. Absent an
    // override the child inherits the parent's model.
    const override = mounted?.metadata.model
    if (override !== undefined) {
      const selection: ModelSelectionRef = {
        current: { provider: override.provider, model: override.model },
        assembled: undefined,
      }
      installModelSelection(childCtx, selection)
    }
  }
  // Order 120: after the sandbox:policy (110) and approval:policy (115) sentences.
  childCtx.systemPrompt.context({ name: 'subagent:delegation', order: 120, text: SUBAGENT_DELEGATION_CONTEXT })
  if (composition.persona !== undefined) {
    childCtx.systemPrompt.section({ name: 'deployment:persona', order: 0, text: composition.persona })
  }
  if (composition.toolFilter !== undefined) childCtx.tools.restrict(composition.toolFilter)
}

/** Append one one-shot descriptor inside the child's initial turn before its first request. */
function attachDescriptorAppend(childCtx: Context, descriptor: SubagentDescriptorData): void {
  let appended = false
  childCtx.on('agent/pre-step', async ({ agent }, next) => {
    const decision = await next()
    if (!appended && decision.kind === 'enter') {
      appended = true
      agent.session.append('subagent/descriptor', descriptor)
    }
    return decision
  })
}

/**
 * Establish and drive one in-process one-shot child. Fulfillment means the agent
 * is already published in the registry and transfers its turn, cancellation,
 * and disposal work through the returned run. Rejection means the agent
 * factory's unpublished creation transaction reached quiescence without
 * publishing a child. Every start appends its resolved descriptor inside the
 * child's initial turn.
 * @param request - the trusted typed start request, including its required signal.
 * @param options - the optional fork seed.
 * @returns a published holder-owned run.
 */
export async function startInProcessRun(
  request: HarnessResolvedSubagentStartRequest,
  options: InProcessRunOptions,
): Promise<SubagentRun> {
  assertSubagentMaxDepth(request.maxDepth)
  if (request.signal.aborted) throw prePublicationAbort()
  const parent = request.parent
  const childDepth = resolveChildDepth(parent, request.maxDepth)

  const childId = SessionId(randomUUID())
  const seed = options.seed
  const activationBoundary = seed?.length ?? 0

  // Capture before the first await: a later parent switch belongs to the
  // parent's future.
  const inherited = captureDelegatedPolicyOverrides(parent)

  let structured: StructuredAttachment | undefined
  const setup = async (childCtx: Context): Promise<void> => {
    appendDelegatedPolicyOverrides((childCtx.agent as Agent).session, inherited)
    await setupChildComposition(childCtx, parent, {
      persona: request.persona,
      toolFilter: request.toolFilter,
      subagent: request.subagent,
    })
    if (request.outputSchema !== undefined) {
      structured = attachStructuredRuntime(childCtx, request.outputSchema)
    }
    attachDescriptorAppend(childCtx, request.descriptor)
  }

  const handle = await parent.ctx.agents.create({
    sessionId: childId,
    meta: childSessionMeta(parent, childDepth, activationBoundary),
    ...seed !== undefined ? { seed } : {},
    agentOptions: resolveChildAgentOptions(parent, request.agentOptions, childDepth),
    signal: request.signal,
    setup,
  })
  return drivePublishedRun(
    handle,
    request.signal,
    request.prompt,
    childId,
    activationBoundary,
    structured,
  )
}

/**
 * Wrap a published child in the single run lifecycle that owns signal handoff,
 * one turn, result settlement, and quiescent disposal.
 */
function drivePublishedRun(
  handle: AgentHandle,
  signal: AbortSignal,
  prompt: ContentBlock[],
  childId: SessionId,
  boundary: number,
  structured: StructuredAttachment | undefined,
): SubagentRun {
  const child = handle.agent
  const flags = { cancelled: false }
  const onAbort = (): void => {
    flags.cancelled = true
    child.cancel({ kind: 'parent' })
  }
  signal.addEventListener('abort', onAbort, { once: true })
  // Agent creation detaches its creation-only listener before returning. The
  // post-registration check closes that handoff without treating an already
  // published child as a failed start.
  if (signal.aborted) onAbort()

  const result: Promise<SubagentResult> = (async () => {
    try {
      if (!flags.cancelled) {
        child.followup(createUserMessage({ content: prompt, source: { kind: 'user' } }))
        await child.whenIdle()
      }
      return readResult(
        child,
        boundary,
        flags.cancelled,
        structured ? { captured: structured.captured() } : undefined,
      )
    } finally {
      signal.removeEventListener('abort', onAbort)
    }
  })()

  return {
    id: childId,
    localAgent: child,
    result,
    async dispose(): Promise<void> {
      signal.removeEventListener('abort', onAbort)
      flags.cancelled = true
      const settlements = await Promise.allSettled([handle.dispose(), result])
      const disposal = settlements[0]
      // The result channel owns run faults; disposal reports only failure to
      // release the published handle after both operations settle.
      if (disposal.status === 'rejected') throw disposal.reason
    },
  }
}

/** Read one settled child's result from events after its activation boundary. */
function readResult(
  child: Agent,
  boundary: number,
  cancelled: boolean,
  structured?: { captured?: { value: unknown } | undefined },
): SubagentResult {
  const own = child.session.events.slice(boundary)
  // `droppedUnrun` is deliberately unread: a one-shot prompt is claimed by its
  // awaited first turn almost immediately, and the owner's own teardown is the
  // `cancelled` flag below. A cancellation with no accounting turn resolves
  // `error` through `toStopReason(undefined)`, which never overstates success.
  const lastEnd = foldConsumedWork(own).end
  // The seam's canonical selection rule; a partial answer survives cancel and truncation.
  const output: ContentBlock[] = finalAssistantOutput(own) ?? []
  const recorded = toStopReason(lastEnd?.data.reason)
  // Disposal can tear the owner down before the loop records its ordinary
  // `aborted` end, yielding `disposed` instead.
  const stopReason: SubagentStopReason = cancelled && recorded !== 'completed' ? 'aborted' : recorded
  if (structured !== undefined) {
    if (structured.captured !== undefined) {
      return { output, structured: structured.captured.value, stopReason }
    }
    if (stopReason === 'completed') return { output, stopReason: cancelled ? 'aborted' : 'error' }
  }
  return { output, stopReason }
}
