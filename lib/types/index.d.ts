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
import type { Context } from '@deepseek-ai/cordis';
import type { SessionId } from '@deepseek-ai/dsh-session';
import { type PlanSelectionState } from './selection.ts';
import { type Config, type ModelPlan, type PlanParams } from './types.ts';
export { PLAN_FILE, discoverPlans, scanRoot, USER_PLAN_DIR } from './discovery.ts';
export { InvalidPlanIdError, PlanExistsError, PlanNotWritableError, PlanRouteInvalidError, createPlan, deletePlan, setPlanDefault, updatePlan, writableRoot, } from './authoring.ts';
export { KNOWN_KEYS, createMergeHandler, mergePlanConfig } from './merge.ts';
export type { MergedCallConfig, ModelPlanMergeDeps } from './merge.ts';
export { currentPlanSelection, planLocked, NO_PLAN_SELECTION } from './selection.ts';
export type { PlanSelectionState } from './selection.ts';
export { PLAN_ID, PlanBrokenError, PlanLockedError, UnknownPlanError } from './types.ts';
export type { Config, ModelPlan, PlanParams, PlanRoot, PlanTrust } from './types.ts';
declare module '@deepseek-ai/cordis' {
    interface Context {
        modelPlans: ModelPlans;
    }
    interface Events {
        /**
         * A session's model-plan binding was selected or changed. Carries only the
         * stable folded identity (session id + plan id), never the live Session —
         * the same notification shape as the subagent team's mode-selected event.
         */
        'model-plan/selected'(sessionId: string, state: PlanSelectionState): void;
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
export declare class ModelPlans extends Service {
    config: Config;
    /** Runtime schema for the plan registry. */
    static Config: z<Config>;
    /** The roots discovery actually scans: configured roots, then the harness-home user root. */
    private readonly resolvedRoots;
    constructor(ctx: Context, config: Config);
    /**
     * Every plan the configured roots currently supply.
     * @returns the plans, first-root-wins per id.
     */
    list(): Promise<ModelPlan[]>;
    /**
     * Whether this deployment composes a writable user root (the management
     * surface's authoring gate).
     */
    get authorable(): boolean;
    /**
     * Resolve one plan by id.
     *
     * A broken plan resolves — deleting one, reading one, and reporting one all
     * need the row — and the selection/merge paths refuse it AFTER resolution.
     * @param id - the plan id.
     * @returns the resolved plan.
     * @throws when no configured root supplies that id.
     */
    resolve(id: string): Promise<ModelPlan>;
    /**
     * Resolve a plan for the MERGE interceptor: only the fields it needs, with
     * the plan's CURRENT file contents (reference semantics), and only when the
     * plan is usable. A missing or broken bound plan yields `undefined` — the
     * interceptor then logs and falls back to the official route rather than
     * failing the request.
     * @param id - the plan id.
     * @returns the plan's current route and params, or undefined when unusable.
     */
    private resolveForMerge;
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
    private resolveDefaultPlan;
    /**
     * Create a locally authored plan.
     * @param id - the new plan's id (its directory name).
     * @param edits - the plan's initial fields.
     * @returns the absolute path of the new plan directory.
     */
    create(id: string, edits: {
        readonly name?: string;
        readonly provider: string;
        readonly model: string;
        readonly params?: PlanParams;
        readonly default?: boolean;
    }): Promise<string>;
    /**
     * Rewrite one locally authored plan.
     * @param id - the plan id.
     * @param edits - any subset of the plan's fields to replace.
     * @throws when the plan ships with the deployment, is unknown, or the route is unusable.
     */
    update(id: string, edits: {
        readonly name?: string;
        readonly provider?: string;
        readonly model?: string;
        readonly params?: PlanParams;
        readonly default?: boolean;
    }): Promise<void>;
    /**
     * Delete a locally authored plan.
     * @param id - the plan id.
     * @throws when the plan ships with the deployment or is unknown.
     */
    remove(id: string): Promise<void>;
    /**
     * Make one locally authored plan the deployment default, clearing any other
     * user default.
     * @param id - the plan id.
     * @throws when the plan ships with the deployment or is unknown.
     */
    setDefault(id: string): Promise<void>;
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
    select(sessionId: SessionId, planId: string, overrides?: PlanParams): Promise<PlanSelectionState>;
    /**
     * Read a session's current folded plan selection.
     * @param sessionId - the session to read.
     * @returns the session's folded selection state (plan id + overrides), or
     * the empty selection when the session binds no plan.
     */
    readSelection(sessionId: SessionId): Promise<PlanSelectionState>;
}
export default ModelPlans;
//# sourceMappingURL=index.d.ts.map