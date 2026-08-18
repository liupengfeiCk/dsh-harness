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
 * A subagent's model override, aligned with the runtime `ModelSelection`
 * shape so a dispatched child can apply it directly. `provider` is the
 * registered provider route and `model` the provider-owned model id.
 * `reasoningEffort` is intentionally not carried yet.
 */
export interface SubagentModel {
  /** Registered provider route (e.g. `deepseek-official`). */
  readonly provider: string
  /** Provider-owned model id (e.g. `deepseek-v4`). */
  readonly model: string
}

/**
 * Parse a subagent's stored model override.
 *
 * The current format is `{ provider, model }`. Pre-release storage may hold a
 * bare model string (the old format); that is tolerated by DISCARDING it —
 * the field reads as absent (inherit the parent) rather than crashing or
 * surfacing a value that lacks the provider the runtime needs. The discard is
 * a pre-release stance: no migration is written for a format that shipped
 * with no persisted instances in the wild.
 * @param value - the raw `model` value from the metadata file.
 * @returns the parsed override, or undefined when absent or old-format.
 */
function model(value: unknown): SubagentModel | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  const provider = text(record.provider)
  const id = text(record.model)
  if (provider === undefined || id === undefined) return undefined
  return { provider, model: id }
}

/** Display metadata a subagent may publish about itself. */
export interface SubagentMetadata {
  /** One sentence on what this subagent is for. */
  readonly description?: string
  /** Whether the subagent is enabled for delegation. */
  readonly enabled?: boolean
  /**
   * Model the dispatched child runs on. Absent leaves the child on the parent's
   * model, which is the default and the right answer for most helpers — a
   * heavy review task may want a deeper model than the parent's default, and
   * the override is where that decision lives.
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
  const override = metadata.model === undefined ? undefined
    : text(metadata.model.provider) === undefined || text(metadata.model.model) === undefined
      ? undefined
      : { provider: metadata.model.provider, model: metadata.model.model }
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
