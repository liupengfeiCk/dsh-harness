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
import { randomUUID } from 'node:crypto';
import { foldConsumedWork } from '@deepseek-ai/dsh-agent';
import { SessionId } from '@deepseek-ai/dsh-session';
import { createUserMessage } from '@deepseek-ai/dsh-llm';
import { appendDelegatedPolicyOverrides, assertSubagentMaxDepth, captureDelegatedPolicyOverrides, childSessionMeta, finalAssistantOutput, resolveChildAgentOptions, resolveChildDepth, } from '@deepseek-ai/dsh-subagent';
// The team tool is mounted onto level >= 2 team-role children so they can
// delegate down (issuance gate, rule 2). The tool module does not import this
// engine module, so this edge does not create a cycle.
import * as teamTool from "../team/tool.js";
import { attachStructuredRuntime, } from "./structured.js";
export { STRUCTURED_OUTPUT_TOOL, STRUCTURED_OUTPUT_INSTRUCTION, } from "./structured.js";
/** Map a session turn outcome to the subagent seam's terminal vocabulary. */
function toStopReason(reason) {
    switch (reason?.kind) {
        case 'completed':
            return 'completed';
        case 'max-tokens':
            return 'max-tokens';
        case 'aborted':
            return 'aborted';
        // A pre-step rejection discarded the claimed prompt: the task was
        // declined, and the caller must not read the run as done.
        case 'blocked':
            return 'refusal';
        case 'error':
        case 'interrupted':
        default:
            return 'error';
    }
}
/** Error used when cancellation wins before the child publication boundary. */
function prePublicationAbort() {
    return new Error('subagent request was aborted before child publication');
}
/**
 * Model-facing delegation-scope statement for every in-process child. Copied
 * from the official `applyChildComposition` so our own composition stays
 * text-identical with the seam's runtime-context contribution.
 */
const SUBAGENT_DELEGATION_CONTEXT = 'You are a delegated subagent: your permission scope was fixed when you were started and cannot be '
    + 'widened from inside this session — operations that require approval are rejected automatically. '
    + 'When the task needs access beyond that scope, do not retry the denied operation; state the '
    + 'limitation in your reply so the delegating agent can handle it.';
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
export function resolveParentEffectiveModel(parent) {
    const headerConfig = parent.session.requestHeader()?.config;
    return {
        ...(headerConfig?.provider ?? parent.options.provider) !== undefined
            ? { provider: headerConfig?.provider ?? parent.options.provider }
            : {},
        ...(headerConfig?.model ?? parent.options.model) !== undefined
            ? { model: headerConfig?.model ?? parent.options.model }
            : {},
    };
}
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
export function harnessChildAgentOptions(parent, requested, childDepth) {
    const { provider, model } = resolveParentEffectiveModel(parent);
    return resolveChildAgentOptions(parent, {
        ...provider !== undefined ? { provider } : {},
        ...model !== undefined ? { model } : {},
        ...requested,
    }, childDepth);
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
export async function setupChildComposition(childCtx, parent, composition) {
    if (composition.subagent === undefined) {
        // A delegation without a named subagent runs on the instance's configured
        // persona/tool scope, so the child always inherits its parent's preset —
        // that is the pre-existing instance-persona/toolFilter mode, untouched by
        // the subagent inheritance switch.
        childCtx.get('agentPresets')?.composeFrom(childCtx, parent.ctx);
    }
    if (composition.subagent !== undefined) {
        const registry = childCtx.get('subagentPresets');
        const mounted = registry === undefined
            ? undefined
            : await registry.mountOnChild(childCtx, composition.subagent);
        // A named subagent inherits the parent composition ONLY when it opts in.
        // `inheritParent: true` keeps the historical behaviour — inherit the main
        // agent's preset whole, then overlay the subagent's own tree. Absent or
        // `false` (the default) keeps the subagent self-contained: the child runs
        // solely on the subagent's own tree.
        if (mounted?.metadata.inheritParent === true) {
            childCtx.get('agentPresets')?.composeFrom(childCtx, parent.ctx);
        }
        // A named subagent may bind a model-plan (its metadata `model` is a plan
        // id). The binding was recorded onto the child session as a log-only
        // `model-plan/select` event inside {@link mountSubagentOnChild}; the
        // model-plan merge interceptor (registered on every `agent/request`) reads
        // it and routes the child's requests to the plan's provider/model/params.
        // An unbound subagent (no plan id) inherits the parent's model — the
        // existing inheritance path, untouched.
    }
    // Order 120: after the sandbox:policy (110) and approval:policy (115) sentences.
    childCtx.systemPrompt.context({ name: 'subagent:delegation', order: 120, text: SUBAGENT_DELEGATION_CONTEXT });
    if (composition.persona !== undefined) {
        childCtx.systemPrompt.section({ name: 'deployment:persona', order: 0, text: composition.persona });
    }
    if (composition.toolFilter !== undefined)
        childCtx.tools.restrict(composition.toolFilter);
    // Issuance gate (rule 2): a team-role child at level >= 2 gets the
    // `team_delegate` tool mounted onto its OWN scope — the team tool is a host
    // tool that does not propagate to subagent children on its own, so it must be
    // explicitly granted here. A level-1 child carries no grant and therefore
    // never receives the delegation tool. Mounting the full plugin also renders
    // the reader-aware authority table (rule 4) and the execution gate (rule 3)
    // inside the child.
    if (composition.teamDelegation !== undefined) {
        childCtx.plugin(teamTool, {
            team: composition.teamDelegation.team,
            provider: composition.teamDelegation.provider,
            toolName: composition.teamDelegation.toolName,
            // The hierarchy's own level ordering is the recursion guard; do not stack
            // a second hard cap that could clamp a legitimate chain.
            maxDepth: 'provider-managed',
        });
    }
}
/** Bounded poll window for the `teams` service to be composed. */
const TEAMS_READY_TIMEOUT_MS = 200;
/** Poll cadence while waiting for the `teams` service. */
const TEAMS_READY_POLL_MS = 5;
/**
 * Wait for the `teams` service to be composed before a team-role child's
 * creation/resume resolution. If `teams` is absent when the tool applies, its
 * `refreshRoleCatalogue` kick returns early and the authority table can only be
 * refilled by the `internal/service` listener — after the first request has
 * rendered. Bounded and fail-soft: a deployment without `teams`, or a service
 * that stays absent, proceeds after the timeout. The per-scope roster fill
 * itself is settled separately by {@link awaitTeamRoster}.
 *
 * @param ctx - the scope to probe (the manager/parent context, where `teams`
 *   composes as a sibling row).
 * @param signal - caller cancellation; an abort returns without waiting.
 * @param timeoutMs - optional poll window override (tests may shrink it).
 * @returns the composed `teams` service, or undefined after the timeout.
 */
export async function waitForTeamCatalogue(ctx, signal, timeoutMs = TEAMS_READY_TIMEOUT_MS) {
    const deadline = Date.now() + timeoutMs;
    let teams = ctx.get('teams');
    while (teams === undefined && Date.now() < deadline) {
        if (signal.aborted)
            return undefined;
        await new Promise(resolve => setTimeout(resolve, TEAMS_READY_POLL_MS));
        teams = ctx.get('teams');
    }
    return teams;
}
/**
 * Settle a team-role child's fresh roster catalogue before its first request.
 *
 * A team tool apply fills its per-scope `rosters` closure asynchronously
 * (`refreshRoleCatalogue` → `teams.list().then(swap)`), kicked during the
 * child's creation/resume setup. The child's FIRST request renders the prompt
 * section synchronously, so it races that fill: if the fill has not landed, the
 * authority table toggles in between the first and second request and the
 * ~292-byte delta breaks the request prefix cache for a persistent role's cold
 * resume. Awaiting one `teams.list()` here — issued AFTER the child's setup
 * kicked its own read on the same service — deterministically settles the fresh
 * fill (the apply's read was created first, so its swap microtask runs before
 * this await's continuation), making the first request render the warm roster.
 * Fail-soft: no `teams` service, or a read error, proceeds without blocking.
 *
 * @param ctx - the scope holding the composed `teams` service (shared registry).
 * @param signal - caller cancellation; an abort returns without waiting.
 */
export async function awaitTeamRoster(ctx, signal) {
    if (signal.aborted)
        return;
    await ctx.get('teams')?.list().catch(() => undefined);
}
/** Append one one-shot descriptor inside the child's initial turn before its first request. */
function attachDescriptorAppend(childCtx, descriptor) {
    let appended = false;
    childCtx.on('agent/pre-step', async ({ agent }, next) => {
        const decision = await next();
        if (!appended && decision.kind === 'enter') {
            appended = true;
            agent.session.append('subagent/descriptor', descriptor);
        }
        return decision;
    });
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
export async function startInProcessRun(request, options) {
    assertSubagentMaxDepth(request.maxDepth);
    if (request.signal.aborted)
        throw prePublicationAbort();
    const parent = request.parent;
    const childDepth = resolveChildDepth(parent, request.maxDepth);
    const childId = SessionId(randomUUID());
    const seed = options.seed;
    const activationBoundary = seed?.length ?? 0;
    // Capture before the first await: a later parent switch belongs to the
    // parent's future.
    const inherited = captureDelegatedPolicyOverrides(parent);
    let structured;
    const setup = async (childCtx) => {
        appendDelegatedPolicyOverrides(childCtx.agent.session, inherited);
        await setupChildComposition(childCtx, parent, {
            persona: request.persona,
            toolFilter: request.toolFilter,
            subagent: request.subagent,
            teamDelegation: request.teamDelegation,
        });
        if (request.outputSchema !== undefined) {
            structured = attachStructuredRuntime(childCtx, request.outputSchema);
        }
        attachDescriptorAppend(childCtx, request.descriptor);
    };
    // A team-role child (level >= 2) mounts the team tool in its setup, whose
    // first-request authority table needs the `teams` roster warm. Wait for the
    // service to be composed before `agents.create`, then settle the fresh roster
    // fill after creation, so the first request renders the authority table —
    // otherwise the table toggles in and breaks the request prefix cache.
    // Non-team children skip both.
    if (request.teamDelegation !== undefined) {
        await waitForTeamCatalogue(parent.ctx, request.signal);
    }
    const handle = await parent.ctx.agents.create({
        sessionId: childId,
        meta: childSessionMeta(parent, childDepth, activationBoundary),
        ...seed !== undefined ? { seed } : {},
        agentOptions: harnessChildAgentOptions(parent, request.agentOptions, childDepth),
        signal: request.signal,
        setup,
    });
    if (request.teamDelegation !== undefined) {
        await awaitTeamRoster(parent.ctx, request.signal);
    }
    return drivePublishedRun(handle, request.signal, request.prompt, childId, activationBoundary, structured);
}
/**
 * Wrap a published child in the single run lifecycle that owns signal handoff,
 * one turn, result settlement, and quiescent disposal.
 */
function drivePublishedRun(handle, signal, prompt, childId, boundary, structured) {
    const child = handle.agent;
    const flags = { cancelled: false };
    const onAbort = () => {
        flags.cancelled = true;
        child.cancel({ kind: 'parent' });
    };
    signal.addEventListener('abort', onAbort, { once: true });
    // Agent creation detaches its creation-only listener before returning. The
    // post-registration check closes that handoff without treating an already
    // published child as a failed start.
    if (signal.aborted)
        onAbort();
    const result = (async () => {
        try {
            if (!flags.cancelled) {
                child.followup(createUserMessage({ content: prompt, source: { kind: 'user' } }));
                await child.whenIdle();
            }
            return readResult(child, boundary, flags.cancelled, structured ? { captured: structured.captured() } : undefined);
        }
        finally {
            signal.removeEventListener('abort', onAbort);
        }
    })();
    return {
        id: childId,
        localAgent: child,
        result,
        async dispose() {
            signal.removeEventListener('abort', onAbort);
            flags.cancelled = true;
            const settlements = await Promise.allSettled([handle.dispose(), result]);
            const disposal = settlements[0];
            // The result channel owns run faults; disposal reports only failure to
            // release the published handle after both operations settle.
            if (disposal.status === 'rejected')
                throw disposal.reason;
        },
    };
}
/** Read one settled child's result from events after its activation boundary. */
function readResult(child, boundary, cancelled, structured) {
    const own = child.session.events.slice(boundary);
    // `droppedUnrun` is deliberately unread: a one-shot prompt is claimed by its
    // awaited first turn almost immediately, and the owner's own teardown is the
    // `cancelled` flag below. A cancellation with no accounting turn resolves
    // `error` through `toStopReason(undefined)`, which never overstates success.
    const lastEnd = foldConsumedWork(own).end;
    // The seam's canonical selection rule; a partial answer survives cancel and truncation.
    const output = finalAssistantOutput(own) ?? [];
    const recorded = toStopReason(lastEnd?.data.reason);
    // Disposal can tear the owner down before the loop records its ordinary
    // `aborted` end, yielding `disposed` instead.
    const stopReason = cancelled && recorded !== 'completed' ? 'aborted' : recorded;
    if (structured !== undefined) {
        if (structured.captured !== undefined) {
            return { output, structured: structured.captured.value, stopReason };
        }
        if (stopReason === 'completed')
            return { output, stopReason: cancelled ? 'aborted' : 'error' };
    }
    return { output, stopReason };
}
//# sourceMappingURL=engine.js.map