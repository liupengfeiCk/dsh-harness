/**
 * A subagent's display metadata: the description, enabled switch, and model.
 *
 * It lives in its own file (`subagent.yml`) because the composition is a
 * top-level list of plugin rows — YAML cannot carry sibling keys beside it,
 * and faking a metadata row would hand the Loader something to load. Keeping
 * it separate also keeps the composition exactly what its name says: a Cordis
 * file the loader owns.
 *
 * The file carries display text plus the enabled switch. `id` is the directory
 * name and `trust` comes from the root a subagent was discovered under, so
 * neither is writable here — otherwise a locally authored subagent could
 * claim to be a shipped one. The subagent's persona and tool surface live in
 * its composition, exactly as an agent preset's do.
 *
 * Every read failure degrades to empty metadata: a subagent whose metadata is
 * missing, malformed, or unreadable still mounts its composition (presentation
 * is not a capability). Only the composition's loadability decides `broken`.
 * @module dsh-harness-subagent-bundle/preset/metadata
 */

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import yaml from 'js-yaml'

/** The optional metadata file beside a subagent's composition. */
export const METADATA_FILE = 'subagent.yml'

/** A non-empty trimmed string, or undefined for anything else. */
function text(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed === '' ? undefined : trimmed
}

/** A literal boolean, or undefined for anything else. */
function flag(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}

/**
 * A subagent's model override, now a MODEL-PLAN id (a "模型方案") rather than a
 * bare `{ provider, model }` pair. The plan is a fixed asset the deployment
 * owns; the subagent binds it by id, and at delegation the child session is
 * pointed at that plan so the model-plan merge interceptor routes the child's
 * requests to the plan's provider/model/params (reference semantics — editing
 * the plan changes what a bound subagent uses on its NEXT delegation).
 *
 * `reasoningEffort` is intentionally not carried here: it lives in the plan's
 * params bag, not on the subagent.
 */
export type SubagentModel = string

/**
 * Parse a subagent's stored model override.
 *
 * The current format is a single plan id string (e.g. `flash2`). Pre-release
 * storage may hold the OLD `{ provider, model }` object (or an even-older bare
 * model string without a provider); that is tolerated by DISCARDING it — the
 * field reads as absent (inherit the parent) rather than crashing or
 * surfacing a value the runtime can no longer route. The discard is a
 * pre-release stance: no migration is written for a format that shipped with
 * no persisted instances in the wild.
 * @param value - the raw `model` value from the metadata file.
 * @returns the plan id, or undefined when absent or old-format.
 */
function model(value: unknown): SubagentModel | undefined {
  // A plan id is a bare string; anything else (the old object form, numbers,
  // arrays) is pre-release and reads as absent. A blank string is also absent.
  if (typeof value !== 'string') return undefined
  return value.trim() === '' ? undefined : value.trim()
}

/** Display metadata a subagent may publish about itself. */
export interface SubagentMetadata {
  /** One sentence on what this subagent is for. */
  readonly description?: string
  /** Whether the subagent is enabled for delegation. */
  readonly enabled?: boolean
  /**
   * Model-plan id the dispatched child binds. Absent leaves the child on the
   * parent's model, which is the default and the right answer for most
   * helpers — a heavy review task may bind a deeper plan than the parent's
   * default, and the binding is where that decision lives. The value is a plan
   * id (a "模型方案"), never a bare `{ provider, model }`.
   */
  readonly model?: SubagentModel
  /**
   * Whether the delegated child also inherits the main agent's current preset
   * before the subagent's own tree is mounted on top.
   *
   * Absent (or `false`) means the subagent is self-contained: the child runs
   * ONLY on the subagent's own tree, so its tool/persona surface is exactly
   * what the subagent's composition carries. `true` means the child first
   * inherits the parent's full preset composition and then overlays the
   * subagent's own tree, with the subagent winning on name conflicts.
   *
   * The stored file carries the key ONLY when it is `true`; `false`/absent is
   * rendered as no key at all, keeping the file clean. Parsing therefore reads
   * the field as `true | undefined`, where `undefined` means "no inheritance".
   */
  readonly inheritParent?: boolean
}

/**
 * Read one subagent directory's metadata.
 *
 * Absent, unparsable, and wrongly-shaped files are all the same answer —
 * empty metadata — because the caller renders a picker or a roster row, not a
 * diagnostic. A subagent with no metadata still mounts its composition; it
 * just shows its id and defaults.
 * @param directory - the subagent directory.
 * @returns the metadata the subagent published, possibly empty.
 */
export async function readSubagentMetadata(directory: string): Promise<SubagentMetadata> {
  let raw: string
  try {
    raw = await readFile(join(directory, METADATA_FILE), 'utf8')
  } catch {
    // Absent is the common case: metadata is optional.
    return {}
  }
  let parsed: unknown
  try {
    parsed = yaml.load(raw)
  } catch {
    // Malformed display text is not worth failing discovery over; the roster
    // falls back to the id, and the composition still mounts.
    return {}
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {}
  const record = parsed as Record<string, unknown>
  const description = text(record.description)
  const enabled = flag(record.enabled)
  const override = model(record.model)
  const inheritParent = flag(record.inheritParent)
  return {
    ...description === undefined ? {} : { description },
    ...enabled === undefined ? {} : { enabled },
    ...override === undefined ? {} : { model: override },
    ...inheritParent === undefined ? {} : { inheritParent },
  }
}

/**
 * Render metadata as the file's contents.
 *
 * Absent fields are omitted rather than written empty, so a subagent with no
 * description does not ship a key that reads as an intentional blank.
 * @param metadata - the display and product metadata to store.
 * @returns the YAML document, or undefined when there is nothing to store.
 */
export function renderSubagentMetadata(metadata: SubagentMetadata): string | undefined {
  const description = text(metadata.description)
  const { enabled } = metadata
  const override = metadata.model === undefined
    ? undefined
    : typeof metadata.model === 'string' && metadata.model.trim() !== ''
      ? metadata.model.trim()
      : undefined
  // `inheritParent` is rendered only when it is exactly `true`: `false` and
  // absent both mean "no inheritance", and writing the key for either would
  // only dirty a file that reads the same either way.
  const inheritParent = metadata.inheritParent === true
  if (description === undefined && enabled === undefined && override === undefined && !inheritParent) {
    return undefined
  }
  return yaml.dump({
    ...description === undefined ? {} : { description },
    ...enabled === undefined ? {} : { enabled },
    ...override === undefined ? {} : { model: override },
    ...inheritParent ? { inheritParent } : {},
  }, { lineWidth: -1 })
}
