/**
 * Model-facing delegation through one configured `ctx.subagents` provider.
 * Provider lifecycle controls tool registration and context-sensitive schema
 * wording. Foreground calls always dispose the run after collection.
 * Background policy is selected by this plugin's configuration: one-shot
 * calls own a plain Task, while continuable calls use
 * `ctx.subagents.startContinuable()`.
 *
 * This is the harness-owned replacement for the official
 * `@deepseek-ai/dsh-tool-subagent`, carrying the same instance configuration
 * surface plus the `template` parameter, the subagent resolution gate, and the
 * subagent catalogue prompt section. Provider config points at the harness
 * engine (`spawn`/`fork`) by default.
 * @module dsh-harness-subagent-bundle/in-process/tool
 */
import z from '@deepseek-ai/schemastery';
import { defineTool } from '@deepseek-ai/dsh-tools';
import { assertSubagentMaxDepth, settleRun } from '@deepseek-ai/dsh-subagent';
// The session-level delegation surface: a `team` session must not run the
// standard `delegate`/`delegate_fork` tools. Imported from the mode module
// directly (not the team index) to keep this tool free of a registry dep.
import { currentTeamMode } from "../team/mode.js";
export const name = 'subagent-in-process-tool';
export const inject = ['tools', 'subagents', 'systemPrompt'];
/** Prompt order after bounded delegation policy and before child reporting. */
const SUBAGENT_SECTION_ORDER = 116.5;
export const Config = z.object({
    provider: z.string().required(),
    toolName: z.string().default('subagent'),
    enableRunInBackground: z.boolean().default(true),
    backgroundMode: z.union(['one-shot', 'continuable']).default('one-shot'),
    // Prevent Schemastery from materializing omitted agentOptions as `{}`.
    agentOptions: z.object({
        provider: z.string(),
        model: z.string(),
        maxTokens: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER),
    }).default(undefined),
    persona: z.string(),
    // Preserve omission; Schemastery's `{ allow: [] }` default would deny every tool.
    toolFilter: z.object({
        allow: z.array(z.string()).default(undefined),
        deny: z.array(z.string()).default(undefined),
    }).default(undefined),
    maxDepth: z.union([z.natural().max(Number.MAX_SAFE_INTEGER), z.const('provider-managed')]).default(3),
});
/** Render text blocks from the canonical JSON block array without trusting arbitrary values. */
function outputValueText(values) {
    return values
        .filter((value) => typeof value === 'object' && value !== null && !Array.isArray(value)
        && value.type === 'text' && typeof value.text === 'string')
        .map(value => value.text)
        .join('');
}
/** Settle pending startup without rejecting the task producer contract. */
async function settleStart(start, signal) {
    try {
        return await settleRun(await start);
    }
    catch (error) {
        return signal.aborted
            ? { status: 'killed' }
            : { status: 'failed', detail: String(error) };
    }
}
/** A non-`completed` stop reason means the child did not finish cleanly. */
function stopReasonError(result) {
    switch (result.stopReason) {
        case 'completed':
            return undefined;
        case 'aborted':
            return 'subagent run was cancelled';
        case 'error':
            return 'subagent run failed';
        case 'max-tokens':
            return 'subagent run hit its token limit before finishing';
        case 'refusal':
            return 'subagent declined the task';
        // Merge-extensible union: a backend may add stop reasons. Treat an unknown
        // terminal reason as a failure rather than reporting partial output as success.
        default:
            return `subagent run ended abnormally (${String(result.stopReason)})`;
    }
}
/**
 * Append the child's preserved partial answer to a stop-reason error so a
 * truncated or cancelled child's real text still reaches the parent model.
 * @param error - the stop-reason headline.
 * @param output - the child's selected output (`SubagentResult.output`).
 * @returns the headline, extended with the partial text when any exists.
 */
function withPartialText(error, output) {
    const text = output
        .filter((block) => block.type === 'text')
        .map(block => block.text)
        .join('');
    return text.length === 0 ? error : `${error}\nPartial output before the run ended:\n${text}`;
}
/**
 * Collect and release one foreground run without letting disposal replace an
 * independent result failure.
 */
async function settleForegroundRun(run) {
    const [execution] = await Promise.allSettled([
        run.result.then((result) => {
            const error = stopReasonError(result);
            if (error !== undefined) {
                // The registry converts this throw to isError; partial output is not
                // success, but the preserved partial answer still reaches the parent.
                throw new Error(withPartialText(error, result.output));
            }
            return {
                kind: 'foreground',
                runId: run.id,
                // Content blocks already cross durable JSON boundaries elsewhere;
                // the registry performs the authoritative lossless snapshot here.
                output: result.output,
            };
        }),
    ]);
    const [disposal] = await Promise.allSettled([Promise.resolve().then(() => run.dispose())]);
    if (execution.status === 'rejected') {
        if (disposal.status === 'rejected') {
            throw new AggregateError([execution.reason, disposal.reason], `subagent run failed: ${String(execution.reason)}; dispose failed: ${String(disposal.reason)}`);
        }
        throw execution.reason;
    }
    if (disposal.status === 'rejected')
        throw disposal.reason;
    return execution.value;
}
/**
 * Model-facing wording from the provider's conversation-history descriptor
 * ({@link SubagentProvider.inheritsParentContext}).
 * A fresh child needs a standalone prompt; a forked child already sees the
 * conversation's completed turns — telling the model to restate everything
 * (or, worse, that the child "does not see this conversation") would be false
 * for a fork.
 * @param inheritsConversation - whether the child's conversation is seeded
 *   with the parent's completed turns; this says nothing about tool, service,
 *   scope, or authority inheritance.
 * @returns the tool `description` and the `prompt` parameter description.
 */
function providerWording(inheritsConversation) {
    if (inheritsConversation) {
        return {
            description: 'Delegate a task to a subagent that inherits this conversation: a child agent seeded with all '
                + 'completed turns so far (it does not see the current in-flight turn). Use this when the subtask '
                + 'builds on this conversation\'s context — a follow-up analysis, '
                + 'a review, a continuation — without consuming this conversation\'s context for the work itself. '
                + 'You receive its result, not its intermediate steps.',
            promptDescription: 'The task for the subagent. It already sees this conversation\'s completed turns, so build on them '
                + 'freely and state only what is new.',
        };
    }
    return {
        description: 'Delegate a self-contained task to a subagent (a separate agent that works in its own context) '
            + 'to offload focused, independent work — research, a scoped '
            + 'implementation, an analysis — so it does not consume this conversation\'s context. The subagent '
            + 'returns its result, not its intermediate steps. Give it a '
            + 'complete, standalone prompt: it does not see this conversation.',
        promptDescription: 'The complete, self-contained task for the subagent. It does not share this '
            + 'conversation\'s context, so include everything it needs.',
    };
}
/** Resolve the model's optional scheduling request into one execution route. */
function resolveDelegationRun(request, options) {
    if (!options.backgroundEnabled) {
        // The validator permits undeclared keys, so schema omission also needs
        // execution-time enforcement.
        if (request.run_in_background === true) {
            throw new Error('run_in_background is disabled for this tool instance (enableRunInBackground: false)');
        }
        return { runInBackground: false };
    }
    return {
        // Continuable work is independently scheduled unless the caller explicitly
        // needs the result before its next action. One-shot policy keeps its existing
        // foreground default because its background result requires Task collection.
        runInBackground: request.run_in_background ?? options.continuable,
    };
}
/**
 * Resolve a named user-defined subagent the model chose through the `template`
 * parameter, failing loud when the subagent is unknown, broken, disabled, or
 * the subagent registry is absent.
 *
 * A subagent is a user-defined helper agent whose plugin tree (persona, tools,
 * prompt sections) is mounted onto the delegated child's own scope. The
 * delegation tool only NAMES the subagent, and the child's creation window
 * mounts its tree. Resolution here verifies the name is real and usable so the
 * model learns of a bad pick at the call, not deep inside child creation.
 * @param ctx - the tool's context, for the optional subagent registry.
 * @param template - the subagent id the model named.
 * @returns the resolved, mountable subagent id.
 */
async function resolveSubagent(ctx, template) {
    const subagents = ctx.get('subagentPresets');
    if (subagents === undefined) {
        throw new Error(`tool-subagent: subagent "${template}" requested but no subagent registry is loaded `
            + '(load dsh-harness-subagent-bundle/preset in the host composition)');
    }
    const subagent = await subagents.resolve(template);
    if (subagent.broken !== undefined) {
        throw new Error(`tool-subagent: subagent "${template}" cannot be mounted: ${subagent.broken}`);
    }
    if (subagent.metadata.enabled === false) {
        throw new Error(`tool-subagent: subagent "${template}" is disabled; enable it in the subagents settings to delegate to it`);
    }
    return subagent.id;
}
export function apply(ctx, config) {
    // Direct apply() bypasses Schemastery's numeric constraints. A direct-apply
    // omission stays capless (the schema default only runs through the loader).
    if (config.maxDepth !== 'provider-managed')
        assertSubagentMaxDepth(config.maxDepth);
    // Reject an empty explicit filter at load instead of failing every delegation.
    if (config.toolFilter !== undefined && config.toolFilter.allow === undefined && config.toolFilter.deny === undefined) {
        throw new Error('tool-subagent: `toolFilter` is configured but names neither `allow` nor `deny` — remove the key or fill the filter');
    }
    const backgroundEnabled = config.enableRunInBackground !== false;
    const continuable = (config.backgroundMode ?? 'one-shot') === 'continuable';
    const toolName = config.toolName ?? 'subagent';
    // Mirror provider lifecycle because sibling load order and HMR replacement
    // can change provider availability while this fiber remains active.
    let disposeTool;
    // Synchronous model-facing catalogue of user-defined subagents usable as
    // delegation targets, refreshed by {@link refreshSubagentCatalogue} (see the
    // `tool:<name>:subagents` section). Each subagent is a user-defined helper
    // whose plugin tree is mounted onto a delegated child; the catalogue lists
    // only enabled, non-broken subagents.
    let subagentCatalogue = '';
    /** Re-read the subagent registry into the synchronous prompt-section cache. */
    const refreshSubagentCatalogue = () => {
        const subagents = ctx.get('subagentPresets');
        if (subagents === undefined) {
            subagentCatalogue = '';
            return;
        }
        subagents.list().then((rows) => {
            const lines = rows
                .filter(subagent => subagent.broken === undefined && subagent.metadata.enabled !== false)
                .map(subagent => `- ${subagent.id}: ${subagent.metadata.description ?? subagent.id}`);
            subagentCatalogue = lines.length === 0
                ? ''
                : `Available subagents (pass one as the \`template\` argument to ${toolName} to compose that child from the subagent's plugin tree):\n${lines.join('\n')}`;
        }).catch(() => {
            // A registry read failure leaves the last catalogue: the model sees no new
            // subagents but never a broken prompt. Next delegation retries the read.
        });
    };
    const mount = (provider) => {
        // A numeric cap the provider cannot enforce is a misconfiguration — fail at
        // mount (the earliest point the provider's capabilities are known), not on
        // the first delegation.
        if (typeof config.maxDepth === 'number' && !provider.capabilities.depthLimit) {
            throw new Error(`tool-subagent: provider "${provider.name}" cannot enforce maxDepth (no depthLimit capability) — `
                + 'set maxDepth: \'provider-managed\' to leave the recursion budget to the provider');
        }
        const wording = providerWording(provider.inheritsParentContext);
        if (continuable && provider.prepareContinuable === undefined) {
            throw new Error(`tool-subagent: provider "${provider.name}" does not support \`backgroundMode: continuable\``);
        }
        disposeTool = ctx.tools.register(defineTool({
            name: toolName,
            description: wording.description + (backgroundEnabled
                // The completion notice is the continuation service's own behavior, not
                // a separately installed capability, so this promise holds whenever the
                // continuable background path is reachable at all.
                ? continuable
                    ? ' This tool runs in the background by default, immediately returns a durable subagent id, and keeps the child conversation available for later turns. When that run settles, the runtime sends the parent a notice containing its outcome and any final assistant message; `send_message` starts a later turn in the same child conversation. Set `run_in_background: false` only when your next action depends on receiving the result.'
                    : ' This call waits for the result by default. Set `run_in_background: true` to return a job id; collect with `job_output` and stop with `job_kill`.'
                : ' This call waits for the subagent and returns its result.'),
            parameters: {
                description: {
                    type: 'string',
                    required: true,
                    description: 'A short (3-5 word) description of the delegated task, for display.',
                },
                prompt: {
                    type: 'string',
                    required: true,
                    description: wording.promptDescription,
                },
                ...backgroundEnabled ? {
                    run_in_background: {
                        type: 'boolean',
                        description: continuable
                            ? 'Whether to run in the background and return a durable subagent id immediately. Defaults to true. Set false to wait for the result when your next action depends on it.'
                            : 'Whether to run as a background job and return its id. Defaults to false; collect with job_output or stop with job_kill.',
                    },
                } : {},
                template: {
                    type: 'string',
                    description: 'Optional id of a user-defined subagent to compose this child from: the subagent\'s plugin tree (its persona, tools, and prompt sections) is mounted onto the child in addition to its inherited parent composition. Subagents are user-defined helpers stored separately from agent presets; the catalogue is listed in the system prompt. Omit to compose the child from the instance\'s configured persona and tool scope alone.',
                },
            },
            output: {
                schema: {
                    oneOf: [
                        {
                            type: 'object',
                            additionalProperties: false,
                            properties: {
                                kind: { type: 'string', required: true, const: 'background' },
                                jobId: { type: 'string', required: true },
                            },
                        },
                        {
                            type: 'object',
                            additionalProperties: false,
                            properties: {
                                kind: { type: 'string', required: true, const: 'continuable' },
                                subagentId: { type: 'string', required: true },
                            },
                        },
                        {
                            type: 'object',
                            additionalProperties: false,
                            properties: {
                                kind: { type: 'string', required: true, const: 'foreground' },
                                runId: { type: 'string', required: true },
                                output: { type: 'array', required: true, items: { type: 'json' } },
                            },
                        },
                    ],
                },
                render: (_args, value) => [{
                        type: 'text',
                        text: value.kind === 'background'
                            ? `started background subagent task ${value.jobId}`
                            : value.kind === 'continuable'
                                ? `started subagent ${value.subagentId}`
                                : outputValueText(value.output),
                    }],
            },
            // Children never mutate the parent session; the one parent-owned write
            // (tasks.start) is a synchronous commutative insertion.
            isConcurrencySafe: () => true,
            async execute(args, exec) {
                const parent = exec.agent;
                if (!parent) {
                    // Non-agent callers provide no parent for delegation ownership.
                    throw new Error('subagent tool requires a calling agent (exec.agent was undefined)');
                }
                // A `team` session's delegation surface is `team_delegate`; the standard
                // `delegate`/`delegate_fork` tools are hidden from it (by the mode
                // restriction) and refused here as the authoritative gate, so a call
                // that reached the body anyway surfaces the right remedy. A sessionless
                // caller (a test harness, a non-agent driver) reads standard.
                if (parent.session !== undefined && currentTeamMode(parent.session.events).mode === 'team') {
                    throw new Error('此会话处于 Team 模式，请用 team_delegate');
                }
                // A named user-defined subagent is a whole tree mounted onto the child
                // in its creation window; the instance's persona/toolFilter are not
                // merged against it (the tree carries its own persona and tools).
                // Without a named subagent the instance's configured persona/toolFilter
                // apply. The subagent never touches the delegation ATTRIBUTES
                // (provider, maxDepth, background mode) — those stay the tool instance's.
                const maxDepth = typeof config.maxDepth === 'number' ? config.maxDepth : undefined;
                const instanceComposition = {
                    ...config.persona !== undefined ? { persona: config.persona } : {},
                    ...config.toolFilter !== undefined ? { toolFilter: config.toolFilter } : {},
                };
                const childSubagent = args.template === undefined
                    ? undefined
                    : await resolveSubagent(ctx, args.template);
                // A subagent was resolved, so the registry is live; refresh the model's
                // catalogue so a subagent authored since the last read is visible.
                if (childSubagent !== undefined)
                    refreshSubagentCatalogue();
                const request = {
                    label: args.description,
                    prompt: [{ type: 'text', text: args.prompt }],
                    parent,
                    ...config.agentOptions !== undefined ? { agentOptions: config.agentOptions } : {},
                    ...childSubagent !== undefined
                        ? { subagent: childSubagent }
                        : {
                            ...instanceComposition.persona !== undefined ? { persona: instanceComposition.persona } : {},
                            ...instanceComposition.toolFilter !== undefined ? { toolFilter: instanceComposition.toolFilter } : {},
                        },
                    ...maxDepth !== undefined ? { maxDepth } : {},
                };
                const runSpec = resolveDelegationRun(args, { backgroundEnabled, continuable });
                if (runSpec.runInBackground) {
                    if (continuable) {
                        // Resolves at inbox acceptance: the child owns its own turns from
                        // there, so this call neither waits for nor collects a result.
                        const started = await ctx.subagents.startContinuable({
                            provider: config.provider,
                            label: args.description,
                            // The official `ctx.subagents` seam is typed by `SubagentStartRequest`
                            // (no `subagent`); the harness service reads the field off the runtime
                            // object, so we hand it across under the official type.
                            request: request,
                            signal: exec.signal,
                        });
                        return { kind: 'continuable', subagentId: started.childId };
                    }
                    const jobs = ctx.get('jobs');
                    if (jobs === undefined) {
                        throw new Error('background jobs unavailable: load @deepseek-ai/dsh-jobs and @deepseek-ai/dsh-tool-jobs');
                    }
                    // One-shot background child: job preflight finishes before the
                    // starter can spawn, and the task-owned signal covers startup.
                    const id = jobs.start({
                        kind: 'subagent',
                        label: args.description,
                        owner: parent,
                        run: () => {
                            const controller = new AbortController();
                            const start = ctx.subagents.start(config.provider, { ...request, signal: controller.signal });
                            return {
                                cancel: (reason) => {
                                    controller.abort(reason ?? 'background subagent task killed');
                                },
                                done: settleStart(start, controller.signal),
                                // No readOutput: the child session owns intermediate detail.
                            };
                        },
                    });
                    return { kind: 'background', jobId: id };
                }
                const run = await ctx.subagents.start(config.provider, { ...request, signal: exec.signal });
                return settleForegroundRun(run);
            },
        }));
    };
    // Register listeners before checking presence so no synchronous change is missed.
    // TODO(subagent-dup-toolname): two waiting one-shot fibers configured with the
    // same toolName collide when their provider appears, and the duplicate-name
    // throw rolls back the provider registration. Continuable instances reserve
    // their prompt-section name during apply() and fail earlier. Add an intent
    // registry if the late one-shot collision occurs in a shipped composition.
    ctx.on('subagent/provider-added', (provider) => {
        if (provider.name === config.provider && disposeTool === undefined)
            mount(provider);
    });
    ctx.on('subagent/provider-removed', (name) => {
        if (name !== config.provider || disposeTool === undefined)
            return;
        disposeTool();
        disposeTool = undefined;
    });
    const present = ctx.subagents.getProvider(config.provider);
    if (present !== undefined) {
        mount(present);
    }
    else {
        // A backend fiber may activate later; a misspelled provider remains visible in this log.
        ctx.logger.info(`subagent provider "${config.provider}" not registered yet; the "${config.toolName ?? 'subagent'}" tool will register when it appears`);
    }
    if (backgroundEnabled && continuable) {
        // The section follows provider availability without its own manual
        // lifecycle: empty text is omitted from rendered prompts while the tool is
        // absent, and the registration itself stays owned by this plugin fiber.
        ctx.systemPrompt.section({
            name: `tool:${toolName}`,
            order: SUBAGENT_SECTION_ORDER,
            text: context => disposeTool === undefined || ctx.tools.get(toolName, context.scope) === undefined
                ? ''
                : `Use ${toolName} in the background by default. Start independent delegations together in one assistant message and continue useful work while they run. Set \`run_in_background: false\` only when your next action depends on that subagent's result. When a background run settles, the runtime sends you a notice containing its outcome and any final assistant message.`,
        });
    }
    // The subagent catalogue: when a subagent registry is composed, tell the
    // model which subagents it may name through the `template` parameter. Empty
    // when the registry is absent or supplies nothing, so a deployment without
    // subagents renders no extra guidance. Prompt-section text is synchronous,
    // so the registry (an async read) is cached here and refreshed whenever a
    // call resolves a subagent or the tool is mounted; a subagent authored while
    // the process runs becomes visible on the next refresh.
    ctx.systemPrompt.section({
        name: `tool:${toolName}:subagents`,
        order: SUBAGENT_SECTION_ORDER + 0.1,
        text: context => {
            // The bare subagent catalogue is the standard surface's helper list; a
            // `team` session must not see it (its delegation surface is the team's
            // role catalogue instead). A diagnostic assembly with no agent defaults
            // to standard, so existing prompts are unchanged.
            if (disposeTool === undefined || ctx.tools.get(toolName, context.scope) === undefined)
                return '';
            if (context.agent?.session !== undefined && currentTeamMode(context.agent.session.events).mode === 'team')
                return '';
            return subagentCatalogue;
        },
    });
    // Seed the catalogue now so a model-facing prompt assembled immediately after
    // this plugin mounts already lists any shipped subagents.
    refreshSubagentCatalogue();
}
//# sourceMappingURL=tool.js.map