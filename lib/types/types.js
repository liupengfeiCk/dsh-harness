/**
 * Model-plan vocabulary shared by discovery, registry, selection, and merge.
 *
 * A model plan ("模型方案") is a FIXED asset: a provider/model route plus a bag
 * of arbitrary `params` (a key=value bag with no closed key set). A session
 * binds a PLAN, never a bare model — reference semantics: editing a plan's
 * file changes what a bound session uses on its NEXT request, without
 * retrofitting the past.
 *
 * Plans ship under the same dual-root trust model as subagents and teams:
 * `config/model-plans/` is read-only (`system`), `$DSH_HOME/.dsh/model-plans`
 * is where a person authors their own (`user`). One plan = one `plan.yml` file
 * under a root.
 */
/**
 * Ids a plan directory may use. A plan id becomes a path segment, so this is a
 * containment boundary (same rationale as `SUBAGENT_ID` / `TEAM_ID`): `..`, a
 * separator, or an absolute-looking name would place the plan file outside the
 * root the deployment authorised.
 */
export const PLAN_ID = /^[a-z0-9][a-z0-9-]*$/;
/** No configured root supplies the requested plan. */
export class UnknownPlanError extends Error {
    planId;
    available;
    constructor(
    /** The plan id that was requested. */
    planId, 
    /** Ids the roster does supply, for the caller to offer instead. */
    available) {
        super(`model-plans: plan "${planId}" not found (available: ${available.join(', ') || 'none'})`);
        this.planId = planId;
        this.available = available;
    }
}
/** The requested plan is broken and cannot be selected. */
export class PlanBrokenError extends Error {
    planId;
    constructor(
    /** The plan id that is unusable. */
    planId, 
    /** The broken reason from the discovered row. */
    reason) {
        super(`model-plans: plan "${planId}" cannot be used: ${reason}`);
        this.planId = planId;
    }
}
/**
 * A session whose conversation has already started refuses a plan-binding
 * change: the request the model already saw was produced under the previous
 * route, and swapping mid-flight would strand the logged call. A typed error so
 * the wire maps it to `model-plan-locked` by `instanceof`, never by string
 * matching — the same blank-window lock the subagent team mode and the agent
 * preset carry.
 */
export class PlanLockedError extends Error {
    sessionId;
    constructor(
    /** The session whose binding is fixed. */
    sessionId) {
        super(`model-plans: session "${sessionId}" has already started; its plan binding is fixed`);
        this.sessionId = sessionId;
    }
}
//# sourceMappingURL=types.js.map