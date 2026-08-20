/**
 * dsh-harness-model-plan-bundle — the Harness-owned "模型方案" (model-plan)
 * capability as a profile bundle. The package's substance is
 * `cordis.patch.yml`, declared by the `dsh.bundle.patch` manifest field and
 * resolved by the profile composer through that field; this host half
 * registers the `modelPlans` service (the registry, the per-session selection
 * ledger, and the merge interceptor) and the `/model-plan` management wire.
 * @module dsh-harness-model-plan-bundle
 */
import { Service } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import { dshHomePath } from "./home-path.js";
import { createPlan, deletePlan, setPlanDefault, updatePlan, } from "./authoring.js";
import { discoverPlans, USER_PLAN_DIR } from "./discovery.js";
import { createMergeHandler } from "./merge.js";
import { currentPlanSelection, planLocked } from "./selection.js";
import { PlanLockedError, UnknownPlanError, } from "./types.js";
export { PLAN_FILE, discoverPlans, scanRoot, USER_PLAN_DIR } from "./discovery.js";
export { InvalidPlanIdError, PlanExistsError, PlanNotWritableError, PlanRouteInvalidError, createPlan, deletePlan, setPlanDefault, updatePlan, writableRoot, } from "./authoring.js";
export { createMergeHandler, mergePlanConfig } from "./merge.js";
export { currentPlanSelection, planLocked, NO_PLAN_SELECTION } from "./selection.js";
export { PLAN_ID, PlanBrokenError, PlanLockedError, UnknownPlanError } from "./types.js";
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
    config;
    /** Runtime schema for the plan registry. */
    static Config = z.object({
        roots: z.array(z.object({
            path: z.string().required(),
            trust: z.union(['system', 'user']).default('user'),
        })).default([]),
        includeUserRoot: z.boolean().default(true),
    });
    /** The roots discovery actually scans: configured roots, then the harness-home user root. */
    resolvedRoots;
    constructor(ctx, config) {
        super(ctx, 'modelPlans');
        this.config = config;
        this.resolvedRoots = config.includeUserRoot
            ? [...config.roots, { path: dshHomePath(USER_PLAN_DIR), trust: 'user' }]
            : [...config.roots];
        // The plan binding's durable record predates the agent: a blank session may
        // carry a `model-plan/select` event before its agent exists (the pick
        // happens on the new-conversation screen). When the agent is created, mount
        // the merge interceptor on the agent's scoped context so its requests fold
        // the record. A session that binds no plan runs zero-intervention on the
        // official route.
        //
        // `prepend: true` places this merge interceptor at the FRONT of the
        // `agent/request` waterfall (outermost), AFTER the official model-selection
        // layer (`installModelSelection`) which the host mounts during agent setup.
        // The official layer unconditionally rewrites `provider`/`model` from the
        // agent's own selection (the "current model" seat), which otherwise
        // overwrites this bundle's plan-derived route on every request — so an
        // in-flight session would never follow a plan edit (its provider/model stay
        // pinned to the official selection even when `plan.yml` changes). Being
        // outermost lets this interceptor apply the plan's route + params LAST, so
        // reference semantics hold: editing a plan changes what a bound session uses
        // on its NEXT request. A session that binds no plan still returns `next()`
        // untouched (zero intervention on the official route).
        ctx.on('agent/created', (payload) => {
            const agent = payload.agent;
            agent.ctx.on('agent/request', createMergeHandler({
                selectionOf: (events) => currentPlanSelection(events),
                resolvePlan: (id) => this.resolveForMerge(id),
                resolveDefaultPlan: () => this.resolveDefaultPlan(),
                logger: this.ctx.logger,
            }), { prepend: true });
        });
    }
    /**
     * Every plan the configured roots currently supply.
     * @returns the plans, first-root-wins per id.
     */
    async list() {
        return discoverPlans(this.resolvedRoots);
    }
    /**
     * Whether this deployment composes a writable user root (the management
     * surface's authoring gate).
     */
    get authorable() {
        return this.resolvedRoots.some(root => root.trust === 'user');
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
    async resolve(id) {
        const plans = await this.list();
        const found = plans.find(plan => plan.id === id);
        if (found === undefined) {
            throw new UnknownPlanError(id, plans.map(plan => plan.id));
        }
        return found;
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
    async resolveForMerge(id) {
        const plan = await this.resolve(id).catch(() => undefined);
        if (plan === undefined || plan.broken !== undefined)
            return undefined;
        return { provider: plan.provider, model: plan.model, params: plan.params };
    }
    /**
     * Resolve the deployment's DEFAULT plan for the merge interceptor — the plan
     * an unbound session falls back to, so "可设默认方案" is live rather than a
     * dead marker. Re-discovered on every call so editing a plan's file (or
     * moving the default marker) changes what an unbound session uses on its
     * NEXT request (reference semantics). A broken default resolves to
     * `undefined`: with no usable default an unbound session runs the official
     * route (zero intervention).
     *
     * A user default wins over a system default; within a trust the discovered
     * roster is the source of truth (the authoring surface clears other user
     * defaults when one is set, so a user trust holds at most one default).
     * @returns the default plan's current route and params, or undefined when
     *   no plan is marked default or the default is unusable.
     */
    async resolveDefaultPlan() {
        const roster = await this.list().catch(() => []);
        const defaultPlan = roster.find(plan => plan.isDefault && plan.trust === 'user')
            ?? roster.find(plan => plan.isDefault);
        if (defaultPlan === undefined || defaultPlan.broken !== undefined)
            return undefined;
        return { provider: defaultPlan.provider, model: defaultPlan.model, params: defaultPlan.params };
    }
    /**
     * Create a locally authored plan.
     * @param id - the new plan's id (its directory name).
     * @param edits - the plan's initial fields.
     * @returns the absolute path of the new plan directory.
     */
    async create(id, edits) {
        return createPlan(this.resolvedRoots, id, edits);
    }
    /**
     * Rewrite one locally authored plan.
     * @param id - the plan id.
     * @param edits - any subset of the plan's fields to replace.
     * @throws when the plan ships with the deployment, is unknown, or the route is unusable.
     */
    async update(id, edits) {
        const plan = await this.resolve(id);
        await updatePlan(this.resolvedRoots, plan, edits);
    }
    /**
     * Delete a locally authored plan.
     * @param id - the plan id.
     * @throws when the plan ships with the deployment or is unknown.
     */
    async remove(id) {
        const plan = await this.resolve(id);
        await deletePlan(this.resolvedRoots, plan);
    }
    /**
     * Make one locally authored plan the deployment default, clearing any other
     * user default.
     * @param id - the plan id.
     * @throws when the plan ships with the deployment or is unknown.
     */
    async setDefault(id) {
        const plan = await this.resolve(id);
        if (plan.broken !== undefined) {
            throw new Error(`model-plans: plan "${id}" cannot be the default: ${plan.broken}`);
        }
        await setPlanDefault(this.resolvedRoots, plan);
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
    async select(sessionId, planId, overrides) {
        const session = this.ctx.get('sessions')?.get(sessionId);
        if (session === undefined) {
            throw new Error(`model-plans: no live session "${sessionId}"; cannot bind a plan to it`);
        }
        if (planLocked(session.events)) {
            throw new PlanLockedError(sessionId);
        }
        const plan = await this.resolve(planId);
        if (plan.broken !== undefined) {
            throw new Error(`model-plans: plan "${planId}" cannot be bound: ${plan.broken}`);
        }
        const appendIgnorable = session.append.bind(session);
        appendIgnorable('model-plan/select', { planId, ...overrides === undefined ? {} : { overrides } }, true);
        const state = currentPlanSelection(session.events);
        this.ctx.emit('model-plan/selected', sessionId, state);
        return state;
    }
    /**
     * Read a session's current folded plan selection.
     * @param sessionId - the session to read.
     * @returns the session's folded selection state (plan id + overrides), or
     * the empty selection when the session binds no plan.
     */
    async readSelection(sessionId) {
        const session = this.ctx.get('sessions')?.get(sessionId);
        if (session === undefined)
            return { overrides: {} };
        return currentPlanSelection(session.events);
    }
}
export default ModelPlans;
//# sourceMappingURL=index.js.map