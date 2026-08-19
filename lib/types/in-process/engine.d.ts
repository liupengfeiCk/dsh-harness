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
import type { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
import { type SessionEvent } from '@deepseek-ai/dsh-session';
import type { SubagentRun } from '@deepseek-ai/dsh-subagent';
import type { HarnessResolvedSubagentStartRequest } from './request-types.ts';
export { STRUCTURED_OUTPUT_TOOL, STRUCTURED_OUTPUT_INSTRUCTION, } from './structured.ts';
/** Extra inputs the spawn and fork providers supply to the shared engine. */
export interface InProcessRunOptions {
    /** Completed-turn seed for fork, or undefined for a fresh spawn. */
    readonly seed?: SessionEvent[];
}
/** The scoped composition a child agent's creation window applies. */
export interface ChildComposition {
    /** Per-child persona shadowing the deployment persona. */
    readonly persona?: string | undefined;
    /** Per-child tool scoping. */
    readonly toolFilter?: import('@deepseek-ai/dsh-tools').ToolRestriction | undefined;
    /** User-defined subagent id whose plugin tree mounts onto the child's own scope. */
    readonly subagent?: string | undefined;
    /**
     * Issuance-gate grant (rule 2): when present, the child is a team role at
     * level >= 2 and the `team_delegate` tool is mounted onto the child's own
     * scope so it can delegate down. Level-1 children carry no grant, so they
     * never get the delegation tool.
     */
    readonly teamDelegation?: {
        team: string;
        provider: string;
        toolName: string;
    } | undefined;
}
/**
 * The parent agent's EFFECTIVE provider/model — what its requests actually
 * route through — for a delegated child to inherit by default.
 *
 * The official `resolveChildAgentOptions` (and the continuation descriptor)
 * inherit from `parent.options`, the preset's composed DEFAULT. But the main
 * agent's live requests are routed by the installed model selection
 * (`installModelSelection`), which overrides `agent/request` config to the
 * user's picked provider/model; `parent.options` may still name a different
 * preset default. Reading the session's last request header — the very source
 * the official apiproxy `selectionFor` folds for its "current" selection —
 * makes a delegated child inherit the SAME route the parent actually runs, so
 * subagents and the main agent share one cache-friendly gateway. Falls back to
 * `parent.options` when the parent has not yet issued a request.
 *
 * @param parent - the delegating parent whose live route to mirror.
 * @returns the effective `{ provider, model }`, either field absent when unknown.
 */
export declare function resolveParentEffectiveModel(parent: Agent): {
    provider?: string;
    model?: string;
};
/**
 * Resolve a delegated child's agent options from the parent's EFFECTIVE model
 * rather than its preset default. Overlays the effective `{ provider, model }`
 * under the requested options and delegates the rest (maxTokens, subagentDepth)
 * to the official `resolveChildAgentOptions`, so an explicit delegation
 * `agentOptions` still wins and the subagent's own model override (installed
 * later by {@link setupChildComposition}) keeps precedence at request time.
 *
 * @param parent - the delegating parent.
 * @param requested - explicit delegation options, if any.
 * @param childDepth - the child's recursion depth.
 * @returns the child's agent options with the effective model inherited.
 */
export declare function harnessChildAgentOptions(parent: Agent, requested: import('@deepseek-ai/dsh-agent').AgentOptions | undefined, childDepth: number): import('@deepseek-ai/dsh-agent').AgentOptions;
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
export declare function setupChildComposition(childCtx: Context, parent: Agent, composition: ChildComposition): Promise<void>;
/**
 * Ensure a team-role child's FIRST request renders a warm authority table by
 * waiting for the `teams` service to be composed before its creation window
 * applies the team tool.
 *
 * A team tool apply builds a per-scope `rosters` closure and fills it
 * asynchronously (`refreshRoleCatalogue` → `teams.list().then(...)`). If the
 * `teams` service is not yet composed at apply time, that kick returns early
 * and only the `internal/service` listener would refill the catalogue — after
 * the first request has already rendered, so the authority table toggles in and
 * the 292-byte delta breaks the request prefix cache for a persistent role's
 * cold resume. Waiting for `teams` to appear makes the fresh apply's own kick
 * land immediately. The wait is bounded and fail-soft: a deployment without
 * `teams`, or a service that stays absent, proceeds after the timeout.
 *
 * @param ctx - the scope to probe (the manager/parent context, where `teams`
 *   composes as a sibling row).
 * @param signal - caller cancellation; an abort returns without waiting.
 * @param timeoutMs - optional poll window override (tests may shrink it).
 * @returns the composed `teams` service, or undefined after the timeout.
 */
export declare function waitForTeamCatalogue(ctx: Context, signal: AbortSignal, timeoutMs?: number): Promise<unknown>;
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
export declare function startInProcessRun(request: HarnessResolvedSubagentStartRequest, options: InProcessRunOptions): Promise<SubagentRun>;
//# sourceMappingURL=engine.d.ts.map