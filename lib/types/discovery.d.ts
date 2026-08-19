/**
 * Filesystem discovery of model plans.
 *
 * A plan is a directory holding a {@link PLAN_FILE} (`plan.yml`); the
 * directory name is the plan id. Discovery re-reads the roots on every call so
 * a plan authored while the process is running is visible without a restart.
 * Each root holds one subdirectory per plan, mirroring the team/subagent
 * discovery layout.
 *
 * Discovery owns whole-plan HEALTH: a directory whose `plan.yml` is missing or
 * malformed is reported as a broken roster row rather than skipped, so the id
 * stays visible and deletable.
 * @module dsh-harness-model-plan-bundle/discovery
 */
import { type ModelPlan, type PlanRoot, type PlanTrust } from './types.ts';
/** The file that makes a directory a plan. */
export declare const PLAN_FILE = "plan.yml";
/**
 * Harness-home directory holding locally authored plans.
 * Mirrors `USER_TEAM_DIR` (`teams`) in the subagent bundle: this package owns
 * the writable plan root the same way, and the app supplies the SHIPPED root.
 */
export declare const USER_PLAN_DIR = "model-plans";
/**
 * Scan one root for plan directories.
 *
 * An absent root yields no plans rather than throwing (the user root does not
 * exist until the first locally authored plan). Every directory whose name is
 * a usable plan id is a roster row — broken when its `plan.yml` is missing or
 * malformed. A directory named outside {@link PLAN_ID} is skipped.
 * @param root - the directory and the trust its plans inherit.
 * @returns the root's plans ordered by id.
 */
export declare function scanRoot(root: PlanRoot): Promise<ModelPlan[]>;
/**
 * Scan every root in precedence order.
 * @param roots - roots in precedence order; an earlier root wins a duplicate id.
 * @returns every discovered plan, first-root-wins per id.
 */
export declare function discoverPlans(roots: readonly PlanRoot[]): Promise<ModelPlan[]>;
/**
 * Read and parse one plan directory's `plan.yml`.
 * @param id - the plan id (the directory name).
 * @param trust - the trust recorded from the root this plan was found under.
 * @param directory - the plan directory.
 * @returns the parsed plan, or a plan carrying a whole-plan `broken` reason
 *   when the file is missing or unreadable.
 */
export declare function readPlan(id: string, trust: PlanTrust, directory: string): Promise<ModelPlan>;
//# sourceMappingURL=discovery.d.ts.map