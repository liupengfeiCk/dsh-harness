/**
 * Parse a plan's stored `plan.yml`.
 *
 * A plan is one YAML file carrying its display metadata (name), its pinned
 * route (`provider`/`model`), a bag of `params`, and an optional `default`
 * marker. A plan has no separate plugin tree — the whole asset lives in one
 * file.
 *
 * Every read failure that makes the plan unusable is surfaced as a `broken`
 * reason by discovery; a plan whose file is valid YAML but lacks a usable
 * `provider`/`model` route is broken too (a plan must pin something the merge
 * interceptor can route).
 * @module dsh-harness-model-plan-bundle/metadata
 */
import type { ModelPlan, PlanTrust } from './types.ts';
/**
 * Parse a plan file's contents into its plan shape. Malformed shape is
 * surfaced as a whole-plan `broken` reason.
 * @param id - the plan id (the directory name).
 * @param trust - the trust recorded from the root this plan was found under.
 * @param path - the absolute path of the `plan.yml` file.
 * @param content - the file's raw text.
 * @returns the parsed plan, or a plan carrying a whole-plan `broken` reason.
 */
export declare function parsePlan(id: string, trust: PlanTrust, path: string, content: string): ModelPlan;
/**
 * Read and parse one plan directory's `plan.yml`.
 * @param directory - the plan directory.
 * @param id - the plan id (the directory name).
 * @param trust - the trust recorded from the root this plan was found under.
 * @returns the parsed plan, or a plan carrying a whole-plan `broken` reason
 *   when the file is missing or unreadable.
 */
export declare function readPlan(id: string, trust: PlanTrust, directory: string): Promise<ModelPlan>;
/**
 * Resolve the single default plan from a discovered roster, by precedence:
 * a user default wins over a system default; within a trust, the plan with the
 * `default: true` marker. When no plan is marked default, no plan is default
 * (a session simply binds nothing unless it explicitly selects a plan).
 * @param plans - the discovered plans (first-root-wins per id).
 * @returns the default plan, or undefined when none is marked default.
 */
export declare function defaultPlan(plans: readonly ModelPlan[]): ModelPlan | undefined;
//# sourceMappingURL=metadata.d.ts.map