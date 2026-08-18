/**
 * Reading, creating, editing, deleting, and toggling locally authored
 * subagents.
 *
 * Authoring is confined to a `user` root: the shipped `.system` set is part of
 * the deployment, and letting a browser rewrite it would turn "reset to a
 * known subagent" into something the same caller could have broken first.
 *
 * A subagent is its directory: a composition plus optional metadata. The only
 * creation write is a whole-directory copy of an existing subagent (a shipped
 * factory one is the primary source). Metadata edits and the enabled toggle
 * are structured writes against `subagent.yml`; the composition text itself is
 * never supplied across a seam — it is the author's to edit in the files.
 * @module dsh-harness-subagent-bundle/preset/authoring
 */

import { chmod, cp, readdir, readFile, rm, stat } from 'node:fs/promises'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'
import { dshHomePath, expandHomePath } from '../home-path.ts'
import { METADATA_FILE, readSubagentMetadata, renderSubagentMetadata, type SubagentMetadata } from './metadata.ts'
import { SUBAGENT_ID, type SubagentPreset, type SubagentRoot } from './types.ts'

/** A subagent id that cannot be used as a directory name under a root. */
export class InvalidSubagentIdError extends Error {
  constructor(
    /** The rejected id. */
    readonly subagentId: string,
  ) {
    super(
      `subagent-presets: subagent id ${JSON.stringify(subagentId)} must match ${String(SUBAGENT_ID)} — `
      + 'the id is a directory name, so anything else could escape the subagent root',
    )
  }
}

/** A create target that is already occupied — a create never overwrites. */
export class SubagentExistsError extends Error {
  constructor(
    /** The id that is already taken. */
    readonly subagentId: string,
  ) {
    super(
      `subagent-presets: subagent "${subagentId}" already exists — `
      + 'a create never overwrites; delete the existing subagent first or choose another id',
    )
  }
}

/** Authoring was attempted where the deployment allows none. */
export class SubagentNotWritableError extends Error {
  constructor(
    /** What the caller tried to change, for the diagnostic. */
    readonly subagentId: string,
    reason: string,
  ) {
    super(`subagent-presets: subagent "${subagentId}" cannot be written: ${reason}`)
  }
}

/**
 * Harness-home file holding a person's enabled-state overrides for SHIPPED
 * subagents. A shipped subagent's `subagent.yml` is part of the deployment and
 * stays untouched; the override lives beside the user's own subagents so it
 * survives upgrades and is readable by every deployment.
 */
export const ENABLED_OVERRIDES_FILE = 'subagents-enabled.json'

/**
 * Read the harness-home enabled overrides for shipped subagents.
 * @returns a map of subagent id to overridden enabled state.
 */
export async function readEnabledOverrides(): Promise<Readonly<Record<string, boolean>>> {
  let raw: string
  try {
    raw = await readFile(dshHomePath(ENABLED_OVERRIDES_FILE), 'utf8')
  } catch {
    return {}
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw) as unknown
  } catch {
    return {}
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {}
  return parsed as Record<string, boolean>
}

/**
 * Write one enabled override for a shipped subagent, preserving the rest.
 * @param id - the shipped subagent id.
 * @param enabled - the overridden enabled state.
 */
export async function writeEnabledOverride(id: string, enabled: boolean): Promise<void> {
  const overrides = { ...await readEnabledOverrides(), [id]: enabled }
  await writeFileAtomic(
    dshHomePath(ENABLED_OVERRIDES_FILE),
    `${JSON.stringify(overrides, null, 2)}\n`,
    { mode: 0o600, dirMode: 0o700 },
  )
}

/**
 * The root locally authored subagents are written to.
 * @param roots - the configured roots in precedence order.
 * @returns the absolute path of the first `user` root.
 * @throws when the deployment configured no writable root.
 */
export function writableRoot(roots: readonly SubagentRoot[]): string {
  const root = roots.find(candidate => candidate.trust === 'user')
  if (root === undefined) {
    throw new SubagentNotWritableError('', 'this deployment configures no user-writable subagent root')
  }
  return resolve(expandHomePath(root.path))
}

/**
 * Read one subagent's composition text.
 * @param subagent - the resolved subagent.
 * @returns the file's contents.
 */
export async function readComposition(subagent: SubagentPreset): Promise<string> {
  return await readFile(subagent.path, 'utf8')
}

/**
 * Write one subagent's composition text atomically.
 *
 * The write is confined to a locally authored subagent by the caller (the
 * shipped set is not writable); the file keeps its existing mode and is never
 * made world-readable, since a composition can carry `!!js` expressions that
 * run at load.
 * @param subagent - the resolved subagent.
 * @param content - the new contents.
 */
export async function writeComposition(subagent: SubagentPreset, content: string): Promise<void> {
  await writeFileAtomic(subagent.path, content, { mode: 0o600, dirMode: 0o700 })
}

/** Whether anything occupies the path (cp's own errorOnExist backstops races). */
async function occupied(path: string): Promise<boolean> {
  let present = true
  try {
    await stat(path)
  } catch {
    present = false
  }
  return present
}

/**
 * Re-tighten a copied tree to owner-only. A shipped subagent is world-readable
 * in its install and `cp` preserves that; the copy carries the same weight as
 * the settings document beside it, so group/other access is stripped.
 */
async function tightenModes(dir: string): Promise<void> {
  await chmod(dir, 0o700)
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const target = join(dir, entry.name)
    if (entry.isDirectory()) {
      await tightenModes(target)
    } else {
      /* v8 ignore next -- Windows exposes no POSIX owner-execute bit */
      await chmod(target, ((await stat(target)).mode & 0o100) === 0 ? 0o600 : 0o700)
    }
  }
}

/**
 * Create a subagent by copying an existing one's whole directory.
 *
 * The copy carries everything the source directory holds — composition,
 * metadata, skill directories, assets — because a subagent is its directory,
 * not one file. Symlinks are dereferenced so the copy is self-contained.
 * The copied metadata is then rewritten: the source's fields are kept as
 * they stand (the copy is an exact duplicate of the source's metadata).
 * @param roots - the configured roots; the first `user` one receives the copy.
 * @param source - the resolved subagent the copy starts from.
 * @param id - the new subagent's id, which becomes its directory name.
 * @returns the absolute path of the new subagent directory.
 * @throws when the id is unusable or already occupied on disk, or the
 * deployment configures no writable root.
 */
export async function createSubagent(
  roots: readonly SubagentRoot[],
  source: SubagentPreset,
  id: string,
): Promise<string> {
  if (!SUBAGENT_ID.test(id)) throw new InvalidSubagentIdError(id)
  const dir = join(writableRoot(roots), id)
  if (await occupied(dir)) throw new SubagentExistsError(id)
  try {
    await cp(dirname(source.path), dir, {
      recursive: true, dereference: true, force: false, errorOnExist: true,
    })
    await tightenModes(dir)
    const sourceMeta = await readSubagentMetadata(dirname(source.path))
    // The metadata rides through whole so a new field is copied without this
    // authoring seam changing.
    const rendered = renderSubagentMetadata(sourceMeta)
    const metadataPath = join(dir, METADATA_FILE)
    if (rendered === undefined) {
      await rm(metadataPath, { force: true })
    } else {
      await writeFileAtomic(metadataPath, rendered, { mode: 0o600, dirMode: 0o700 })
    }
  } catch (error) {
    await rm(dir, { recursive: true, force: true })
    throw error
  }
  return dir
}

/**
 * Delete a locally authored subagent.
 *
 * A shipped subagent is refused: it belongs to the deployment. A subagent a
 * live child mounted is NOT refused — the composition was read at creation and
 * is never re-read, so that child keeps running exactly as it was.
 * @param roots - the configured roots.
 * @param subagent - the resolved subagent to remove.
 * @throws when the subagent ships with the deployment or lies outside the
 * writable root.
 */
export async function deleteSubagent(
  roots: readonly SubagentRoot[],
  subagent: SubagentPreset,
): Promise<void> {
  if (subagent.trust !== 'user') {
    throw new SubagentNotWritableError(subagent.id, 'it ships with the deployment')
  }
  const dir = join(writableRoot(roots), subagent.id)
  if (!isAbsolute(subagent.path) || !subagent.path.startsWith(dir)) {
    throw new SubagentNotWritableError(subagent.id, 'it does not live under the writable subagent root')
  }
  await rm(dir, { recursive: true, force: true })
}

/** The editable fields one update writes to a subagent's metadata. */
/**
 * Rewrite a locally authored subagent's metadata as a WHOLE.
 *
 * The metadata object the caller passes is the complete intended metadata: a
 * key that appears is written with that value, a key that is absent is
 * cleared. This is deliberate — an edit form submits every field it owns, so
 * clearing a description (an empty string) or resetting the model (an empty
 * pick, "inherit the parent") genuinely removes the stored value rather than
 * silently keeping the old one. The enabled switch rides this channel too
 * when a form submits the full surface. A shipped subagent is refused, exactly
 * like delete — its install is not the user's to manage.
 * @param roots - the configured roots.
 * @param subagent - the resolved subagent to edit.
 * @param metadata - the complete metadata to store; absent keys are cleared.
 * @throws when the subagent ships with the deployment or lies outside the
 * writable root.
 */
export async function updateSubagent(
  roots: readonly SubagentRoot[],
  subagent: SubagentPreset,
  metadata: SubagentMetadata,
): Promise<void> {
  if (subagent.trust !== 'user') {
    throw new SubagentNotWritableError(subagent.id, 'it ships with the deployment')
  }
  const dir = join(writableRoot(roots), subagent.id)
  if (!isAbsolute(subagent.path) || !subagent.path.startsWith(dir)) {
    throw new SubagentNotWritableError(subagent.id, 'it does not live under the writable subagent root')
  }
  await writeSubagentMetadata(dir, metadata)
}

/**
 * Flip one locally authored subagent's enabled switch, leaving its other
 * metadata fields alone.
 *
 * This is the row-level toggle's write path: unlike {@link updateSubagent}'s
 * whole-metadata replace, it touches only the enabled key so a shipped or
 * locally authored row's description and model survive a toggle. A shipped
 * subagent is refused here — its override is written by the caller through
 * {@link writeEnabledOverride}.
 * @param roots - the configured roots.
 * @param subagent - the resolved subagent to edit.
 * @param enabled - the new enabled state.
 * @throws when the subagent ships with the deployment or lies outside the
 * writable root.
 */
export async function setEnabledField(
  roots: readonly SubagentRoot[],
  subagent: SubagentPreset,
  enabled: boolean,
): Promise<void> {
  if (subagent.trust !== 'user') {
    throw new SubagentNotWritableError(subagent.id, 'it ships with the deployment')
  }
  const dir = join(writableRoot(roots), subagent.id)
  if (!isAbsolute(subagent.path) || !subagent.path.startsWith(dir)) {
    throw new SubagentNotWritableError(subagent.id, 'it does not live under the writable subagent root')
  }
  const current = await readSubagentMetadata(dir)
  await writeSubagentMetadata(dir, { ...current, enabled })
}

/**
 * Write one locally authored subagent's metadata file, removing it when the
 * metadata has nothing to store.
 * @param dir - the subagent directory.
 * @param metadata - the metadata to store.
 */
async function writeSubagentMetadata(dir: string, metadata: SubagentMetadata): Promise<void> {
  const rendered = renderSubagentMetadata(metadata)
  const metadataPath = join(dir, METADATA_FILE)
  if (rendered === undefined) {
    await rm(metadataPath, { force: true })
  } else {
    await writeFileAtomic(metadataPath, rendered, { mode: 0o600, dirMode: 0o700 })
  }
}
