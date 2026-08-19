/**
 * Reading, creating, editing, deleting, and defaulting locally authored model
 * plans.
 *
 * Authoring is confined to a `user` root: the shipped `config/model-plans/`
 * set is part of the deployment, and letting a browser rewrite it would turn
 * "reset to a known plan" into something the same caller could have broken
 * first.
 *
 * A plan is one directory holding a `plan.yml` carrying the plan's display
 * metadata, its pinned route, its params bag, and an optional default marker.
 * Creation writes a fresh `plan.yml`; updates rewrite the whole file; the
 * default marker is a metadata-only write that flips the flags so at most one
 * plan per trust is the default.
 * @module dsh-harness-model-plan-bundle/authoring
 */
import { type ModelPlan, type PlanParams, type PlanRoot } from './types.ts';
/** A plan id that cannot be used as a directory name under a root. */
export declare class InvalidPlanIdError extends Error {
    /** The rejected id. */
    readonly planId: string;
    constructor(
    /** The rejected id. */
    planId: string);
}
/** A create target that is already occupied — a create never overwrites. */
export declare class PlanExistsError extends Error {
    /** The id that is already taken. */
    readonly planId: string;
    constructor(
    /** The id that is already taken. */
    planId: string);
}
/** Authoring was attempted where the deployment allows none. */
export declare class PlanNotWritableError extends Error {
    /** What the caller tried to change, for the diagnostic. */
    readonly planId: string;
    constructor(
    /** What the caller tried to change, for the diagnostic. */
    planId: string, reason: string);
}
/** The route a plan must pin: both `provider` and `model` are required. */
export declare class PlanRouteInvalidError extends Error {
    /** The plan id that is unusable. */
    readonly planId: string;
    constructor(
    /** The plan id that is unusable. */
    planId: string, reason: string);
}
/**
 * The root locally authored plans are written to.
 * @param roots - the configured roots in precedence order.
 * @returns the absolute path of the first `user` root.
 * @throws when the deployment configured no writable root.
 */
export declare function writableRoot(roots: readonly PlanRoot[]): string;
/** The fields an authoring call may set on a plan. */
export interface PlanEdits {
    readonly name?: string;
    readonly provider?: string;
    readonly model?: string;
    readonly params?: PlanParams;
    readonly default?: boolean;
}
/**
 * Render a plan's fields back into `plan.yml` text.
 *
 * Absent fields are omitted rather than emitted as null/empty, so the stored
 * file stays minimal and reads cleanly. The params bag is emitted under
 * `params`; a falsey default is omitted (an absent marker means not-default).
 * @param plan - the plan to render.
 * @returns the `plan.yml` contents.
 */
export declare function renderPlan(plan: {
    readonly name?: string;
    readonly provider: string;
    readonly model: string;
    readonly params: PlanParams;
    readonly isDefault: boolean;
}): string;
/**
 * Create a locally authored plan from an initial set of fields.
 *
 * The new plan directory is created under the first `user` root and its
 * `plan.yml` written atomically. The id becomes the directory name, so it is
 * validated as a containment boundary before anything touches disk.
 * @param roots - the configured roots; the first `user` one receives the plan.
 * @param id - the new plan's id, which becomes its directory name.
 * @param edits - the plan's fields (name/provider/model/params/default).
 * @returns the absolute path of the new plan directory.
 * @throws when the id is unusable or already occupied, the route is unusable,
 * or the deployment configures no writable root.
 */
export declare function createPlan(roots: readonly PlanRoot[], id: string, edits: PlanEdits): Promise<string>;
/**
 * Rewrite one locally authored plan's `plan.yml` as a WHOLE.
 *
 * A shipped plan is refused, exactly like delete — its install is not the
 * user's to manage. The plan's file is confined to the writable root by a
 * path-prefix check on top of trust, so an id that collides with a path
 * outside the root can never be rewritten.
 * @param roots - the configured roots.
 * @param plan - the resolved plan to edit.
 * @param edits - the complete fields to store.
 * @throws when the plan ships with the deployment or lies outside the writable
 * root, or the route is unusable.
 */
export declare function updatePlan(roots: readonly PlanRoot[], plan: ModelPlan, edits: PlanEdits): Promise<void>;
/**
 * Delete a locally authored plan.
 *
 * A shipped plan is refused: it belongs to the deployment. A plan whose id a
 * live session bound is NOT refused — the reference semantics mean the next
 * request simply fails to resolve the deleted plan, which the merge
 * interceptor logs and falls back on.
 * @param roots - the configured roots.
 * @param plan - the resolved plan to remove.
 * @throws when the plan ships with the deployment or lies outside the writable
 * root.
 */
export declare function deletePlan(roots: readonly PlanRoot[], plan: ModelPlan): Promise<void>;
/**
 * Flip one locally authored plan's default marker to `true`, clearing any
 * other plan in the SAME trust that was the default (a trust has at most one
 * default). A shipped plan is refused — the deployment owns its defaults.
 * @param roots - the configured roots.
 * @param plan - the resolved plan to make the default.
 * @throws when the plan ships with the deployment or lies outside the writable
 * root.
 */
export declare function setPlanDefault(roots: readonly PlanRoot[], plan: ModelPlan): Promise<void>;
//# sourceMappingURL=authoring.d.ts.map