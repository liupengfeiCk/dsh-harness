//#region lib/types/types.js
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
const PLAN_ID = /^[a-z0-9][a-z0-9-]*$/;
/** No configured root supplies the requested plan. */
var UnknownPlanError = class extends Error {
	planId;
	available;
	constructor(planId, available) {
		super(`model-plans: plan "${planId}" not found (available: ${available.join(", ") || "none"})`);
		this.planId = planId;
		this.available = available;
	}
};
/** The requested plan is broken and cannot be selected. */
var PlanBrokenError = class extends Error {
	planId;
	constructor(planId, reason) {
		super(`model-plans: plan "${planId}" cannot be used: ${reason}`);
		this.planId = planId;
	}
};
//#endregion
export { PLAN_ID, PlanBrokenError, UnknownPlanError };
