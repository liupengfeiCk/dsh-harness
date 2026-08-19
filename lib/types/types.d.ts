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
 * A JSON value: the widest shape the plan params bag and the wire may carry.
 * Defined locally rather than imported because the published
 * `@deepseek-ai/dsh-llm` types do not yet export a `JsonValue` — the upstream
 * `LlmCallConfig.extra?: Record<string, JsonValue>` contract is being landed by
 * the model-selection workstream and is deferred to a later integration. We
 * pin the same shape here so the bag is ready for that contract unchanged.
 */
export type JsonValue = string | number | boolean | null | JsonValue[] | {
    [key: string]: JsonValue;
};
/** Where a plan's file came from; mirrors `SubagentTrust` / `TeamTrust`. */
export type PlanTrust = 'system' | 'user';
/**
 * Ids a plan directory may use. A plan id becomes a path segment, so this is a
 * containment boundary (same rationale as `SUBAGENT_ID` / `TEAM_ID`): `..`, a
 * separator, or an absolute-looking name would place the plan file outside the
 * root the deployment authorised.
 */
export declare const PLAN_ID: RegExp;
/**
 * A bag of plan params: an arbitrary key=value set. Any key is legal; the
 * merge interceptor routes known keys onto native `LlmCallConfig` fields and
 * everything else into `LlmCallConfig.extra` (an upstream-optional contract the
 * adapter may or may not forward). Values are restricted to JSON for the wire
 * and the ledger.
 */
export type PlanParams = Record<string, JsonValue>;
/** One model plan ("模型方案"), a fixed asset. */
export interface ModelPlan {
    /** Stable identifier; the plan directory's name. */
    readonly id: string;
    /** Display name; defaults to the id when absent. */
    readonly name?: string;
    /** Registered provider route the plan pins. */
    readonly provider: string;
    /** Provider-owned model id the plan pins. */
    readonly model: string;
    /** A bag of arbitrary key=value params applied to the merged request. */
    readonly params: PlanParams;
    /** Trust recorded from the root this plan was discovered under. */
    readonly trust: PlanTrust;
    /** Absolute path of the plan's `plan.yml` file. */
    readonly path: string;
    /**
     * Whether this plan is the deployment default. A user default wins over a
     * system default; within a trust, the most recently set default wins.
     */
    readonly isDefault: boolean;
    /**
     * Why this whole plan cannot be used, absent when it can. A broken plan stays
     * on the roster (its directory occupies the id), but every select/resolve
     * path refuses it up front.
     */
    readonly broken?: string;
}
/** One directory scanned for plan directories. */
export interface PlanRoot {
    /** Directory holding one subdirectory per plan; a leading `~` expands. */
    path: string;
    /** Trust recorded on every plan discovered under this root. */
    trust: PlanTrust;
}
/** Plugin config: which roots supply plans. */
export interface Config {
    /** Scanned roots in precedence order; an earlier root wins a duplicate id. */
    roots: PlanRoot[];
    /** Append the harness home's `USER_PLAN_DIR` as a `user` root, after every configured root. */
    includeUserRoot: boolean;
}
/** No configured root supplies the requested plan. */
export declare class UnknownPlanError extends Error {
    /** The plan id that was requested. */
    readonly planId: string;
    /** Ids the roster does supply, for the caller to offer instead. */
    readonly available: readonly string[];
    constructor(
    /** The plan id that was requested. */
    planId: string, 
    /** Ids the roster does supply, for the caller to offer instead. */
    available: readonly string[]);
}
/** The requested plan is broken and cannot be selected. */
export declare class PlanBrokenError extends Error {
    /** The plan id that is unusable. */
    readonly planId: string;
    constructor(
    /** The plan id that is unusable. */
    planId: string, 
    /** The broken reason from the discovered row. */
    reason: string);
}
//# sourceMappingURL=types.d.ts.map