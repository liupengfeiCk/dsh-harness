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

import { mkdir, readFile, readdir, rm } from 'node:fs/promises'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'
import yaml from 'js-yaml'
import { expandHomePath } from './home-path.ts'
import { PLAN_FILE, readPlan } from './discovery.ts'
import { PLAN_ID, type ModelPlan, type PlanParams, type PlanRoot } from './types.ts'

/** A plan id that cannot be used as a directory name under a root. */
export class InvalidPlanIdError extends Error {
  constructor(
    /** The rejected id. */
    readonly planId: string,
  ) {
    super(
      `model-plans: plan id ${JSON.stringify(planId)} must match ${String(PLAN_ID)} — `
      + 'the id is a directory name, so anything else could escape the plan root',
    )
  }
}

/** A create target that is already occupied — a create never overwrites. */
export class PlanExistsError extends Error {
  constructor(
    /** The id that is already taken. */
    readonly planId: string,
  ) {
    super(
      `model-plans: plan "${planId}" already exists — `
      + 'a create never overwrites; delete the existing plan first or choose another id',
    )
  }
}

/** Authoring was attempted where the deployment allows none. */
export class PlanNotWritableError extends Error {
  constructor(
    /** What the caller tried to change, for the diagnostic. */
    readonly planId: string,
    reason: string,
  ) {
    super(`model-plans: plan "${planId}" cannot be written: ${reason}`)
  }
}

/** The route a plan must pin: both `provider` and `model` are required. */
export class PlanRouteInvalidError extends Error {
  constructor(
    /** The plan id that is unusable. */
    readonly planId: string,
    reason: string,
  ) {
    super(`model-plans: plan "${planId}" cannot be written: ${reason}`)
  }
}

/**
 * The root locally authored plans are written to.
 * @param roots - the configured roots in precedence order.
 * @returns the absolute path of the first `user` root.
 * @throws when the deployment configured no writable root.
 */
export function writableRoot(roots: readonly PlanRoot[]): string {
  const root = roots.find(candidate => candidate.trust === 'user')
  if (root === undefined) {
    throw new PlanNotWritableError('', 'this deployment configures no user-writable plan root')
  }
  return resolve(expandHomePath(root.path))
}

/** The fields an authoring call may set on a plan. */
export interface PlanEdits {
  readonly provider?: string
  readonly model?: string
  readonly params?: PlanParams
  readonly default?: boolean
}

/** Validate an id for use as a plan directory name (a containment boundary). */
function assertUsableId(id: string): void {
  if (!PLAN_ID.test(id)) throw new InvalidPlanIdError(id)
}

/** A plan's route must pin a provider and a model (the merge routes on them). */
function assertRoute(planId: string, provider: string | undefined, model: string | undefined): void {
  if (provider === undefined || provider === '' || model === undefined || model === '') {
    throw new PlanRouteInvalidError(planId, 'a plan must pin both a "provider" and a "model"')
  }
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
export function renderPlan(plan: {
  readonly provider: string
  readonly model: string
  readonly params: PlanParams
  readonly isDefault: boolean
}): string {
  const document: Record<string, unknown> = {
    provider: plan.provider,
    model: plan.model,
  }
  if (Object.keys(plan.params).length > 0) document.params = plan.params
  if (plan.isDefault) document.default = true
  return yaml.dump(document, { lineWidth: -1, noRefs: true })
}

/** Whether anything occupies the path (a create's own backstop). */
async function occupied(path: string): Promise<boolean> {
  let present = true
  try {
    await readFile(path, 'utf8')
  } catch {
    present = false
  }
  return present
}

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
export async function createPlan(
  roots: readonly PlanRoot[],
  id: string,
  edits: PlanEdits,
): Promise<string> {
  assertUsableId(id)
  assertRoute(id, edits.provider, edits.model)
  const dir = join(writableRoot(roots), id)
  const file = join(dir, PLAN_FILE)
  if (await occupied(file)) throw new PlanExistsError(id)
  const provider = edits.provider as string
  const model = edits.model as string
  try {
    await mkdir(dir, { recursive: true })
    await writeFileAtomic(file, renderPlan({
      provider,
      model,
      params: edits.params ?? {},
      isDefault: edits.default === true,
    }), { mode: 0o600, dirMode: 0o700 })
  } catch (error) {
    await rm(dir, { recursive: true, force: true })
    throw error
  }
  return dir
}

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
export async function updatePlan(
  roots: readonly PlanRoot[],
  plan: ModelPlan,
  edits: PlanEdits,
): Promise<void> {
  if (plan.trust !== 'user') {
    throw new PlanNotWritableError(plan.id, 'it ships with the deployment')
  }
  const dir = join(writableRoot(roots), plan.id)
  if (!isAbsolute(plan.path) || !plan.path.startsWith(dir)) {
    throw new PlanNotWritableError(plan.id, 'it does not live under the writable plan root')
  }
  const provider = edits.provider ?? plan.provider
  const model = edits.model ?? plan.model
  assertRoute(plan.id, provider, model)
  await writeFileAtomic(plan.path, renderPlan({
    provider,
    model,
    params: edits.params ?? plan.params,
    isDefault: edits.default ?? plan.isDefault,
  }), { mode: 0o600, dirMode: 0o700 })
}

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
export async function deletePlan(
  roots: readonly PlanRoot[],
  plan: ModelPlan,
): Promise<void> {
  if (plan.trust !== 'user') {
    throw new PlanNotWritableError(plan.id, 'it ships with the deployment')
  }
  const dir = join(writableRoot(roots), plan.id)
  if (!isAbsolute(plan.path) || !plan.path.startsWith(dir)) {
    throw new PlanNotWritableError(plan.id, 'it does not live under the writable plan root')
  }
  await rm(dir, { recursive: true, force: true })
}

/**
 * Flip one locally authored plan's default marker to `true`, clearing any
 * other plan in the SAME trust that was the default (a trust has at most one
 * default). A shipped plan is refused — the deployment owns its defaults.
 * @param roots - the configured roots.
 * @param plan - the resolved plan to make the default.
 * @throws when the plan ships with the deployment or lies outside the writable
 * root.
 */
export async function setPlanDefault(
  roots: readonly PlanRoot[],
  plan: ModelPlan,
): Promise<void> {
  if (plan.trust !== 'user') {
    throw new PlanNotWritableError(plan.id, 'it ships with the deployment')
  }
  const dir = join(writableRoot(roots), plan.id)
  if (!isAbsolute(plan.path) || !plan.path.startsWith(dir)) {
    throw new PlanNotWritableError(plan.id, 'it does not live under the writable plan root')
  }
  // Clear every other user plan's default marker first, then mark this one.
  // The user root is scanned directly: the roster may not yet include plans
  // created after the last discovery, so we read the directory afresh.
  const rootDir = writableRoot(roots)
  let children: import('node:fs').Dirent[] = []
  try {
    children = await readdir(rootDir, { withFileTypes: true })
  } catch {
    children = []
  }
  for (const child of children) {
    if (!child.isDirectory() || !PLAN_ID.test(child.name)) continue
    if (child.name === plan.id) continue
    const sibling = await readPlan(child.name, 'user', join(rootDir, child.name))
    if (sibling.broken === undefined && sibling.isDefault) {
      await writeFileAtomic(sibling.path, renderPlan({
        provider: sibling.provider,
        model: sibling.model,
        params: sibling.params,
        isDefault: false,
      }), { mode: 0o600, dirMode: 0o700 })
    }
  }
  const current = await readPlan(plan.id, 'user', dirname(plan.path))
  await writeFileAtomic(plan.path, renderPlan({
    provider: current.broken === undefined ? current.provider : plan.provider,
    model: current.broken === undefined ? current.model : plan.model,
    params: current.broken === undefined ? current.params : plan.params,
    isDefault: true,
  }), { mode: 0o600, dirMode: 0o700 })
}
