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
import { getTraceable } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import { defineTool } from '@deepseek-ai/dsh-tools';
import { assertSubagentMaxDepth, settleRun } from '@deepseek-ai/dsh-subagent';
import { foldHarnessSubagentDescriptor } from "../in-process/descriptor.js";
// The session-level delegation surface: `team_delegate` is the team surface's
// tool and must refuse a `standard` session (whose delegation runs on
// `delegate`/`delegate_fork` instead).
import { currentTeamMode, STANDARD_TOOLS } from "./mode.js";
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
/**
 * Resolve WHO is delegating, from the caller's OWN session identity — NOT the
 * main session's mode event. A team-role child (persistent OR one-shot) is
 * identified by folding its own harness descriptor, which carries the
 * `{ team, role }` identity persisted at composition; its level comes from the
 * team's current registry. The main agent (the boss) has no subagent descriptor
 * and is identified by its session's folded team mode. Any other caller (a
 * standard-mode subagent, an unidentifiable child) resolves to `undefined` and
 * is refused by the gate (fail closed).
 * @param teams - the team registry, for role level lookups.
 * @param parent - the calling agent.
 * @returns the caller's team identity, or undefined when not a valid team caller.
 */
async function resolveCallerIdentity(teams, parent) {
    // 1. A team-role child folds its OWN descriptor identity.
    if (parent.session !== undefined) {
        const descriptor = foldHarnessSubagentDescriptor(parent.session.events);
        if (descriptor !== undefined && descriptor.team !== undefined && descriptor.role !== undefined) {
            // An un-resolvable role means the caller is not a usable team-role child —
            // refuse (fail closed) rather than assume an unproven level.
            const role = await teams.resolveRoleDefinition(descriptor.team, descriptor.role).catch(() => undefined);
            if (role === undefined || role.broken !== undefined)
                return undefined;
            return { teamId: descriptor.team, level: role.level, kind: 'role' };
        }
    }
    // 2. Otherwise the main agent (boss) is identified by its session's team mode.
    const state = parent.session === undefined ? undefined : currentTeamMode(parent.session.events);
    if (state !== undefined && state.mode === 'team' && state.team !== undefined) {
        return { teamId: state.team, level: Number.POSITIVE_INFINITY, kind: 'boss' };
    }
    return undefined;
}
export function apply(ctx, config) {
    if (config.maxDepth !== 'provider-managed')
        assertSubagentMaxDepth(config.maxDepth);
    const backgroundEnabled = config.enableRunInBackground !== false;
    const toolName = config.toolName ?? 'team_delegate';
    let disposeTool;
    /** A team's display name (metadata name or id) plus its role rows. */
    const teamDisplayNames = new Map();
    const rosters = new Map();
    /** Re-read the team roles into the synchronous prompt-section cache. */
    const refreshRoleCatalogue = () => {
        // The `teams` service and the `tools` registry may sit behind a cordis
        // shadow on a hot-mounted Include fiber (the shadow chains through
        // `ctx.extend` in the harness-hot wire and would otherwise make a bare
        // `ctx.get('teams')` or `ctx.tools.get(...)` miss). `getTraceable(ctx, ctx)`
        // strips the shadow back to the original fiber so a hot re-mount reads the
        // same service map a boot mount would — mirrors `HarnessHot.hostCtx()`.
        const traceableCtx = getTraceable(ctx, ctx);
        const teams = traceableCtx.get('teams');
        if (teams === undefined) {
            // Keep the last-known-good catalogue instead of clearing it: a transient
            // service absence (loader race, hot re-mount) must not blank the prompt
            // section — the authority table would otherwise toggle in/out between
            // requests, breaking the LLM prefix cache for a multi-turn role. Only a
            // genuine re-read replaces it.
            return;
        }
        teams.list().then((rows) => {
            // Build the next catalogue FIRST, then atomically swap. The live
            // `rosters`/`teamDisplayNames` maps never hold a partially-read or empty
            // state, so a request assembled while a refresh is in flight sees either
            // the previous stable snapshot or the freshly-read one — never a blank
            // in between. The catalogue is keyed by team id, NOT by the tool's static
            // `config.team`. A deployment binds a session to its team through the
            // durable `subagent-team/mode` event (team id), while `config.team` is
            // only the tool row's static default (often left at the sample value);
            // filtering the roster by `config.team` would miss the session's actual
            // team and drop the catalogue to empty. The prompt section resolves the
            // per-session team id from the mode fold, so every composed team can be
            // listed here.
            const nextRosters = new Map();
            const nextTeamDisplayNames = new Map();
            for (const team of rows) {
                // A missing, broken, or disabled team contributes no roster — the model
                // must not be offered roles it cannot actually delegate to.
                if (team.broken !== undefined || team.metadata.enabled === false)
                    continue;
                nextTeamDisplayNames.set(team.id, team.metadata.name ?? team.id);
                nextRosters.set(team.id, team.roles
                    .filter(role => role.broken === undefined)
                    .map(role => ({
                    id: role.id,
                    ...role.description !== undefined ? { description: role.description } : {},
                    level: role.level,
                })));
            }
            // Swap only when the fresh read is non-empty, or the cache is still empty
            // (first settle). A transient empty read must not blank an already
            // rendered roster: the prompt section output for a session is monotonic
            // once non-empty, which is what keeps the request prefix byte-stable.
            if (nextRosters.size > 0 || rosters.size === 0) {
                rosters.clear();
                teamDisplayNames.clear();
                for (const [teamId, name] of nextTeamDisplayNames)
                    teamDisplayNames.set(teamId, name);
                for (const [teamId, rowsFor] of nextRosters)
                    rosters.set(teamId, rowsFor);
            }
        }).catch(() => {
            // A registry read failure leaves the last roster; never a broken prompt.
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
                ? ' One-shot roles wait for the result by default (set `run_in_background: true` to return a job id; collect with `job_output` and stop with `job_kill`). Persistent roles are NOT jobs: they always run as durable children that keep their conversation for later turns, so do NOT wait on them with `job_output` — the runtime sends you a notice when they report or settle, and `send_message` continues them.'
                : ' One-shot roles wait for the result. Persistent roles always run as durable children that keep their conversation for later turns, so do NOT wait on them with `job_output` — the runtime sends you a notice when they settle, and `send_message` continues them.'),
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
                // Execution gate (rule 3). Resolve WHO is delegating from the caller's
                // OWN session identity — a team-role child folds its own descriptor (its
                // level comes from the team registry); the boss (main agent) is
                // identified by its session's folded team mode and is the top,
                // unrestricted level. Any other caller is refused (fail closed).
                const teams = getTraceable(ctx, ctx).get('teams');
                if (teams === undefined) {
                    throw new Error('team-tool: no team registry is loaded '
                        + '(load dsh-harness-subagent-bundle/team in the host composition)');
                }
                const caller = await resolveCallerIdentity(teams, parent);
                if (caller === undefined) {
                    // A `standard` session's delegation surface is `delegate`/`delegate_fork`;
                    // `team_delegate` is hidden from it (by the mode restriction) and refused
                    // here as the authoritative gate. A sessionless caller reads standard
                    // and is refused.
                    throw new Error('此会话未处于 Team 模式，请用 delegate');
                }
                // The team id comes from the caller's OWN identity (the boss's session
                // team-mode fold, or a team-role child's descriptor), NOT the tool row's
                // static `config.team` default — resolving by `config.team` would miss
                // the session's actual team. The prompt-section roster is keyed the same
                // way, so what the model sees and what `team_delegate` executes stay in
                // lockstep, and the "same team only" rule is enforced by construction.
                const teamId = caller.teamId;
                // Resolve the target role; failing loud surfaces a bad pick (unknown
                // team/role, or a role whose subagent is missing/broken/disabled).
                const role = await resolveRole(teams, teamId, args.role);
                refreshRoleCatalogue();
                // Strictly-decreasing-level ordering prevents delegation cycles: the
                // caller's level must be STRICTLY greater than the target role's level.
                // The boss (unrestricted top level) can delegate any role on its own
                // team, cross-level free. Same-level roles cannot delegate each other
                // (a strict `>` test, not `>=`). The existing `maxDepth` cap stays as a
                // second line of defence.
                if (caller.kind !== 'boss' && role.level >= caller.level) {
                    throw new Error(`委派被拒：目标角色 "${role.id}" 的级别 ${role.level} 不低于调用者级别 ${caller.level}，`
                        + '须严格递减（同级不可互派）');
                }
                const maxDepth = typeof config.maxDepth === 'number' ? config.maxDepth : undefined;
                // Issuance gate (rule 2). The team tool is a HOST tool that does not
                // propagate to subagent children on its own, so it is explicitly granted
                // per level:
                //   - a level >= 2 role child is granted `team_delegate` (mounted onto
                //     its own scope via the teamDelegation composition field) and denied
                //     the STANDARD delegation tools, so its only delegation surface is
                //     the team one (same convention as the boss in team mode);
                //   - a level-1 role child is denied both `team_delegate` and the
                //     standard delegation tools — it can only be delegated to, never
                //     delegate.
                // The filter is persisted in the child's descriptor (rule 2 cold path)
                // and the grant is re-derived on resume from the role's CURRENT level.
                const denySet = [...STANDARD_TOOLS, ...(role.level < 2 ? [toolName] : [])];
                const toolFilter = { deny: denySet };
                const teamDelegation = role.level >= 2
                    ? { team: teamId, provider: config.provider, toolName }
                    : undefined;
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
                    ...{ team: teamId, role: role.id },
                    ...toolFilter,
                    ...teamDelegation !== undefined ? { teamDelegation } : {},
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
    // The reader-aware team authority table (rule 4): who sees what is derived
    // from the reader's OWN identity, always consistent with the gates.
    //   - the BOSS (main agent, team mode) sees every role on the team, each with
    //     its level;
    //   - a level >= 2 role sees its own team/role/level and the subordinates it
    //     may delegate to (roles strictly below it);
    //   - a level 1 role sees no delegation page at all.
    // The bare subagent roster is never shown (composition convention). The
    // `disposeTool` flag is the live registration check — we do NOT route through
    // `ctx.tools.get(toolName, scope)`, which silently misses across a hot-mounted
    // Include fiber; the authoritative gate is the identity checks below.
    ctx.systemPrompt.section({
        name: `tool:${toolName}:roles`,
        order: TEAM_SECTION_ORDER + 0.1,
        text: context => {
            if (disposeTool === undefined)
                return '';
            if (context.agent === undefined || context.agent.session === undefined)
                return '';
            // A team-role child (persistent or one-shot) is identified by its own
            // descriptor fold; the roster cache holds its level. The main agent has
            // no such descriptor and falls through to the team-mode check below.
            const descriptor = foldHarnessSubagentDescriptor(context.agent.session.events);
            if (descriptor !== undefined && descriptor.team !== undefined && descriptor.role !== undefined) {
                const roster = rosters.get(descriptor.team);
                const self = roster?.find(row => row.id === descriptor.role);
                const selfLevel = self?.level;
                // Unresolvable identity (role gone/broken) or a level-1 role: no
                // authority page — a level-1 role can only be delegated to (rule 4).
                if (selfLevel === undefined || selfLevel < 2)
                    return '';
                const displayName = teamDisplayNames.get(descriptor.team) ?? descriptor.team;
                const subordinates = roster.filter(row => row.level < selfLevel);
                const subLines = subordinates.map(row => `- ${row.id} (level ${row.level}): ${row.description ?? row.id}`);
                const header = `You are on team "${displayName}" (id: ${descriptor.team}), you are the role "${descriptor.role}" (level ${selfLevel}). `
                    + `You may delegate to the following lower-level roles on this team (pass one as the \`role\` argument to ${toolName}); `
                    + 'you receive its result, not its intermediate steps:';
                return subLines.length === 0
                    ? `${header}\n(none — every other role on this team is at or above your level)`
                    : `${header}\n${subLines.join('\n')}`;
            }
            // The main agent (boss) sees the full roster with every role's level. A
            // standard-mode session sees nothing (its surface is the bare subagent
            // catalogue), and a diagnostic assembly with no team mode defaults to
            // standard, so existing prompts are unchanged.
            const state = currentTeamMode(context.agent.session.events);
            if (state.mode !== 'team' || state.team === undefined)
                return '';
            const roster = rosters.get(state.team);
            if (roster === undefined)
                return '';
            const displayName = teamDisplayNames.get(state.team) ?? state.team;
            const lines = roster.map(row => `- ${row.id} (level ${row.level}): ${row.description ?? row.id}`);
            return lines.length === 0
                ? ''
                : `You are on team "${displayName}" (id: ${state.team}). Its roles and levels (pass one as the \`role\` argument to ${toolName} to compose that child from the role's subagent and prompt):\n${lines.join('\n')}`;
        },
    });
    // Kick the catalogue once now (the common ordering has the team registry
    // already composed), then again whenever the `teams` service (re)appears. The
    // second listener closes the loader-race the one-shot kick cannot cover: the
    // tool row may apply before the `teams` row constructs its service, and the
    // section text is assembled synchronously, so without a service-change hook
    // the catalogue would stay empty forever (the model would never see the team
    // or its roles). `{ global: true }` mirrors the package's preset invariant
    // companion so a team service provided from a sibling fiber still notifies us.
    refreshRoleCatalogue();
    ctx.on('internal/service', function (serviceName) {
        if (serviceName !== 'teams')
            return;
        refreshRoleCatalogue();
    }, { global: true });
}
//# sourceMappingURL=tool.js.map