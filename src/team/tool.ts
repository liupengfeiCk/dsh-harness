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

import type { Context } from '@deepseek-ai/cordis'
import { getTraceable } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { AgentOptions } from '@deepseek-ai/dsh-agent'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import type { JsonValue } from '@deepseek-ai/dsh-session'
import { assertSubagentMaxDepth, settleRun } from '@deepseek-ai/dsh-subagent'
import type { SubagentProvider, SubagentResult, SubagentRun, SubagentStartRequest } from '@deepseek-ai/dsh-subagent'
import type { JobOutcome } from '@deepseek-ai/dsh-jobs'
import type {} from '@deepseek-ai/dsh-system-prompt'
// Type-only: make `ctx.get('teams')` resolve to the user-defined team registry
// when composed — a team tool resolves a role from its bound team
// opportunistically (the documented `ctx.get` pattern), never as a hard dep.
import type { Teams } from './index.ts'
// Type-only: make the optional subagent registry type resolve for the subagent
// health check carried by `Teams.resolveRole`.
import type {} from '../preset/index.ts'
import type { HarnessSubagentStartRequest } from '../in-process/request-types.ts'
// The session-level delegation surface: `team_delegate` is the team surface's
// tool and must refuse a `standard` session (whose delegation runs on
// `delegate`/`delegate_fork` instead).
import { currentTeamMode } from './mode.ts'

export const name = 'team-in-process-tool'
export const inject = ['tools', 'subagents', 'systemPrompt']

/** Prompt order after the bounded delegation policy and before child reporting. */
const TEAM_SECTION_ORDER = 116.5

/** Config: which team and provider this tool delegates to. */
export interface Config {
  /** The team id this instance serves. */
  team: string
  /** The `ctx.subagents` provider name to start runs on (e.g. `spawn`, `fork`). */
  provider: string
  /**
   * Model-facing tool name (default `team_delegate`). Each loaded instance must
   * use a distinct name.
   */
  toolName?: string
  /**
   * Expose `run_in_background` (default true). Applies to `one-shot` roles;
   * `persistent` roles always run as durable continuable children.
   */
  enableRunInBackground?: boolean
  /**
   * Agent options applied to every child; omitted fields use child-loop defaults.
   */
  agentOptions?: AgentOptions
  /**
   * Maximum child depth (default `3`; `0` forbids delegation), or
   * `'provider-managed'` to send no cap.
   */
  maxDepth?: number | 'provider-managed'
}

export const Config: z<Config> = z.object({
  team: z.string().required(),
  provider: z.string().required(),
  toolName: z.string().default('team_delegate'),
  enableRunInBackground: z.boolean().default(true),
  agentOptions: z.object({
    provider: z.string(),
    model: z.string(),
    maxTokens: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER),
  }).default(undefined as unknown as { provider: string; model: string; maxTokens: number }),
  maxDepth: z.union([z.natural().max(Number.MAX_SAFE_INTEGER), z.const('provider-managed' as const)]).default(3),
})

/** Render text blocks from the canonical JSON block array without trusting arbitrary values. */
function outputValueText(values: JsonValue[]): string {
  return values
    .filter((value): value is { type: 'text'; text: string } =>
      typeof value === 'object' && value !== null && !Array.isArray(value)
      && value.type === 'text' && typeof value.text === 'string')
    .map(value => value.text)
    .join('')
}

/** Settle pending startup without rejecting the task producer contract. */
async function settleStart(start: Promise<SubagentRun>, signal: AbortSignal): Promise<JobOutcome> {
  try {
    return await settleRun(await start)
  } catch (error: unknown) {
    return signal.aborted
      ? { status: 'killed' }
      : { status: 'failed', detail: String(error) }
  }
}

/** A non-`completed` stop reason means the child did not finish cleanly. */
function stopReasonError(result: SubagentResult): string | undefined {
  switch (result.stopReason) {
    case 'completed':
      return undefined
    case 'aborted':
      return 'team role run was cancelled'
    case 'error':
      return 'team role run failed'
    case 'max-tokens':
      return 'team role run hit its token limit before finishing'
    case 'refusal':
      return 'team role declined the task'
    default:
      return `team role run ended abnormally (${String(result.stopReason)})`
  }
}

/** Append the child's preserved partial answer to a stop-reason error. */
function withPartialText(error: string, output: ContentBlock[]): string {
  const text = output
    .filter((block): block is Extract<ContentBlock, { type: 'text' }> => block.type === 'text')
    .map(block => block.text)
    .join('')
  return text.length === 0 ? error : `${error}\nPartial output before the run ended:\n${text}`
}

type ForegroundToolResult = {
  readonly kind: 'foreground'
  readonly runId: SubagentRun['id']
  readonly output: JsonValue[]
}

/** Collect and release one foreground run without letting disposal replace an independent result failure. */
async function settleForegroundRun(run: SubagentRun): Promise<ForegroundToolResult> {
  const [execution] = await Promise.allSettled([
    run.result.then((result): ForegroundToolResult => {
      const error = stopReasonError(result)
      if (error !== undefined) {
        throw new Error(withPartialText(error, result.output))
      }
      return {
        kind: 'foreground',
        runId: run.id,
        output: result.output as unknown as JsonValue[],
      }
    }),
  ])
  const [disposal] = await Promise.allSettled([Promise.resolve().then(() => run.dispose())])
  if (execution.status === 'rejected') {
    if (disposal.status === 'rejected') {
      throw new AggregateError(
        [execution.reason, disposal.reason],
        `team role run failed: ${String(execution.reason)}; dispose failed: ${String(disposal.reason)}`,
      )
    }
    throw execution.reason
  }
  if (disposal.status === 'rejected') throw disposal.reason
  return execution.value
}

/** Model-facing wording for a team role child (spawn = self-contained, fork = inherits). */
function providerWording(inheritsConversation: boolean): { description: string; promptDescription: string } {
  if (inheritsConversation) {
    return {
      description:
        'Assign a task to a role on this team. The role runs as a child agent seeded with this conversation\'s '
        + 'completed turns, composed from the role\'s subagent (its capability surface) and prompt (its behaviour guide). '
        + 'You receive its result, not its intermediate steps.',
      promptDescription:
        'The task for the team role. It already sees this conversation\'s completed turns, so build on them freely and state only what is new.',
    }
  }
  return {
    description:
      'Assign a self-contained task to a role on this team. The role runs as a child agent composed from the role\'s '
      + 'subagent (its capability surface) and prompt (its behaviour guide), in its own context. You receive its result, '
      + 'not its intermediate steps. Give it a complete, standalone prompt: it does not see this conversation.',
    promptDescription:
      'The complete, self-contained task for the team role. It does not share this conversation\'s context, so include everything it needs.',
  }
}

interface DelegationRunRequest {
  readonly run_in_background?: boolean
}

interface DelegationRunSpec {
  readonly runInBackground: boolean
}

/** Resolve the model's optional scheduling request into one execution route. */
function resolveDelegationRun(
  request: DelegationRunRequest,
  options: { readonly backgroundEnabled: boolean },
): DelegationRunSpec {
  if (!options.backgroundEnabled) {
    if (request.run_in_background === true) {
      throw new Error('run_in_background is disabled for this tool instance (enableRunInBackground: false)')
    }
    return { runInBackground: false }
  }
  return { runInBackground: request.run_in_background ?? false }
}

/**
 * Resolve a role on the bound team, failing loud when the team or role is
 * unusable or the role's subagent is missing/broken/disabled.
 * @param teams - the team registry.
 * @param teamId - the bound team id.
 * @param roleId - the role the model named.
 * @returns the resolved, usable role.
 */
async function resolveRole(teams: Teams, teamId: string, roleId: string) {
  return await teams.resolveRole(teamId, roleId)
}

export function apply(ctx: Context, config: Config): void {
  if (config.maxDepth !== 'provider-managed') assertSubagentMaxDepth(config.maxDepth)
  const backgroundEnabled = config.enableRunInBackground !== false
  const toolName = config.toolName ?? 'team_delegate'
  let disposeTool: (() => void) | undefined
  // Synchronous model-facing catalogues, keyed by team id, refreshed by
  // {@link refreshRoleCatalogue} (see the `tool:<name>:roles` section). Lists
  // only non-broken roles; the bare subagent roster is never shown.
  const roleCatalogues = new Map<string, string>()
  /** Re-read the team roles into the synchronous prompt-section cache. */
  const refreshRoleCatalogue = (): void => {
    // The `teams` service and the `tools` registry may sit behind a cordis
    // shadow on a hot-mounted Include fiber (the shadow chains through
    // `ctx.extend` in the harness-hot wire and would otherwise make a bare
    // `ctx.get('teams')` or `ctx.tools.get(...)` miss). `getTraceable(ctx, ctx)`
    // strips the shadow back to the original fiber so a hot re-mount reads the
    // same service map a boot mount would — mirrors `HarnessHot.hostCtx()`.
    const traceableCtx = getTraceable(ctx, ctx) as Context
    const teams = traceableCtx.get('teams')
    if (teams === undefined) {
      roleCatalogues.clear()
      return
    }
    teams.list().then((rows) => {
      // The catalogue is keyed by team id, NOT by the tool's static
      // `config.team`. A deployment binds a session to its team through the
      // durable `subagent-team/mode` event (team id), while `config.team` is
      // only the tool row's static default (often left at the sample value);
      // filtering the roster by `config.team` would miss the session's actual
      // team and drop the catalogue to empty. The prompt section resolves the
      // per-session team id from the mode fold, so every composed team can be
      // listed here.
      roleCatalogues.clear()
      for (const team of rows) {
        // A missing, broken, or disabled team contributes no role catalogue —
        // the model must not be offered roles it cannot actually delegate to.
        if (team.broken !== undefined || team.metadata.enabled === false) continue
        const displayName = team.metadata.name ?? team.id
        const lines = team.roles
          .filter(role => role.broken === undefined)
          .map(role => `- ${role.id}: ${role.description ?? role.prompt ?? role.id}`)
        roleCatalogues.set(team.id, lines.length === 0
          ? ''
          : `You are on team "${displayName}" (id: ${team.id}). Its roles (pass one as the \`role\` argument to ${toolName} to compose that child from the role's subagent and prompt):\n${lines.join('\n')}`)
      }
    }).catch(() => {
      // A registry read failure leaves the last catalogue; never a broken prompt.
    })
  }
  const mount = (provider: SubagentProvider): void => {
    if (typeof config.maxDepth === 'number' && !provider.capabilities.depthLimit) {
      throw new Error(
        `team-tool: provider "${provider.name}" cannot enforce maxDepth (no depthLimit capability) — `
        + 'set maxDepth: \'provider-managed\' to leave the recursion budget to the provider',
      )
    }
    const wording = providerWording(provider.inheritsParentContext)
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
            type: 'boolean' as const,
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
        const parent = exec.agent
        if (!parent) {
          throw new Error('team tool requires a calling agent (exec.agent was undefined)')
        }
        // A `standard` session's delegation surface is `delegate`/`delegate_fork`;
        // `team_delegate` is hidden from it (by the mode restriction) and refused
        // here as the authoritative gate, so a call that reached the body anyway
        // surfaces the right remedy. A sessionless caller reads standard and is
        // refused.
        const state = parent.session === undefined ? undefined : currentTeamMode(parent.session.events)
        if (state === undefined || state.mode !== 'team' || state.team === undefined) {
          throw new Error('此会话未处于 Team 模式，请用 delegate')
        }
        // The team id comes from the session's OWN folded mode, NOT the tool
        // row's static `config.team` default. A deployment binds a session to a
        // team through the `subagent-team/mode` event (e.g. "demo"), while the
        // tool row default ("my-team") never matches a real roster — resolving
        // by `config.team` here would reject every delegation with "team X not
        // found". The prompt-section catalogue is keyed the same way, so what
        // the model sees and what `team_delegate` executes stay in lockstep.
        const teamId = state.team
        const teams = (getTraceable(ctx, ctx) as Context).get('teams')
        if (teams === undefined) {
          throw new Error(
            `team-tool: team "${teamId}" requested but no team registry is loaded `
            + '(load dsh-harness-subagent-bundle/team in the host composition)',
          )
        }
        // Resolve the role; failing loud surfaces a bad pick (unknown team/role,
        // or a role whose subagent is missing/broken/disabled) at the call.
        const role = await resolveRole(teams, teamId, args.role)
        refreshRoleCatalogue()

        const maxDepth = typeof config.maxDepth === 'number' ? config.maxDepth : undefined
        // The request composes the child from BOTH the role's subagent (a
        // subagent id mounted onto the child) and its prompt (a persona
        // injected as the child's shadowing persona). The team/role identity
        // rides along so a persistent child's descriptor can re-resolve the
        // latest definition.
        const request: Omit<HarnessSubagentStartRequest, 'signal' | 'outputSchema'> = {
          label: args.description,
          prompt: [{ type: 'text', text: args.prompt }] as ContentBlock[],
          parent,
          ...config.agentOptions !== undefined ? { agentOptions: config.agentOptions } : {},
          ...role.subagent !== '' ? { subagent: role.subagent } : {},
          ...role.prompt !== undefined ? { persona: role.prompt } : {},
          ...{ team: teamId, role: role.id },
          ...maxDepth !== undefined ? { maxDepth } : {},
        }

        // Memory policy decides the execution route: one-shot roles start a
        // fresh (foreground or background) child; persistent roles start a
        // durable continuable child that keeps its conversation.
        if (role.memory === 'persistent') {
          const started = await ctx.subagents.startContinuable({
            provider: config.provider,
            label: args.description,
            request: request as Omit<SubagentStartRequest, 'label' | 'signal' | 'outputSchema'>,
            signal: exec.signal,
          })
          return { kind: 'continuable' as const, subagentId: started.childId }
        }

        const runSpec = resolveDelegationRun(args, { backgroundEnabled })
        if (runSpec.runInBackground) {
          const jobs = ctx.get('jobs')
          if (jobs === undefined) {
            throw new Error('background jobs unavailable: load @deepseek-ai/dsh-jobs and @deepseek-ai/dsh-tool-jobs')
          }
          const id = jobs.start({
            kind: 'subagent',
            label: args.description,
            owner: parent,
            run: () => {
              const controller = new AbortController()
              const start = ctx.subagents.start(
                config.provider,
                { ...request, signal: controller.signal } as SubagentStartRequest,
              )
              return {
                cancel: (reason?: string) => {
                  controller.abort(reason ?? 'background team role task killed')
                },
                done: settleStart(start, controller.signal),
              }
            },
          })
          return { kind: 'background' as const, jobId: id }
        }

        const run: SubagentRun = await ctx.subagents.start(
          config.provider,
          { ...request, signal: exec.signal } as SubagentStartRequest,
        )
        return settleForegroundRun(run)
      },
    }))
  }

  ctx.on('subagent/provider-added', (provider) => {
    if (provider.name === config.provider && disposeTool === undefined) mount(provider)
  })
  ctx.on('subagent/provider-removed', (name) => {
    if (name !== config.provider || disposeTool === undefined) return
    disposeTool()
    disposeTool = undefined
  })
  const present = ctx.subagents.getProvider(config.provider)
  if (present !== undefined) {
    mount(present)
  } else {
    ctx.logger.info(`subagent provider "${config.provider}" not registered yet; the "${toolName}" tool will register when it appears`)
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
      // The team role catalogue is the team surface's helper list; a standard
      // session must not see it (its delegation surface is the bare subagent
      // catalogue instead). A diagnostic assembly with no agent defaults to
      // standard, so existing prompts are unchanged.
      // The `disposeTool` flag is the live registration check (set when the
      // tool is registered against its provider fiber; cleared on provider
      // removal). We do NOT route through `ctx.tools.get(toolName, scope)`:
      // the tools registry in a hot-mounted Include fiber does not reach the
      // host-plane `context.scope`, so the cross-tree lookup silently misses
      // and the section would collapse to '' even when the tool is in fact
      // visible to the agent. The team-mode check below is the authoritative
      // gate (mode restrictions keep `team_delegate` and remove `delegate`/
      // `delegate_fork` for team sessions).
      if (disposeTool === undefined) return ''
      if (context.agent === undefined) return ''
      // Resolve the catalogue by the session's OWN folded team id. The mode
      // event carries the team a deployment actually bound to this session
      // (e.g. "demo"), which may differ from the tool row's static
      // `config.team` default — keying by the fold keeps the two in step.
      const state = currentTeamMode(context.agent.session.events)
      if (state.mode !== 'team' || state.team === undefined) return ''
      return roleCatalogues.get(state.team) ?? ''
    },
  })
  // Kick the catalogue once now (the common ordering has the team registry
  // already composed), then again whenever the `teams` service (re)appears. The
  // second listener closes the loader-race the one-shot kick cannot cover: the
  // tool row may apply before the `teams` row constructs its service, and the
  // section text is assembled synchronously, so without a service-change hook
  // the catalogue would stay empty forever (the model would never see the team
  // or its roles). `{ global: true }` mirrors the package's preset invariant
  // companion so a team service provided from a sibling fiber still notifies us.
  refreshRoleCatalogue()
  ctx.on('internal/service', function (serviceName) {
    if (serviceName !== 'teams') return
    refreshRoleCatalogue()
  }, { global: true })
}
