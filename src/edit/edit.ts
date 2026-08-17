/**
 * Structured, line-scoped edits to a preset composition.
 *
 * A preset composition is a text file the loader owns (it carries `!!js`
 * expressions and hand-authored comments), so editing it must not round-trip
 * it through a YAML dump: a dump would discard every comment and re-emit the
 * rows in whatever order the loader's tree happened to hold. This module
 * instead locates the editable rows by indentation and rewrites only the
 * target key lines, leaving everything else byte-for-byte intact.
 *
 * The editable surface is deliberately small and stable:
 * - the top-level `persona` row's `config.text` (the agent's system prompt),
 * - the `delegation` group's `tool-subagent` rows — EVERY instance in the
 *   group, one per row, keyed by its instance id (`tool-subagent`,
 *   `tool-subagent-fork`, `tool-subagent-codex`, `tool-subagent-claude-code`),
 *   offering every config key that instance's provider capabilities support
 *   (spawn/fork can enforce `maxDepth` and run `continuable`, so they expose
 *   `backgroundMode` and `maxDepth`; codex/claude-code declare no such
 *   capability, so those keys are withheld). A field the file omits returns
 *   the loader's default, so the form shows the full capability surface rather
 *   than being clipped to the keys the row happens to write,
 * - the tool rows (top-level and nested, `name` of the form
 *   `@deepseek-ai/dsh-tool-*`) and whether each is enabled, for a tool
 *   inventory toggle.
 *
 * The delegation rows' `provider` is read-only identity (never offered for
 * editing) and `toolName` is read but not exposed either: it is what the model
 * calls, and editing it is out of scope for this surface.
 *
 * Tool descriptions and the installable catalog are sourced from the
 * RUNTIME package tree (see {@link discoverToolPackages}): a package a
 * preset row can reference is a package installed beside this one. A
 * deployment reading no packages still lists every tool row by id and
 * disabled state, just without prose and with an empty catalog.
 *
 * Every shape check goes through the loader's own dialect (`entryListSchema`,
 * the one carrying `!!js`), so an edit can never be judged loadable that the
 * loader would reject.
 * @module dsh-harness-agent-preset-editing-bundle/edit
 */

import { readdirSync, readFileSync, type Dirent } from 'node:fs'
import { dirname, join } from 'node:path'
import { dump, load } from 'js-yaml'
import { entryListSchema } from '@deepseek-ai/cordis-plugin-include'

/** The delegation row's config keys the surface may edit. */
export type DelegationKey =
  | 'provider'
  | 'backgroundMode'
  | 'enableRunInBackground'
  | 'maxDepth'
  | 'toolName'

/** One `tool-subagent` instance's current config, clipped to present keys. */
export type DelegationConfig = Partial<Record<DelegationKey, unknown>>

/** How a tool row's disabled state reads: a literal, or a loader `!!js` expression. */
export type ToolDisabledState = boolean | 'expr'

/**
 * One delegation instance the form may edit. The keys published are decided by
 * the instance's provider capabilities, not by which keys the row happens to
 * write: every capability-supported field is present, carrying the row's own
 * value when it writes one and the loader default otherwise. `provider` is
 * read-only identity and `toolName` is present for the host's uniqueness check,
 * but neither is offered for editing.
 */
export interface DelegationInstance {
  /** The instance id within the delegation group (`tool-subagent`, …). */
  readonly id: string
  /** Whether the instance is disabled, when the row carries a literal value. */
  readonly disabled?: boolean
  /** The delegation provider (read-only identity). */
  readonly provider?: string
  /** The background mode; always present (loader default `one-shot`). */
  readonly backgroundMode?: string
  /** Whether the background-mode choice is locked to `one-shot` because the
   *  provider cannot run continuable work (codex/claude-code). The form renders
   *  the field for every instance so the layout stays uniform, but disables it
   *  when locked. */
  readonly backgroundModeLocked: boolean
  /** Whether the instance allows background runs (provider-independent). */
  readonly enableRunInBackground?: boolean
  /** The max-depth policy; present only when the provider can enforce a cap. */
  readonly maxDepth?: unknown
  /** The tool name the model calls; read for uniqueness, never edited here. */
  readonly toolName?: string
}

/** One tool row in the inventory: its id, package, enabled state, and prose. */
export interface ToolRow {
  /** The row's `- id:` (e.g. `tool-bash`). */
  readonly id: string
  /** The row's `name` (e.g. `@deepseek-ai/dsh-tool-bash`). */
  readonly name: string
  /**
   * Whether the row is enabled. A literal `true`/`false` is toggleable; a
   * loader `!!js` expression is not the user's to flip (it is a build-time
   * condition), so it reads as `'expr'` and a toggle request is refused.
   */
  readonly disabled: ToolDisabledState
  /** One-sentence tool description, when `docs/tool-catalog.md` is readable. */
  readonly description?: string
}

/**
 * One installable tool package in the "available tools" directory, as
 * discovered at runtime. `installed` is whether the preset already carries a
 * row naming this package, so a form can offer the not-yet-installed ones
 * and hide (or disable) the rest.
 */
export interface CatalogTool {
  /** The plugin package name (e.g. `@deepseek-ai/dsh-tool-fs`). */
  readonly name: string
  /**
   * The model-visible tool names the package registers. Not enumerated at
   * runtime (the wire shape keeps the field, always empty here): the form
   * renders the package, not its members.
   */
  readonly toolNames: readonly string[]
  /** One-sentence description, when the package's own manifest publishes one. */
  readonly description?: string
  /** Whether the preset already carries a row naming this package. */
  readonly installed: boolean
}

/**
 * The editable fields a preset currently publishes, for the form to seed from.
 *
 * `delegation` lists every `tool-subagent` instance in the delegation group,
 * each carrying the fields its provider capabilities support (with loader
 * defaults for omitted keys). `tools` lists every tool row (top-level and
 * nested) with its enabled state.
 */
export interface EditableFields {
  /** The `persona` row's prompt text, when the row and its `config.text` exist. */
  readonly persona?: { readonly text: string }
  /** Every delegation instance, in file order, by provider capability. */
  readonly delegation: readonly DelegationInstance[]
  /** Every tool row, in file order, with its enabled state. */
  readonly tools: readonly ToolRow[]
  /**
   * Every installable tool package discovered at runtime, each marked with
   * whether the preset already carries it. The form offers the
   * `installed: false` ones for adding without hand-editing the yaml.
   */
  readonly catalog: readonly CatalogTool[]
}

/** Why an edit set cannot be applied, naming the row and the failing field. */
export class InvalidPresetEditsError extends Error {
  constructor(
    /** The preset the edit targeted. */
    readonly presetId: string,
    /** One human-readable reason, naming the row and field. */
    readonly reason: string,
  ) {
    super(`agent-presets: cannot edit preset "${presetId}": ${reason}`)
  }
}

/** A located block over a `config:` key section, holding its key lines. */
interface ConfigBlock {
  /** Index of the `config:` line. */
  readonly line: number
  /** Column the config keys are indented to. */
  readonly keyIndent: number
  /** One line per present key, in file order: `{ key, value, line }`. */
  readonly keys: readonly { key: string; value: string; line: number }[]
  /** Index just past the block's last line, so an insertion lands inside it. */
  readonly end: number
}

/** Split on line boundaries, preserving a trailing empty line when present. */
function linesOf(content: string): string[] {
  return content.split('\n')
}

/** Indent width of a line (spaces before its first non-space char). */
function indentOf(line: string): number {
  let width = 0
  while (width < line.length && line[width] === ' ') width += 1
  return width
}

/** The trimmed body of a line (leading indentation removed). */
function bodyOf(line: string): string {
  return line.trim()
}

/** A `- id: X` row at some indent, or undefined when the line is not one. */
function rowId(line: string): { indent: number; id: string } | undefined {
  const body = bodyOf(line)
  if (!body.startsWith('- id:')) return undefined
  const id = body.slice('- id:'.length).trim()
  if (id === '') return undefined
  return { indent: indentOf(line), id }
}

/**
 * The lines that form one `- id:` row's key/value block, until the next line
 * of shallower indent (a sibling row) or the file end. Every line at the row's
 * key indent or deeper belongs to it — the keys themselves, a multi-line value,
 * and a nested list (a group's config).
 * @param lines - the composition split into lines.
 * @param row - the located row.
 * @returns the first and one-past-last line of the block.
 */
function rowBlock(lines: readonly string[], row: LocatedRow): { start: number; end: number } {
  const start = row.line + 1
  let end = start
  while (end < lines.length) {
    const line = lines[end]
    if (line === undefined) break
    if (line.trim() === '') {
      end += 1
      continue
    }
    if (indentOf(line) < row.keyIndent) break
    end += 1
  }
  return { start, end }
}

/** One top-level `- id:` row, located by line so a later edit can address it. */
interface LocatedRow {
  /** Index of the `- id:` line in the composition. */
  readonly line: number
  /** Column the row's keys are indented to (the `id` line's indent + 2). */
  readonly keyIndent: number
  /** Index of the `config:` line, or -1 when the row carries no config. */
  readonly configLine: number
  /** Column `config:`'s keys are indented to (config's indent + 2). */
  readonly configKeyIndent: number
}

/**
 * Locate one top-level `- id:` row and its `config:` block.
 * @param lines - the composition split into lines.
 * @param id - the row id to find.
 * @returns the located row, or undefined when absent.
 */
function locateRow(lines: readonly string[], id: string): LocatedRow | undefined {
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    if (line === undefined) continue
    const match = rowId(line)
    if (match === undefined || match.indent !== 0 || match.id !== id) continue
    const { start, end } = rowBlock(lines, { line: index, keyIndent: 2, configLine: -1, configKeyIndent: 4 })
    const configLine = findConfigLine(lines, start, end)
    return {
      line: index,
      keyIndent: 2,
      configLine,
      configKeyIndent: configLine === -1 ? -1 : 4,
    }
  }
  return undefined
}

/** Index of the `config:` line inside [start, end), or -1 when absent. */
function findConfigLine(lines: readonly string[], start: number, end: number): number {
  for (let index = start; index < end; index += 1) {
    const line = lines[index]
    if (line === undefined) continue
    if (bodyOf(line) === 'config:') return index
  }
  return -1
}

/** The present key lines of a `config:` block. */
function configKeys(lines: readonly string[], config: LocatedRow): ConfigBlock {
  const keyIndent = config.configKeyIndent
  const keys: { key: string; value: string; line: number }[] = []
  let end = config.configLine + 1
  while (end < lines.length) {
    const line = lines[end]
    if (line === undefined) break
    const body = bodyOf(line)
    if (body === '' || indentOf(line) < keyIndent) break
    if (indentOf(line) > keyIndent) {
      // A multi-line value (a block scalar) belongs to the key before it.
      end += 1
      continue
    }
    const colon = body.indexOf(':')
    if (colon <= 0) {
      // A nested list item (`- id:`) or malformed line: stop the key scan —
      // this config block is a group list, not a flat key map.
      break
    }
    keys.push({
      key: body.slice(0, colon),
      value: body.slice(colon + 1).trim(),
      line: end,
    })
    end += 1
  }
  return { line: config.configLine, keyIndent, keys, end }
}

/**
 * Render a scalar value as the content after `key:`, at the given indent.
 *
 * A single-line value stays inline; a value with line breaks becomes a literal
 * block indented to the key's own column, which is what js-yaml reads back as
 * the same string. The rendered lines are returned with the key's indent
 * applied so the caller can splice them in place.
 * @param key - the key name.
 * @param value - the scalar to render.
 * @param indent - column the key sits at.
 * @returns the rendered `key: value` lines.
 */
function renderKeyLines(key: string, value: unknown, indent: number): string[] {
  const rendered = dump(value, { lineWidth: -1 }).trimEnd()
  const pad = ' '.repeat(indent)
  const [first, ...rest] = rendered.split('\n')
  return [`${pad}${key}: ${first}`, ...rest.map(line => `${pad}${line}`)]
}

/**
 * Rewrite the scalar keys of one config block.
 *
 * Only keys named in `edits` are touched; every other key line — and every
 * non-config line in the file — is left byte-for-byte intact. A key present in
 * the block is replaced (or cleared by `undefined`); a key absent but in
 * `allowed` is INSERTED, because the surface now offers every
 * capability-supported field even when the row omits it. A key outside
 * `allowed` (e.g. the read-only `provider`) is refused.
 * @param lines - the composition split into lines.
 * @param block - the config block to edit.
 * @param edits - the key→value writes; `undefined` clears a present key.
 * @param presetId - the preset id, for the refusal diagnostic.
 * @param allowed - the keys this surface may write.
 * @returns the edited lines.
 */
function editConfigKeys(
  lines: string[],
  block: ConfigBlock,
  edits: Record<string, unknown>,
  presetId: string,
  allowed: readonly string[],
): string[] {
  // Collect operations first so a refusal leaves the caller's array untouched.
  // `order` records the edit's declaration position so sibling insertions at
  // the same index land in the user's declared order, not reversed.
  const ops: { index: number; remove: number; insert: string[]; order: number }[] = []
  let order = 0
  for (const [key, value] of Object.entries(edits)) {
    if (!allowed.includes(key)) {
      throw new InvalidPresetEditsError(presetId, `the ${key} key is not editable on the target row`)
    }
    const present = block.keys.find(candidate => candidate.key === key)
    if (present === undefined) {
      // Absent but allowed: insert a new key line. It lands after the block's
      // last present key (block.end), so the composition stays a flat key map.
      if (value === undefined) {
        throw new InvalidPresetEditsError(presetId, `cannot clear an absent ${key} key`)
      }
      ops.push({ index: block.end, remove: 0, insert: renderKeyLines(key, value, block.keyIndent), order })
    } else if (value === undefined) {
      ops.push({ index: present.line, remove: 1, insert: [], order })
    } else {
      ops.push({ index: present.line, remove: 1, insert: renderKeyLines(key, value, block.keyIndent), order })
    }
    order += 1
  }
  // Apply from the bottom up so earlier indexes stay valid while later ones
  // are already spliced. Insertions sit at block.end (the deepest index), so
  // they land before replacements at shallower lines. A splice at a shared
  // index front-inserts, so multiple absent-key insertions would otherwise
  // come out reversed; ordering those by declaration position (later declared
  // first, so the earlier one front-inserts last and ends up on top) keeps the
  // resulting lines in the same order the user staged them.
  const out = [...lines]
  for (const op of ops.sort((a, b) => {
    if (b.index !== a.index) return b.index - a.index
    if (a.remove === 0 && b.remove === 0) return b.order - a.order
    return 0
  })) {
    out.splice(op.index, op.remove, ...op.insert)
  }
  return out
}

/** A parsed composition row, as `entryListSchema` yields it. */
interface ParsedRow {
  id?: unknown
  group?: unknown
  config?: unknown
  disabled?: unknown
  name?: unknown
}

/** A nested row inside a group's config list. */
interface ParsedNestedRow {
  id?: unknown
  config?: unknown
  disabled?: unknown
  name?: unknown
}

/** A row's config as a record, or undefined when it is not one. */
function asConfig(config: unknown): Record<string, unknown> | undefined {
  return typeof config === 'object' && config !== null && !Array.isArray(config)
    ? config as Record<string, unknown>
    : undefined
}

/**
 * The delegation config keys a surface may WRITE. `provider` (identity) and
 * `toolName` (the model-call name) are read-only and never offered for editing,
 * so they are deliberately absent here: a request naming either is refused by
 * the allowed-key gate in {@link editConfigKeys}.
 */
const DELEGATION_WRITABLE_KEYS: readonly string[] = [
  'backgroundMode', 'enableRunInBackground', 'maxDepth',
]

/** The loader default for an omitted `backgroundMode` (tool-subagent Config). */
const DEFAULT_BACKGROUND_MODE = 'one-shot'
/** The loader default for an omitted `enableRunInBackground` (tool-subagent Config). */
const DEFAULT_ENABLE_RUN_IN_BACKGROUND = true
/** The loader default for an omitted `maxDepth` (tool-subagent Config). */
const DEFAULT_MAX_DEPTH = 3

/**
 * Which delegation config fields one provider's capabilities make editable.
 *
 * Mirrors the subagent backends' capability declarations: `spawn`/`fork`
 * declare `depthLimit: true` and implement `prepareContinuable`, so a numeric
 * `maxDepth` is enforceable and `backgroundMode: continuable` is runnable;
 * `codex`/`claude-code` declare `NO_START_CAPABILITIES` and no
 * `prepareContinuable`, so only `enableRunInBackground` (provider-independent)
 * is offered. An unknown provider is treated conservatively as having neither
 * capability, so the form never promises a control a provider cannot back.
 */
interface ProviderFieldSet {
  /** Whether the provider can enforce a numeric `maxDepth` (depthLimit). */
  readonly hasDepthLimit: boolean
  /** Whether the provider supports `backgroundMode: continuable`. */
  readonly hasContinuable: boolean
}

/** Provider name → the field set its capabilities back. */
const PROVIDER_FIELDS: Readonly<Record<string, ProviderFieldSet>> = {
  spawn: { hasDepthLimit: true, hasContinuable: true },
  fork: { hasDepthLimit: true, hasContinuable: true },
  codex: { hasDepthLimit: false, hasContinuable: false },
  'claude-code': { hasDepthLimit: false, hasContinuable: false },
}

/** A provider not in the map offers no extra capability; be conservative. */
const UNKNOWN_PROVIDER_FIELDS: ProviderFieldSet = { hasDepthLimit: false, hasContinuable: false }

/** The capability-backed field set one provider name offers. */
function fieldsFor(provider: string | undefined): ProviderFieldSet {
  return provider === undefined ? UNKNOWN_PROVIDER_FIELDS : (PROVIDER_FIELDS[provider] ?? UNKNOWN_PROVIDER_FIELDS)
}

/** Whether a string is a literal boolean the loader would read as a scalar. */
function isLiteralDisabled(value: unknown): value is boolean {
  return typeof value === 'boolean'
}

/** Whether a disabled value is a loader `!!js` expression (not a literal). */
function isJsExpr(value: unknown): boolean {
  if (typeof value !== 'string') return false
  return value.includes('!!js') || value.includes('process.') || value.includes('(')
}

/** Locate one nested row by id inside a located group's config list. */
function locateNestedRow(lines: readonly string[], group: LocatedRow, id: string): LocatedRow | undefined {
  const keyIndent = group.configKeyIndent
  for (let index = group.configLine + 1; index < lines.length; index += 1) {
    const line = lines[index]
    if (line === undefined) continue
    const match = rowId(line)
    if (match === undefined) continue
    if (match.indent < keyIndent) break
    if (match.indent > keyIndent) continue
    if (match.id !== id) continue
    const { start, end } = rowBlock(lines, { line: index, keyIndent: keyIndent + 2, configLine: -1, configKeyIndent: keyIndent + 4 })
    const configLine = findConfigLine(lines, start, end)
    return { line: index, keyIndent: keyIndent + 2, configLine, configKeyIndent: keyIndent + 4 }
  }
  return undefined
}

/**
 * One tool package discoverable at runtime: an installable unit the catalog
 * offers. The source of truth is the installed package tree — never a
 * repository-side document, which a packaged deployment does not carry.
 */
export interface AvailableToolPackage {
  /** The plugin package name (e.g. `@deepseek-ai/dsh-tool-fs`). */
  readonly name: string
  /** The package's own description, when its package.json publishes one. */
  readonly description?: string
}

/**
 * Enumerate the `@deepseek-ai/dsh-tool-*` packages resolvable from this
 * package's install location, walking every `node_modules/@deepseek-ai`
 * scope directory from here up to the filesystem root.
 *
 * This is the runtime truth the available-tools catalog is built from: a
 * package a preset row can reference is a package the loader could resolve,
 * which is exactly a package installed beside this one. The scan is
 * deliberately UNcached — `dsh plugin add` lands a new package while the
 * process runs, and the catalog must offer it on the next read.
 *
 * A package whose manifest cannot be read (half-installed, unparsed) is
 * skipped rather than failing the whole enumeration; one without a
 * description still lists by name.
 * @param startDir - the directory the upward scan starts from (defaults to
 * this module's own install location; injectable for tests).
 * @returns every discoverable tool package, first-hit-wins per name.
 */
export function discoverToolPackages(startDir: string = import.meta.dirname): readonly AvailableToolPackage[] {
  const found = new Map<string, AvailableToolPackage>()
  let dir = startDir
  for (;;) {
    const scopeDir = join(dir, 'node_modules', '@deepseek-ai')
    let entries: Dirent[] = []
    try {
      entries = readdirSync(scopeDir, { withFileTypes: true })
    } catch {
      // No scope directory at this level; keep walking up.
    }
    for (const entry of entries) {
      // pnpm links workspace packages as symlinks; both shapes count.
      if (!entry.isDirectory() && !entry.isSymbolicLink()) continue
      if (!entry.name.startsWith('dsh-tool-')) continue
      const name = `@deepseek-ai/${entry.name}`
      if (found.has(name)) continue
      let description: string | undefined
      try {
        const manifest: unknown = JSON.parse(readFileSync(join(scopeDir, entry.name, 'package.json'), 'utf8'))
        if (typeof manifest === 'object' && manifest !== null) {
          const value = (manifest as { description?: unknown }).description
          if (typeof value === 'string' && value !== '') description = value
        }
      } catch {
        // A package without a readable manifest still installs by name.
      }
      found.set(name, description === undefined ? { name } : { name, description })
    }
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return [...found.values()]
}

/**
 * The editable fields one composition currently publishes.
 *
 * Which delegation keys exist is decided by the provider's capabilities (the
 * form offers the full capability surface, with the loader default filling any
 * omitted key); the VALUES are read through the loader's own schema, which
 * folds block scalars and resolves scalars exactly as the loader would. A
 * persona row or tool row that is absent is simply not reported.
 * @param content - the composition text.
 * @param available - the installable tool packages discovered at runtime
 * (see {@link discoverToolPackages}); the catalog and the tool rows' prose
 * are built from it, so a caller that passes none gets an empty catalog.
 * @returns the fields the form may seed from.
 */
export function readEditableFields(
  content: string,
  available: readonly AvailableToolPackage[] = [],
): EditableFields {
  // A composition this surface edits is one it can also read structurally;
  // an unparseable one reports no editable fields (the roster already marks
  // such a preset broken).
  let parsed: unknown
  try {
    parsed = load(content, { schema: entryListSchema })
  } catch {
    return { delegation: [], tools: [], catalog: [] }
  }
  if (!Array.isArray(parsed)) return { delegation: [], tools: [], catalog: [] }
  const rows = parsed as ParsedRow[]
  const persona = rows.find(row => row.id === 'persona')
  const personaConfig = persona === undefined ? undefined : asConfig(persona.config)
  const personaText = personaConfig?.text

  const group = rows.find(row => row.id === 'delegation' && row.group === true)
  const nested = group === undefined ? undefined : group.config
  const instances = Array.isArray(nested) ? (nested as ParsedNestedRow[]) : []
  // Only the delegation tool itself is a "delegation instance". The control
  // tools (tool-subagent-control, tool-subagent-list-agents) also live under
  // the delegation group and their ids share the `tool-subagent` prefix, but
  // their package names differ — match the package name exactly so the roster
  // does not mistake them for delegation instances.
  const delegation = instances
    .filter(row => row.name === '@deepseek-ai/dsh-tool-subagent')
    .map((instance): DelegationInstance => {
      const config = asConfig(instance.config)
      const provider = typeof config?.provider === 'string' ? config.provider : undefined
      const fields = fieldsFor(provider)
      return {
        id: String(instance.id),
        ...isLiteralDisabled(instance.disabled) ? { disabled: instance.disabled } : {},
        ...provider === undefined ? {} : { provider },
        // `enableRunInBackground` is provider-independent (the tool exposes the
        // run_in_background parameter regardless of provider capabilities), so
        // every instance carries it — the row's own value or the loader default.
        ...typeof config?.enableRunInBackground === 'boolean'
          ? { enableRunInBackground: config.enableRunInBackground }
          : { enableRunInBackground: DEFAULT_ENABLE_RUN_IN_BACKGROUND },
        // Every instance carries backgroundMode so the form renders the field
        // uniformly. Continuable work requires the provider's prepareContinuable
        // (spawn/fork have it; codex/claude-code do not), so a provider without
        // it is reported as locked to the loader default `one-shot`.
        ...typeof config?.backgroundMode === 'string'
          ? { backgroundMode: config.backgroundMode }
          : { backgroundMode: DEFAULT_BACKGROUND_MODE },
        backgroundModeLocked: !fields.hasContinuable,
        // A numeric cap requires the provider's depthLimit capability; without
        // it the field is not offered (only provider-managed is possible, so
        // there is nothing for the user to configure).
        ...fields.hasDepthLimit
          ? {
            ...Object.hasOwn(config ?? {}, 'maxDepth')
              ? { maxDepth: config?.maxDepth }
              : { maxDepth: DEFAULT_MAX_DEPTH },
          }
          : {},
        ...typeof config?.toolName === 'string' ? { toolName: config.toolName } : {},
      }
    })

  // Every tool row: top-level plus the nested items of every group, where the
  // row's `name` is a `@deepseek-ai/dsh-tool-*` package. The prose rides the
  // runtime-discovered packages.
  const descriptions = new Map<string, string>()
  for (const pkg of available) {
    if (pkg.description !== undefined) descriptions.set(pkg.name, pkg.description)
  }
  const tools: ToolRow[] = []
  const addToolRow = (id: unknown, name: unknown, disabled: unknown): void => {
    if (typeof id !== 'string' || typeof name !== 'string') return
    if (!name.startsWith('@deepseek-ai/dsh-tool-')) return
    const state: ToolDisabledState = isJsExpr(disabled)
      ? 'expr'
      : isLiteralDisabled(disabled)
        ? disabled
        : false
    const description = descriptions.get(name)
    tools.push({
      id,
      name,
      disabled: state,
      ...description === undefined ? {} : { description },
    })
  }
  for (const row of rows) {
    addToolRow(row.id, row.name, row.disabled)
    // A group's config is a nested list of rows; a plain row's config is a
    // key map. Either way, descend when the value is an array to collect the
    // group's tool rows too.
    if (Array.isArray(row.config)) {
      for (const nestedRow of row.config as ParsedNestedRow[]) {
        addToolRow(nestedRow.id, nestedRow.name, nestedRow.disabled)
      }
    }
  }

  // The available-tools directory: every installable package discovered at
  // runtime, marked installed when the preset already carries a row naming
  // it. The form offers the `installed: false` entries for adding without
  // hand-editing the yaml; the rest are already present (and removable
  // through the tools inventory above).
  const installedNames = new Set(tools.map(tool => tool.name))
  const catalog: CatalogTool[] = available.map(pkg => ({
    name: pkg.name,
    toolNames: [],
    ...pkg.description === undefined ? {} : { description: pkg.description },
    installed: installedNames.has(pkg.name),
  }))

  return {
    ...typeof personaText === 'string' ? { persona: { text: personaText } } : {},
    delegation,
    tools,
    catalog,
  }
}

/** The edits the surface may write to a composition. */
export interface PresetCompositionEdits {
  /** Replace the `persona` row's `config.text`; omitted leaves it alone. */
  readonly persona?: { readonly text?: string }
  /** Write one delegation instance's config keys, keyed by its instance id. */
  readonly delegation?: Readonly<Record<string, Partial<Record<DelegationKey, unknown>>>>
  /** Toggle one tool row's `disabled`, keyed by its row id. */
  readonly tools?: Readonly<Record<string, { readonly disabled: boolean }>>
  /**
   * Install tool packages by name (`@deepseek-ai/dsh-tool-*`), minting a row
   * for each that the preset does not already carry. A name already present
   * (or whose derived id collides with an existing row) is refused.
   */
  readonly installTools?: readonly string[]
  /**
   * Remove tool rows by id, deleting the whole row block (its config included).
   * A row disabled by a loader `!!js` expression is not removable — it is not
   * the user's to flip.
   */
  readonly removeTools?: readonly string[]
}

/**
 * Apply structured edits to a composition, returning the new text.
 *
 * Only the named fields change. Comments, sibling rows, other plugin rows, and
 * the file's ordering are preserved byte-for-byte. The result is verified with
 * the loader's own schema before it is returned.
 * @param content - the current composition text.
 * @param edits - the fields to change.
 * @param presetId - the preset id, for refusal diagnostics.
 * @returns the edited composition, guaranteed loadable by `entryListSchema`.
 * @throws when a targeted row or key is absent, a tool's `disabled` is a loader
 * expression (not user-toggleable), a delegation edit would leave two
 * instances sharing a `toolName`, or the edited composition is not valid YAML
 * under the loader's dialect.
 */
export function applyEdits(content: string, edits: PresetCompositionEdits, presetId: string): string {
  // A composition that cannot parse cannot be safely located line-scoped; the
  // preset is broken and its fix belongs to the files, not the structured
  // editor.
  try {
    load(content, { schema: entryListSchema })
  } catch (error) {
    const full = error instanceof Error ? error.message : String(error)
    throw new InvalidPresetEditsError(
      presetId,
      `this preset is not valid YAML: ${full.replace(/\n[\s\S]*$/, '')}`,
    )
  }
  let lines = linesOf(content)
  const { persona, delegation, tools, installTools, removeTools } = edits

  if (persona !== undefined && persona.text !== undefined) {
    const row = locateRow(lines, 'persona')
    if (row === undefined || row.configLine === -1) {
      throw new InvalidPresetEditsError(presetId, 'this preset has no persona row to edit')
    }
    const block = configKeys(lines, row)
    lines = editConfigKeys(lines, block, { text: persona.text }, presetId, ['text'])
  }

  if (delegation !== undefined && Object.keys(delegation).length > 0) {
    const group = locateRow(lines, 'delegation')
    if (group === undefined || group.configLine === -1) {
      throw new InvalidPresetEditsError(presetId, 'this preset has no delegation group to edit')
    }
    // Apply each instance's edits in file order. Only the writable keys
    // (backgroundMode, enableRunInBackground, maxDepth) pass editConfigKeys'
    // allowed gate; `provider` and `toolName` are read-only identity/model-call
    // fields, so a request naming either is refused here rather than ever
    // altering a row's identity or minting a duplicate tool name.
    for (const [id, editsFor] of Object.entries(delegation)) {
      const row = locateNestedRow(lines, group, id)
      if (row === undefined || row.configLine === -1) {
        throw new InvalidPresetEditsError(presetId, `this preset has no tool-subagent row "${id}" to edit`)
      }
      const block = configKeys(lines, row)
      lines = editConfigKeys(lines, block, { ...editsFor }, presetId, DELEGATION_WRITABLE_KEYS)
    }
  }

  if (tools !== undefined && Object.keys(tools).length > 0) {
    for (const [id, edit] of Object.entries(tools)) {
      const loc = locateToolRow(lines, id)
      if (loc === undefined) {
        throw new InvalidPresetEditsError(presetId, `this preset has no tool row "${id}" to toggle`)
      }
      if (loc.disabled === 'expr') {
        throw new InvalidPresetEditsError(
          presetId,
          `the tool row "${id}" is disabled by a loader expression, not a user toggle`,
        )
      }
      lines = setToolDisabled(lines, loc, edit.disabled)
    }
  }

  if (removeTools !== undefined && removeTools.length > 0) {
    for (const id of removeTools) {
      const loc = locateToolRow(lines, id)
      if (loc === undefined) {
        throw new InvalidPresetEditsError(presetId, `this preset has no tool row "${id}" to remove`)
      }
      if (loc.disabled === 'expr') {
        throw new InvalidPresetEditsError(
          presetId,
          `the tool row "${id}" is disabled by a loader expression, not a user toggle`,
        )
      }
      lines = removeToolRow(lines, loc)
    }
  }

  if (installTools !== undefined && installTools.length > 0) {
    // Mint each row and detect collisions BEFORE splicing, so a refusal never
    // leaves a half-applied file. The derived id follows the package-name
    // convention (`@deepseek-ai/dsh-tool-fs` -> `tool-fs`).
    const rows: { id: string; name: string }[] = []
    const seenIds = new Set<string>()
    const seenNames = new Set<string>()
    for (const name of installTools) {
      if (!name.startsWith('@deepseek-ai/dsh-tool-')) {
        throw new InvalidPresetEditsError(presetId, `"${name}" is not an installable tool package`)
      }
      if (seenNames.has(name)) {
        throw new InvalidPresetEditsError(presetId, `tool package "${name}" is listed more than once`)
      }
      if (hasToolName(lines, name)) {
        throw new InvalidPresetEditsError(presetId, `tool package "${name}" is already installed`)
      }
      const id = `tool-${name.slice('@deepseek-ai/dsh-tool-'.length)}`
      if (seenIds.has(id) || locateToolRow(lines, id) !== undefined) {
        throw new InvalidPresetEditsError(presetId, `a tool row id "${id}" already exists; cannot install "${name}"`)
      }
      seenNames.add(name)
      seenIds.add(id)
      rows.push({ id, name })
    }
    lines = insertToolRows(lines, rows)
  }

  const edited = lines.join('\n')
  // The shape/parse gate: an edit that left the composition unloadable must
  // not reach disk. Reuse the loader's dialect so `!!js` and every valid form
  // stay accepted.
  try {
    load(edited, { schema: entryListSchema })
  } catch (error) {
    const full = error instanceof Error ? error.message : String(error)
    throw new InvalidPresetEditsError(
      presetId,
      `the edit made the composition unparseable: ${full.replace(/\n[\s\S]*$/, '')}`,
    )
  }
  return edited
}

/** A located tool row: its `- id:` line and how its disabled reads. */
interface LocatedToolRow {
  /** Index of the `- id:` line. */
  readonly line: number
  /** Column the row's keys are indented to. */
  readonly keyIndent: number
  /** The disabled line, or -1 when the row has none. */
  readonly disabledLine: number
  /** How the current disabled reads. */
  readonly disabled: ToolDisabledState
}

/** Locate a tool row (top-level or nested) and its disabled line, if any. */
function locateToolRow(lines: readonly string[], id: string): LocatedToolRow | undefined {
  // Top-level scan.
  const top = locateRow(lines, id)
  if (top !== undefined) {
    const disabledLine = findDisabledLine(lines, top)
    return {
      line: top.line,
      keyIndent: top.keyIndent,
      disabledLine,
      disabled: disabledStateAt(lines, disabledLine),
    }
  }
  // Nested scan: the row may sit inside any group's config list.
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    if (line === undefined) continue
    const match = rowId(line)
    if (match === undefined || match.indent !== 0) continue
    const group = locateRow(lines, match.id)
    if (group === undefined || group.configLine === -1) continue
    const nested = locateNestedRow(lines, group, id)
    if (nested === undefined) continue
    const disabledLine = findDisabledLine(lines, nested)
    return {
      line: nested.line,
      keyIndent: nested.keyIndent,
      disabledLine,
      disabled: disabledStateAt(lines, disabledLine),
    }
  }
  return undefined
}

/** Index of the `disabled:` line inside a row's block, or -1 when absent. */
function findDisabledLine(lines: readonly string[], row: LocatedRow): number {
  const { start, end } = rowBlock(lines, row)
  for (let index = start; index < end; index += 1) {
    const line = lines[index]
    if (line === undefined) continue
    if (indentOf(line) === row.keyIndent && bodyOf(line).startsWith('disabled:')) return index
  }
  return -1
}

/** Read how a row's disabled line reads, at the given index (-1 = absent). */
function disabledStateAt(lines: readonly string[], disabledLine: number): ToolDisabledState {
  if (disabledLine === -1) return false
  const line = lines[disabledLine]
  if (line === undefined) return false
  const value = bodyOf(line).slice('disabled:'.length).trim()
  if (isJsExpr(value)) return 'expr'
  if (value === 'true') return true
  if (value === 'false') return false
  // A non-literal, non-expression value is not a user toggle either.
  return 'expr'
}

/** Replace or add a tool row's `disabled:` line with a literal boolean. */
function setToolDisabled(
  lines: string[],
  row: LocatedToolRow,
  disabled: boolean,
): string[] {
  const out = [...lines]
  const pad = ' '.repeat(row.keyIndent)
  const line = `${pad}disabled: ${disabled}`
  if (row.disabledLine === -1) {
    // Insert after the `- id:` line (the row's first key line).
    out.splice(row.line + 1, 0, line)
  } else {
    out.splice(row.disabledLine, 1, line)
  }
  return out
}

/** Whether any row (top-level or nested) already names the given package. */
function hasToolName(lines: readonly string[], name: string): boolean {
  const quoted = `'${name}'`
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    if (line === undefined) continue
    if (line.trim().startsWith('name:') && line.includes(quoted)) return true
  }
  return false
}

/**
 * Delete one tool row's whole block: the `- id:` line and every line at its
 * key indent or deeper (its config, its `disabled`, a nested list). The row
 * block is bounded by the next line of shallower indent, so a sibling row
 * survives untouched. Blank lines left behind by the removal are harmless and
 * the shape gate below re-validates the result.
 * @param lines - the composition split into lines.
 * @param row - the located tool row to remove.
 * @returns the lines with the row's block removed.
 */
function removeToolRow(lines: string[], row: LocatedToolRow): string[] {
  const { end } = rowBlock(lines, { line: row.line, keyIndent: row.keyIndent, configLine: -1, configKeyIndent: -1 })
  const out = [...lines]
  out.splice(row.line, end - row.line)
  return out
}

/**
 * Insert new tool rows (`- id:` + `name:`) into the composition's top-level
 * tool section. They land just before the `delegation` group row when one
 * exists (tools cluster above it), otherwise at the very end of the file — in
 * both cases at indent 0, so a preceding block scalar's value terminates
 * cleanly and the shape gate below confirms the result parses.
 * @param lines - the composition split into lines.
 * @param rows - the minted `{ id, name }` rows to insert.
 * @returns the lines with the new rows spliced in.
 */
function insertToolRows(lines: string[], rows: readonly { id: string; name: string }[]): string[] {
  // Find the delegation group row to insert before, else the file end.
  let insertion = lines.length
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    if (line === undefined) continue
    const match = rowId(line)
    if (match !== undefined && match.indent === 0 && match.id === 'delegation') {
      insertion = index
      break
    }
  }
  const block: string[] = []
  for (const row of rows) {
    block.push(`- id: ${row.id}`, `  name: '${row.name}'`)
  }
  // Separate the new rows from the surrounding content with a blank line,
  // matching how existing rows read in the shipped compositions.
  const out = [...lines]
  if (insertion === lines.length) {
    while (out.length > 0 && out[out.length - 1]?.trim() === '') out.pop()
    out.push('')
  } else if (out[insertion - 1]?.trim() !== '') {
    block.unshift('')
  }
  out.splice(insertion, 0, ...block)
  return out
}
