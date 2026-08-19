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

import { readdir, readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { expandHomePath } from './home-path.ts'
import { parsePlan } from './metadata.ts'
import { PLAN_ID, type ModelPlan, type PlanRoot, type PlanTrust } from './types.ts'

/** The file that makes a directory a plan. */
export const PLAN_FILE = 'plan.yml'

/**
 * Harness-home directory holding locally authored plans.
 * Mirrors `USER_TEAM_DIR` (`teams`) in the subagent bundle: this package owns
 * the writable plan root the same way, and the app supplies the SHIPPED root.
 */
export const USER_PLAN_DIR = 'model-plans'

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
export async function scanRoot(root: PlanRoot): Promise<ModelPlan[]> {
  const dir = resolve(expandHomePath(root.path))
  let children
  try {
    children = await readdir(dir, { withFileTypes: true })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw new Error(`model-plans: cannot read plan root ${dir}: ${String(error)}`, { cause: error })
  }
  const found: ModelPlan[] = []
  for (const child of children) {
    if (!child.isDirectory() || !PLAN_ID.test(child.name)) continue
    found.push(await readPlan(child.name, root.trust, join(dir, child.name)))
  }
  return found.sort((left, right) => left.id.localeCompare(right.id))
}

/**
 * Scan every root in precedence order.
 * @param roots - roots in precedence order; an earlier root wins a duplicate id.
 * @returns every discovered plan, first-root-wins per id.
 */
export async function discoverPlans(roots: readonly PlanRoot[]): Promise<ModelPlan[]> {
  const byId = new Map<string, ModelPlan>()
  for (const root of roots) {
    for (const plan of await scanRoot(root)) {
      if (byId.has(plan.id)) continue
      byId.set(plan.id, plan)
    }
  }
  return [...byId.values()]
}

/**
 * Read and parse one plan directory's `plan.yml`.
 * @param id - the plan id (the directory name).
 * @param trust - the trust recorded from the root this plan was found under.
 * @param directory - the plan directory.
 * @returns the parsed plan, or a plan carrying a whole-plan `broken` reason
 *   when the file is missing or unreadable.
 */
export async function readPlan(id: string, trust: PlanTrust, directory: string): Promise<ModelPlan> {
  const path = join(directory, PLAN_FILE)
  let content: string
  try {
    content = await readFile(path, 'utf8')
  } catch {
    return {
      id, trust, path, provider: '', model: '', params: {}, isDefault: false,
      broken: `the plan file ${PLAN_FILE} is missing — the directory still occupies the id; delete it or restore the file`,
    }
  }
  return parsePlan(id, trust, path, content)
}
