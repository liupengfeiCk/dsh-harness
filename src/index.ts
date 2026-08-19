/**
 * dsh-harness-model-plan-bundle — the Harness-owned "模型方案" (model-plan)
 * capability as a profile bundle. The package's substance is
 * `cordis.patch.yml`, declared by the `dsh.bundle.patch` manifest field and
 * resolved by the profile composer through that field; this host half
 * registers the `modelPlans` service (the registry, the per-session selection
 * ledger, and the merge interceptor) and the `/model-plan` management wire.
 * @module dsh-harness-model-plan-bundle
 */

import { Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { Context } from '@deepseek-ai/cordis'
import type { SessionEvent, SessionId } from '@deepseek-ai/dsh-session'
// Type-only: `ctx.on('agent/created', ...)` and `agent.ctx.on('agent/request',
// ...)` are typed through the dsh-agent event map augmentation; this import
// brings those event signatures into the host program without any runtime use.
import type {} from '@deepseek-ai/dsh-agent'
import { dshHomePath } from './home-path.ts'
import {
  createPlan, deletePlan, setPlanDefault, updatePlan,
} from './authoring.ts'
import { discoverPlans, USER_PLAN_DIR } from './discovery.ts'
import { createMergeHandler } from './merge.ts'
import { currentPlanSelection, planLocked, type PlanSelectionState } from './selection.ts'
import {
  UnknownPlanError,
  type Config, type ModelPlan, type PlanParams, type PlanRoot,
} from './types.ts'

export { PLAN_FILE, discoverPlans, scanRoot, USER_PLAN_DIR } from './discovery.ts'
export {
  InvalidPlanIdError, PlanExistsError, PlanNotWritableError, PlanRouteInvalidError,
  createPlan, deletePlan, setPlanDefault, updatePlan, writableRoot,
} from './authoring.ts'
export { KNOWN_KEYS, createMergeHandler, mergePlanConfig } from './merge.ts'
export type { MergedCallConfig, ModelPlanMergeDeps } from './merge.ts'
export { currentPlanSelection, planLocked, NO_PLAN_SELECTION } from './selection.ts'
export type { PlanSelectionState } from './selection.ts'
export { PLAN_ID, UnknownPlanError } from './types.ts'
export type { Config, ModelPlan, PlanParams, PlanRoot, PlanTrust } from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    modelPlans: ModelPlans
  }

  interface Events {
    /**
     * A session's model-plan binding was selected or changed. Carries only the
     * stable folded identity (session id + plan id), never the live Session —
     * the same notification shape as the subagent team's mode-selected event.
     */
    'model-plan/selected'(sessionId: string, state: PlanSelectionState): void
  }
}

/**
 * Registry over the deployment's model plans, plus the per-session selection
 * ledger and the merge interceptor.
 *
 * Discovery is unmemoized: `list()` and `resolve()` re-read the roots on every
 * call so a plan authored while the process runs is visible immediately, and
 * the merge interceptor re-resolves the bound plan on every request so editing
 * a plan's file changes what a bound session uses on its NEXT request
 * (reference semantics — never retrofits the past).
 */
export class ModelPlans extends Service {
  /** Runtime schema for the plan registry. */
  static Config = z.object({
    roots: z.array(z.object({
      path: z.string().required(),
      trust: z.union(['system', 'user'] as const).default('user'),
    })).default([]),
    includeUserRoot: z.boolean().default(true),
  }) as z<Config>

  /** The roots discovery actually scans: configured roots, then the harness-home user root. */
  private readonly resolvedRoots: readonly PlanRoot[]

  constructor(ctx: Context, public config: Config) {
    super(ctx, 'modelPlans')
    this.resolvedRoots = config.includeUserRoot
      ? [...config.roots, { path: dshHomePath(USER_PLAN_DIR), trust: 'user' }]
      : [...config.roots]
    // The plan binding's durable record predates the agent: a blank session may
    // carry a `model-plan/select` event before its agent exists (the pick
    // happens on the new-conversation screen). When the agent is created, mount
    // the merge interceptor on the agent's scoped context so its requests fold
    // the record. A session that binds no plan runs zero-intervention on the
    // official route.
    ctx.on('agent/created', (payload) => {
      const agent = payload.agent
      agent.ctx.on('agent/request', createMergeHandler({
        selectionOf: (events) => currentPlanSelection(events as readonly SessionEvent[]),
        resolvePlan: (id) => this.resolveForMerge(id),
        logger: this.ctx.logger,
      }))
    })
  }

  /**
   * Every plan the configured roots currently supply.
   * @returns the plans, first-root-wins per id.
   */
  async list(): Promise<ModelPlan[]> {
    return discoverPlans(this.resolvedRoots)
  }

  /**
   * Whether this deployment composes a writable user root (the management
   * surface's authoring gate).
   */
  get authorable(): boolean {
    return this.resolvedRoots.some(root => root.trust === 'user')
  }

  /**
   * Resolve one plan by id.
   *
   * A broken plan resolves — deleting one, reading one, and reporting one all
   * need the row — and the selection/merge paths refuse it AFTER resolution.
   * @param id - the plan id.
   * @returns the resolved plan.
   * @throws when no configured root supplies that id.
   */
  async resolve(id: string): Promise<ModelPlan> {
    const plans = await this.list()
    const found = plans.find(plan => plan.id === id)
    if (found === undefined) {
      throw new UnknownPlanError(id, plans.map(plan => plan.id))
    }
    return found
  }

  /**
   * Resolve a plan for the MERGE interceptor: only the fields it needs, with
   * the plan's CURRENT file contents (reference semantics), and only when the
   * plan is usable. A missing or broken bound plan yields `undefined` — the
   * interceptor then logs and falls back to the official route rather than
   * failing the request.
   * @param id - the plan id.
   * @returns the plan's current route and params, or undefined when unusable.
   */
  private async resolveForMerge(id: string): Promise<{
    readonly provider: string
    readonly model: string
    readonly params: PlanParams
  } | undefined> {
    const plan = await this.resolve(id).catch(() => undefined)
    if (plan === undefined || plan.broken !== undefined) return undefined
    return { provider: plan.provider, model: plan.model, params: plan.params }
  }

  /**
   * Create a locally authored plan.
   * @param id - the new plan's id (its directory name).
   * @param edits - the plan's initial fields.
   * @returns the absolute path of the new plan directory.
   */
  async create(
    id: string,
    edits: {
      readonly name?: string
      readonly provider: string
      readonly model: string
      readonly params?: PlanParams
      readonly default?: boolean
    },
  ): Promise<string> {
    return createPlan(this.resolvedRoots, id, edits)
  }

  /**
   * Rewrite one locally authored plan.
   * @param id - the plan id.
   * @param edits - any subset of the plan's fields to replace.
   * @throws when the plan ships with the deployment, is unknown, or the route is unusable.
   */
  async update(
    id: string,
    edits: {
      readonly name?: string
      readonly provider?: string
      readonly model?: string
      readonly params?: PlanParams
      readonly default?: boolean
    },
  ): Promise<void> {
    const plan = await this.resolve(id)
    await updatePlan(this.resolvedRoots, plan, edits)
  }

  /**
   * Delete a locally authored plan.
   * @param id - the plan id.
   * @throws when the plan ships with the deployment or is unknown.
   */
  async remove(id: string): Promise<void> {
    const plan = await this.resolve(id)
    await deletePlan(this.resolvedRoots, plan)
  }

  /**
   * Make one locally authored plan the deployment default, clearing any other
   * user default.
   * @param id - the plan id.
   * @throws when the plan ships with the deployment or is unknown.
   */
  async setDefault(id: string): Promise<void> {
    const plan = await this.resolve(id)
    if (plan.broken !== undefined) {
      throw new Error(`model-plans: plan "${id}" cannot be the default: ${plan.broken}`)
    }
    await setPlanDefault(this.resolvedRoots, plan)
  }

  /**
   * Bind a session to a plan, recording the durable selection.
   *
   * The session is bound to a PLAN, never a bare model. The durable truth is a
   * log-only `model-plan/select` event marked `ignorable: true`; the merge
   * interceptor folds it on the session's next request. An optional session
   * `overrides` bag rides ABOVE the plan's own params in the merge priority.
   *
   * The binding (like the team mode and the agent preset) is locked once a turn
   * has run — the request the model already saw was produced under the previous
   * route, and swapping mid-flight would strand the logged call.
   * @param sessionId - the session to bind.
   * @param planId - the plan to bind.
   * @param overrides - session-level temporary params riding above the plan's.
   * @throws when the session has no live agent, has already started, or names a
   * broken/unknown plan.
   */
  async select(sessionId: SessionId, planId: string, overrides?: PlanParams): Promise<PlanSelectionState> {
    const session = this.ctx.get('sessions')?.get(sessionId)
    if (session === undefined) {
      throw new Error(`model-plans: no live session "${sessionId}"; cannot bind a plan to it`)
    }
    if (planLocked(session.events)) {
      throw new Error(`model-plans: session "${sessionId}" has already started; its plan binding is fixed`)
    }
    const plan = await this.resolve(planId)
    if (plan.broken !== undefined) {
      throw new Error(`model-plans: plan "${planId}" cannot be bound: ${plan.broken}`)
    }
    // The durable record is the commit point; the log states what the agent
    // runs, and the merge interceptor follows it.
    //
    // `model-plan/select` is a Harness-only event type that no first-party
    // reader knows, so it must be marked `ignorable: true`: the official
    // `coordinator.load` rejects any log carrying an unknown event type that is
    // NOT marked ignorable (see `assertEventsSupported`), which would refuse a
    // reopened plan-bound session. The flag declares that skipping this event
    // changes nothing about the interpretation of every other event — a reader
    // without this bundle simply replays the session on the official route.
    //
    // UPSTREAM-SYNC NOTE (type escape hatch): this harness depends on the npm
    // published `@deepseek-ai/dsh-session@0.1.0-rc.7`, whose `Session.append`
    // signature predates the upstream ignorable surface — the official
    // session-log-version-mechanism note reserves that surface for its first
    // writer, which is the subagent bundle (and this bundle after it). We
    // cannot repoint the harness dependency at the in-repo package, so we
    // escape the stale npm types here (compile-time only): a bundle never
    // constructs a Session, it calls the host instance's append, and the host
    // is the official CLI running the rebuilt in-repo session package whose
    // append DOES consume the trailing `ignorable` flag. So this bound append
    // is asserted to accept it; at runtime the third argument lands as
    // `ignorable: true` on the event.
    type AppendWithIgnorable = (type: string, data: Record<string, unknown>, ignorable?: true) => SessionEvent
    const appendIgnorable = session.append.bind(session) as unknown as AppendWithIgnorable
    appendIgnorable('model-plan/select', { planId, ...overrides === undefined ? {} : { overrides } }, true)
    const state = currentPlanSelection(session.events)
    this.ctx.emit('model-plan/selected', sessionId, state)
    return state
  }

  /**
   * Read a session's current folded plan selection.
   * @param sessionId - the session to read.
   * @returns the session's folded selection state (plan id + overrides), or
   * the empty selection when the session binds no plan.
   */
  async readSelection(sessionId: SessionId): Promise<PlanSelectionState> {
    const session = this.ctx.get('sessions')?.get(sessionId)
    if (session === undefined) return { overrides: {} }
    return currentPlanSelection(session.events)
  }
}

export default ModelPlans
