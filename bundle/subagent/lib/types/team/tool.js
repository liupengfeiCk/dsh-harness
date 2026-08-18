/**
 * Model-facing TEAM delegation through one configured `ctx.subagents` provider.
 *
 * A team tool instance is bound to ONE team (the roster of roles a user built
 * ahead of time). The model picks a `role` from that team's catalogue; the tool
 * resolves the role's subagent (a user-defined subagent id — the hard
 * capability boundary) and prompt (the role's own prompt — the soft behaviour
 * guide), and starts a child through `ctx.subagents` composed from both.
 *
 * Two memory policies decide the execution route:
 * - `one-shot` roles start a fresh child every call (foreground by default,
 *   background as a collectable job) and dissolve after the task.
 * - `persistent` roles start a durable continuable child through
 *   `startContinuable`, persisting `{ team, role }` in the descriptor so a cold
 *   resume re-resolves the role from the team's latest definition (reference
 *   semantics) and re-injects its prompt persona + subagent tree.
 *
 * In team form the main agent sees ONLY the team's role catalogue — never the
 * bare subagent roster. That is a COMPOSITION CONVENTION, not hidden logic: a
 * team-shaped deployment mounts this `team_delegate` row and simply does not
 * mount the plain `delegate`/`subagent` rows, so the subagent catalogue never
 * reaches the model. See the README team chapter.
 * @module dsh-harness-subagent-bundle/team/tool
 */
import z from '@deepseek-ai/schemastery';
import { defineTool } from '@deepseek-ai/dsh-tools';
import { assertSubagentMaxDepth, settleRun } from '@deepseek-ai/dsh-subagent';
export const name = 'team-in-process-tool';
export const inject = ['tools', 'subagents', 'systemPrompt'];
/** Prompt order after the bounded delegation policy and before child reporting. */
const TEAM_SECTION_ORDER = 116.5;
export const Config = z.object({
    team: z.string().required(),
    provider: z.string().required(),
    toolName: z.string().default('team_delegate'),
    enableRunInBackground: z.boolean().default(true),
    agentOptions: z.object({
        provider: z.string(),
        model: z.string(),
        maxTokens: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER),
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
            return 'team role run was cancelled';
        case 'error':
            return 'team role run failed';
        case 'max-tokens':
            return 'team role run hit its token limit before finishing';
        case 'refusal':
            return 'team role declined the task';
        default:
            return `team role run ended abnormally (${String(result.stopReason)})`;
    }
}
/** Append the child's preserved partial answer to a stop-reason error. */
function withPartialText(error, output) {
    const text = output
        .filter((block) => block.type === 'text')
        .map(block => block.text)
        .join('');
    return text.length === 0 ? error : `${error}\nPartial output before the run ended:\n${text}`;
}
/** Collect and release one foreground run without letting disposal replace an independent result failure. */
async function settleForegroundRun(run) {
    const [execution] = await Promise.allSettled([
        run.result.then((result) => {
            const error = stopReasonError(result);
            if (error !== undefined) {
                throw new Error(withPartialText(error, result.output));
            }
            return {
                kind: 'foreground',
                runId: run.id,
                output: result.output,
            };
        }),
    ]);
    const [disposal] = await Promise.allSettled([Promise.resolve().then(() => run.dispose())]);
    if (execution.status === 'rejected') {
        if (disposal.status === 'rejected') {
            throw new AggregateError([execution.reason, disposal.reason], `team role run failed: ${String(execution.reason)}; dispose failed: ${String(disposal.reason)}`);
        }
        throw execution.reason;
    }
    if (disposal.status === 'rejected')
        throw disposal.reason;
    return execution.value;
}
/** Model-facing wording for a team role child (spawn = self-contained, fork = inherits). */
function providerWording(inheritsConversation) {
    if (inheritsConversation) {
        return {
            description: 'Assign a task to a role on this team. The role runs as a child agent seeded with this conversation\'s '
                + 'completed turns, composed from the role\'s subagent (its capability surface) and prompt (its behaviour guide). '
                + 'You receive its result, not its intermediate steps.',
            promptDescription: 'The task for the team role. It already sees this conversation\'s completed turns, so build on them freely and state only what is new.',
        };
    }
    return {
        description: 'Assign a self-contained task to a role on this team. The role runs as a child agent composed from the role\'s '
            + 'subagent (its capability surface) and prompt (its behaviour guide), in its own context. You receive its result, '
            + 'not its intermediate steps. Give it a complete, standalone prompt: it does not see this conversation.',
        promptDescription: 'The complete, self-contained task for the team role. It does not share this conversation\'s context, so include everything it needs.',
    };
}
/** Resolve the model's optional scheduling request into one execution route. */
function resolveDelegationRun(request, options) {
    if (!options.backgroundEnabled) {
        if (request.run_in_background === true) {
            throw new Error('run_in_background is disabled for this tool instance (enableRunInBackground: false)');
        }
        return { runInBackground: false };
    }
    return { runInBackground: request.run_in_background ?? false };
}
/**
 * Resolve a role on the bound team, failing loud when the team or role is
 * unusable or the role's subagent is missing/broken/disabled.
 * @param teams - the team registry.
 * @param teamId - the bound team id.
 * @param roleId - the role the model named.
 * @returns the resolved, usable role.
 */
async function resolveRole(teams, teamId, roleId) {
    return await teams.resolveRole(teamId, roleId);
}
export function apply(ctx, config) {
    if (config.maxDepth !== 'provider-managed')
        assertSubagentMaxDepth(config.maxDepth);
    const backgroundEnabled = config.enableRunInBackground !== false;
    const toolName = config.toolName ?? 'team_delegate';
    let disposeTool;
    // Synchronous model-facing catalogue of the bound team's roles, refreshed by
    // {@link refreshRoleCatalogue} (see the `tool:<name>:roles` section). Lists
    // only non-broken roles; the bare subagent roster is never shown.
    let roleCatalogue = '';
    /** Re-read the team's roles into the synchronous prompt-section cache. */
    const refreshRoleCatalogue = () => {
        const teams = ctx.get('teams');
        if (teams === undefined) {
            roleCatalogue = '';
            return;
        }
        teams.list().then((rows) => {
            const team = rows.find(row => row.id === config.team);
            // A missing, broken, or disabled team contributes no role catalogue — the
            // model must not be offered roles it cannot actually delegate to.
            if (team === undefined || team.broken !== undefined || team.metadata.enabled === false) {
                roleCatalogue = '';
                return;
            }
            const lines = team.roles
                .filter(role => role.broken === undefined)
                .map(role => `- ${role.id}: ${role.description ?? role.prompt ?? role.id}`);
            roleCatalogue = lines.length === 0
                ? ''
                : `Team "${team.id}" roles (pass one as the \`role\` argument to ${toolName} to compose that child from the role's subagent and prompt):\n${lines.join('\n')}`;
        }).catch(() => {
            // A registry read failure leaves the last catalogue; never a broken prompt.
        });
    };
    const mount = (provider) => {
        if (typeof config.maxDepth === 'number' && !provider.capabilities.depthLimit) {
            throw new Error(`team-tool: provider "${provider.name}" cannot enforce maxDepth (no depthLimit capability) — `
                + 'set maxDepth: \'provider-managed\' to leave the recursion budget to the provider');
        }
        const wording = providerWording(provider.inheritsParentContext);
        disposeTool = ctx.tools.register(defineTool({
            name: toolName,
            description: wording.description + (backgroundEnabled
                ? ' One-shot roles wait for the result by default (set `run_in_background: true` to return a job id; collect with `job_output` and stop with `job_kill`). Persistent roles always run as durable children that keep their conversation for later turns; the runtime sends you a notice when they settle, and `send_message` continues them.'
                : ' One-shot roles wait for the result. Persistent roles always run as durable children that keep their conversation for later turns.'),
            parameters: {
                description: {
                    type: 'string',
                    required: true,
                    description: 'A short (3-5 word) description of the assigned task, for display.',
                },
                prompt: {
                    type: 'string',
                    required: true,
                    description: wording.promptDescription,
                },
                role: {
                    type: 'string',
                    required: true,
                    description: 'The team role to assign this task to. The role catalogue is listed in the system prompt.',
                },
                ...backgroundEnabled ? {
                    run_in_background: {
                        type: 'boolean',
                        description: 'Whether a one-shot role runs as a background job (defaults to false). Ignored for persistent roles, which are always durable.',
                    },
                } : {},
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
                            ? `started background team role task ${value.jobId}`
                            : value.kind === 'continuable'
                                ? `started persistent team role ${value.subagentId}`
                                : outputValueText(value.output),
                    }],
            },
            isConcurrencySafe: () => true,
            async execute(args, exec) {
                const parent = exec.agent;
                if (!parent) {
                    throw new Error('team tool requires a calling agent (exec.agent was undefined)');
                }
                const teams = ctx.get('teams');
                if (teams === undefined) {
                    throw new Error(`team-tool: team "${config.team}" requested but no team registry is loaded `
                        + '(load dsh-harness-subagent-bundle/team in the host composition)');
                }
                // Resolve the role; failing loud surfaces a bad pick (unknown team/role,
                // or a role whose subagent is missing/broken/disabled) at the call.
                const role = await resolveRole(teams, config.team, args.role);
                refreshRoleCatalogue();
                const maxDepth = typeof config.maxDepth === 'number' ? config.maxDepth : undefined;
                // The request composes the child from BOTH the role's subagent (a
                // subagent id mounted onto the child) and its prompt (a persona
                // injected as the child's shadowing persona). The team/role identity
                // rides along so a persistent child's descriptor can re-resolve the
                // latest definition.
                const request = {
                    label: args.description,
                    prompt: [{ type: 'text', text: args.prompt }],
                    parent,
                    ...config.agentOptions !== undefined ? { agentOptions: config.agentOptions } : {},
                    ...role.subagent !== '' ? { subagent: role.subagent } : {},
                    ...role.prompt !== undefined ? { persona: role.prompt } : {},
                    ...{ team: config.team, role: role.id },
                    ...maxDepth !== undefined ? { maxDepth } : {},
                };
                // Memory policy decides the execution route: one-shot roles start a
                // fresh (foreground or background) child; persistent roles start a
                // durable continuable child that keeps its conversation.
                if (role.memory === 'persistent') {
                    const started = await ctx.subagents.startContinuable({
                        provider: config.provider,
                        label: args.description,
                        request: request,
                        signal: exec.signal,
                    });
                    return { kind: 'continuable', subagentId: started.childId };
                }
                const runSpec = resolveDelegationRun(args, { backgroundEnabled });
                if (runSpec.runInBackground) {
                    const jobs = ctx.get('jobs');
                    if (jobs === undefined) {
                        throw new Error('background jobs unavailable: load @deepseek-ai/dsh-jobs and @deepseek-ai/dsh-tool-jobs');
                    }
                    const id = jobs.start({
                        kind: 'subagent',
                        label: args.description,
                        owner: parent,
                        run: () => {
                            const controller = new AbortController();
                            const start = ctx.subagents.start(config.provider, { ...request, signal: controller.signal });
                            return {
                                cancel: (reason) => {
                                    controller.abort(reason ?? 'background team role task killed');
                                },
                                done: settleStart(start, controller.signal),
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
        ctx.logger.info(`subagent provider "${config.provider}" not registered yet; the "${toolName}" tool will register when it appears`);
    }
    // The team role catalogue: when a team registry is composed, tell the model
    // which roles it may name through the `role` parameter on the bound team. The
    // main agent sees ONLY these roles — never the bare subagent roster, which is
    // kept out by the composition convention (a team deployment mounts this tool
    // and not the plain delegate/subagent rows).
    ctx.systemPrompt.section({
        name: `tool:${toolName}:roles`,
        order: TEAM_SECTION_ORDER + 0.1,
        text: context => {
            if (disposeTool === undefined || ctx.tools.get(toolName, context.scope) === undefined)
                return '';
            return roleCatalogue;
        },
    });
    refreshRoleCatalogue();
}
//# sourceMappingURL=tool.js.map