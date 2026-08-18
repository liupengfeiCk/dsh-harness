/**
 * Filesystem discovery of user-defined helper subagents. A subagent is a
 * directory holding {@link COMPOSITION_FILE}, optionally beside a
 * {@link METADATA_FILE} carrying its display text and product fields; the
 * directory name is the subagent id. Discovery re-reads the roots on every
 * call so a subagent authored while the process is running is visible without
 * a restart.
 *
 * Discovery also owns subagent HEALTH: a directory whose composition is
 * missing or unloadable is reported as a broken roster row rather than
 * skipped. A skipped directory would still occupy its id on disk — the copy
 * path refuses the name while no surface shows anything to delete — and a
 * malformed composition would otherwise read as an ordinary subagent until
 * the first delegation fails to mount it.
 * @module dsh-harness-subagent-bundle/preset/discovery
 */

import { readdir, readFile, stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { load } from 'js-yaml'
import { entryListSchema } from '@deepseek-ai/cordis-plugin-include'
import { expandHomePath } from '../home-path.ts'
import { readEnabledOverrides } from './authoring.ts'
import { readSubagentMetadata } from './metadata.ts'
import { SUBAGENT_ID, type SubagentPreset, type SubagentRoot } from './types.ts'

/** The composition file that makes a directory a subagent. */
export const COMPOSITION_FILE = 'agent.cordis.yml'

/**
 * Harness-home directory holding locally authored subagents.
 *
 * This package owns the writable root the way `dsh-agent-presets` owns
 * `.agent-presets`. An app must assemble the SHIPPED root, whose path only the
 * installed app can resolve; where a person's own subagents go is the same
 * place in every deployment that does not say otherwise.
 */
export const USER_SUBAGENT_DIR = 'subagents'

/**
 * Why `rows` cannot be an entry list, or undefined when it can.
 *
 * A shallow shape check, deliberately short of the loader's work: it does not
 * resolve plugin names or apply configs. What it catches is the hand-edit
 * that produces a file the loader cannot even begin with.
 * @param rows - the parsed composition document.
 * @param at - row-path prefix for nested diagnostics, empty at the top level.
 * @returns one human-readable reason, or undefined when the shape holds.
 */
function entryListProblem(rows: unknown, at = ''): string | undefined {
  if (!Array.isArray(rows)) {
    return at === ''
      ? 'the composition must be a top-level list of plugin rows'
      : `group ${at} must hold a list of plugin rows`
  }
  for (const [index, row] of rows.entries()) {
    const label = at === '' ? `row ${String(index + 1)}` : `${at} row ${String(index + 1)}`
    if (typeof row !== 'object' || row === null || Array.isArray(row)) {
      return `${label} is not a plugin row (expected a map with a "name")`
    }
    const { name, group, config } = row as { name?: unknown; group?: unknown; config?: unknown }
    if (typeof name !== 'string' || name === '') {
      return `${label} names no plugin (a "name" string is required)`
    }
    if (group === true) {
      const nested = entryListProblem(config, label)
      if (nested !== undefined) return nested
    }
  }
  return undefined
}

/**
 * Why the composition at `path` cannot mount, or undefined when it looks
 * loadable. Parsed with the loader's own YAML dialect ({@link entryListSchema}),
 * so health can never call a subagent broken that the loader would accept.
 * @param path - absolute path of the composition file.
 * @returns one human-readable reason, or undefined when the file is loadable.
 */
async function compositionProblem(path: string): Promise<string | undefined> {
  let content: string
  try {
    content = await readFile(path, 'utf8')
  } catch {
    return `the composition file ${COMPOSITION_FILE} cannot be read`
  }
  let rows: unknown
  try {
    rows = load(content, { schema: entryListSchema })
  } catch (error) {
    /* v8 ignore next -- js-yaml throws YAMLException (an Error) for every parse failure */
    const full = error instanceof Error ? error.message : String(error)
    return `the composition is not valid YAML: ${full.replace(/\n[\s\S]*$/, '')}`
  }
  return entryListProblem(rows)
}

/**
 * Whether `path` names an existing regular file.
 * @param path - absolute path to test.
 * @returns true when the path resolves to a file.
 */
async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile()
  } catch {
    return false
  }
}

/**
 * Scan one root for subagent directories.
 *
 * An absent root yields no subagents rather than throwing: the user root does
 * not exist until the first locally authored subagent, and naming a default
 * that no root supplies already fails loud at resolution.
 *
 * Every directory whose name is a usable subagent id is a roster row — broken
 * when its composition is missing or unloadable. A directory named outside
 * {@link SUBAGENT_ID} is skipped instead: no copy could ever claim that name.
 * @param root - the directory and the trust its subagents inherit.
 * @returns the root's subagents ordered by id.
 */
export async function scanRoot(root: SubagentRoot): Promise<SubagentPreset[]> {
  const dir = resolve(expandHomePath(root.path))
  let children
  try {
    children = await readdir(dir, { withFileTypes: true })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw new Error(`subagent-presets: cannot read subagent root ${dir}: ${String(error)}`, { cause: error })
  }
  const found: SubagentPreset[] = []
  for (const child of children) {
    if (!child.isDirectory() || !SUBAGENT_ID.test(child.name)) continue
    const directory = join(dir, child.name)
    const path = join(directory, COMPOSITION_FILE)
    const broken = await isFile(path)
      ? await compositionProblem(path)
      : `the composition file ${COMPOSITION_FILE} is missing — the directory still occupies the id; delete it or restore the file`
    // Display text and product fields only, and never fatal: a subagent with
    // unreadable metadata still mounts, it just shows its id and defaults.
    // The metadata rides as one nested object so a new metadata field never
    // needs this discovery seam to change.
    const metadata = await readSubagentMetadata(directory)
    found.push({
      id: child.name,
      trust: root.trust,
      path,
      metadata,
      ...broken === undefined ? {} : { broken },
    })
  }
  return found.sort((left, right) => left.id.localeCompare(right.id))
}

/**
 * Scan every root in precedence order.
 * @param roots - roots in precedence order; an earlier root wins a duplicate id.
 * @returns every discovered subagent, first-root-wins per id.
 */
export async function discoverSubagents(roots: readonly SubagentRoot[]): Promise<SubagentPreset[]> {
  const byId = new Map<string, SubagentPreset>()
  for (const root of roots) {
    for (const subagent of await scanRoot(root)) {
      if (byId.has(subagent.id)) continue
      byId.set(subagent.id, subagent)
    }
  }
  // A person's enabled override applies to a shipped subagent exactly as to a
  // locally authored one: the row's switch shows what delegation will honor.
  const overrides = await readEnabledOverrides()
  return [...byId.values()].map(subagent => {
    const enabled = overrides[subagent.id]
    return enabled === undefined
      ? subagent
      : { ...subagent, metadata: { ...subagent.metadata, enabled } }
  })
}
