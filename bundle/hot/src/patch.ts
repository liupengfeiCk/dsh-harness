/**
 * Bundle-patch parsing for the harness hot mount surface.
 *
 * The hot mounter must know, of an installed plugin's `cordis.patch.yml`, which
 * rows it can pull into the running composition. We parse with the SAME
 * js-yaml dialect the include plugin itself mounts (`entryListSchema`, the
 * `!!js` expression-aware schema from `@deepseek-ai/cordis-plugin-include`), so
 * a parsed patch never drifts from what a boot would load — unlike the market's
 * hand-written line regex.
 *
 * Only two row shapes are hot-mountable:
 *   - `insert` rows: `{ id, name, config? }` with a STATIC key-value `config`.
 *     A `!!js` expression anywhere inside a row's `config` (or `disabled`)
 *     evaluates against a loader context that only exists at boot — it cannot
 *     be re-evaluated here, so such a patch is refused with "restart required".
 *   - `disabled` override rows: `{ id, disabled: <boolean> }`. These target an
 *     already-mounted row by id (never restating `name`, matching the loader's
 *     patch semantics), so they are hot-applied as-is.
 *
 * Anything else — nested groups, `inject`/`isolate`/`intercept` keys, non-boolean
 * `disabled`, or expressions — is refused rather than half-applied. The caller
 * then falls back to restart activation.
 * @module dsh-harness-hot-bundle/patch
 */

import * as yaml from 'js-yaml'
import { entryListSchema } from '@deepseek-ai/cordis-plugin-include'

/** One hot-mountable `insert` row of a bundle patch. */
export interface HotInsertRow {
  kind: 'insert'
  /** The row's id; the hot mounter prefixes it before mounting. */
  id: string
  /** The module specifier the row mounts (a package export or a builtin). */
  name: string
  /** Static key-value config, when the patch declares one. */
  config?: Record<string, unknown>
}

/** One hot-mountable `disabled` override row of a bundle patch. */
export interface HotDisableRow {
  kind: 'disable'
  /** The id of the row to disable; applied as-is (no prefix). */
  id: string
}

/** A hot-mountable row of a bundle patch. */
export type HotRow = HotInsertRow | HotDisableRow

/** The parsed shape of a bundle patch's `insert` list entries. */
interface InsertEntry {
  id?: unknown
  name?: unknown
  config?: unknown
  disabled?: unknown
  [key: string]: unknown
}

/** The parsed shape of a bundle patch's `disabled` override rows. */
interface DisablePatch {
  id?: unknown
  name?: unknown
  disabled?: unknown
  [key: string]: unknown
}

/** A parsed bundle-patch element: either an insert list or an override row. */
type PatchElement = { insert?: unknown; [key: string]: unknown } | DisablePatch

/** Parse failure: the patch contains a shape that can only activate on restart. */
export class RestartRequiredError extends Error {
  constructor(reason: string) {
    super(`bundle patch cannot hot-mount — ${reason}; restart to activate`)
    this.name = 'RestartRequiredError'
  }
}

/** Marker of a `!!js` expression parsed by `entryListSchema`. */
function isJsExpr(value: unknown): value is { __jsExpr: unknown } {
  return typeof value === 'object' && value !== null && '__jsExpr' in value
}

/**
 * Whether a value contains a `!!js` expression anywhere (recursively through
 * plain objects and arrays). The loader evaluates these only at entry
 * activation with a live context; the hot mounter cannot.
 */
function containsJsExpr(value: unknown): boolean {
  if (isJsExpr(value)) return true
  if (Array.isArray(value)) return value.some(containsJsExpr)
  if (typeof value === 'object' && value !== null) {
    return Object.values(value).some(containsJsExpr)
  }
  return false
}

/** Whether `value` is a plain static key-value object (no expressions). */
function isStaticConfig(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  return !containsJsExpr(value)
}

/** Require a string field, else throw RestartRequiredError. */
function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value === '') {
    throw new RestartRequiredError(`row ${field} must be a non-empty string`)
  }
  return value
}

/** Parse one `insert` list entry into a hot-mountable insert row. */
function parseInsertEntry(entry: InsertEntry): HotInsertRow {
  if (entry.id === undefined || entry.name === undefined) {
    throw new RestartRequiredError('an insert row needs both id and name')
  }
  const id = requireString(entry.id, 'id')
  const name = requireString(entry.name, 'name')
  if (entry.config !== undefined && !isStaticConfig(entry.config)) {
    throw new RestartRequiredError(`insert row "${id}" carries a config that is not static key-value (a !!js expression or a non-object)`)
  }
  // A `disabled: !!js` expression on an insert row cannot be re-evaluated.
  if (entry.disabled !== undefined && containsJsExpr(entry.disabled)) {
    throw new RestartRequiredError(`insert row "${id}" carries a !!js disabled expression`)
  }
  // Reject any other structural key the loader would interpret at boot
  // (group/inject/isolate/intercept) — those belong to the loaded tree, not a
  // hot pull-in, and would silently diverge.
  for (const key of Object.keys(entry)) {
    if (key === 'id' || key === 'name' || key === 'config' || key === 'disabled') continue
    throw new RestartRequiredError(`insert row "${id}" carries unsupported key "${key}"`)
  }
  const row: HotInsertRow = { kind: 'insert', id, name }
  if (entry.config !== undefined) row.config = entry.config
  return row
}

/** Parse one `disabled` override row into a hot-mountable disable row. */
function parseDisablePatch(patch: DisablePatch): HotDisableRow {
  if (patch.id === undefined) throw new RestartRequiredError('a disabled override needs an id')
  const id = requireString(patch.id, 'id')
  // A `disabled: !!js` expression cannot be re-evaluated here.
  if (patch.disabled === undefined || containsJsExpr(patch.disabled) || typeof patch.disabled !== 'boolean') {
    throw new RestartRequiredError(`disabled override "${id}" must carry a boolean disabled value (no !!js expression)`)
  }
  for (const key of Object.keys(patch)) {
    if (key === 'id' || key === 'disabled') continue
    // A `name` on an override restates the target's module — the loader's
    // patch semantics skip a mismatching name, so a hot override with a name
    // is a boot-time no-op at best and a divergence at worst. Refuse it.
    throw new RestartRequiredError(`disabled override "${id}" carries unsupported key "${key}"`)
  }
  return { kind: 'disable', id }
}

/**
 * Parse a bundle's `cordis.patch.yml` text into hot-mountable rows.
 *
 * Uses the include plugin's own `entryListSchema`, so the accepted dialect is
 * exactly what a boot loads. Rows that cannot hot-mount (expressions, nested
 * groups, non-key-value config, structural keys) throw {@link RestartRequiredError}.
 * @param patchText - the raw bundle patch text.
 * @returns the hot-mountable rows, in patch order.
 */
export function parsePatch(patchText: string): HotRow[] {
  let data: unknown
  try {
    data = yaml.load(patchText, { schema: entryListSchema })
  } catch (error) {
    throw new RestartRequiredError(`patch is not parseable YAML — ${error instanceof Error ? error.message : String(error)}`)
  }
  if (!Array.isArray(data)) {
    throw new RestartRequiredError('patch must be a top-level array')
  }
  if (data.length === 0) {
    throw new RestartRequiredError('patch declares no rows')
  }
  const rows: HotRow[] = []
  for (const element of data) {
    if (element === null || typeof element !== 'object' || Array.isArray(element)) {
      throw new RestartRequiredError('a patch element must be an object')
    }
    const patch = element as PatchElement
    if (patch.insert !== undefined) {
      if (!Array.isArray(patch.insert)) {
        throw new RestartRequiredError('an insert patch must carry an array')
      }
      for (const entry of patch.insert) {
        if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
          throw new RestartRequiredError('an insert list entry must be an object')
        }
        rows.push(parseInsertEntry(entry as InsertEntry))
      }
      continue
    }
    // A non-insert element is a per-id override row (disable/config/...).
    rows.push(parseDisablePatch(patch as DisablePatch))
  }
  return rows
}
