/**
 * Agent-preset management controller: the roster as a list, a copy dialog as
 * the only way a preset is created, and a structured editor over a locally
 * authored preset's editable fields.
 *
 * The browser edits no composition text. A new preset is a host-side copy of
 * an existing one (`{ from, id, name? }` is all that crosses the wire), and a
 * locally authored preset's fields are rewritten through a structured form
 * whose read/write ride the dedicated `/agent-preset-edit` wire channel — not
 * the shared `/api` agentPreset domain, which carries only roster reading,
 * copying, opening, and deleting. Everything after creation happens in the
 * preset's own files — which is why the page's other job is getting the user
 * TO those files: open the directory where the host has a desktop, show its
 * path where it does not.
 *
 * The host stays the single fact source. Every mutation writes through the
 * wire and the page re-reads the roster afterwards, because a copy or edit
 * changes more than the row it targeted.
 */

import type { IApiClient } from '@deepseek-ai/dsh-api-remotes/client'
import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { AgentPresetEditWire } from './wire-client.ts'
import { beginRosterRead, messageOf, writeDefaultPreset } from './settings-store.ts'

/** Ids a preset directory may be named, mirroring the host's own rule. */
const PRESET_ID = /^[a-z0-9][a-z0-9-]*$/

/** One preset row the page renders. */
export interface PresetRow {
  /** Preset id and directory name; the display name falls back to it. */
  id: string
  /** Display name the preset published, absent when it published none. */
  name?: string
  /** One sentence on what the preset is for. */
  description?: string
  /** Whether the preset ships with the deployment or was authored locally. */
  trust: 'system' | 'user'
  /** Whether a session that names no preset gets this one. */
  isDefault: boolean
  /**
   * Why the preset cannot compose a session, absent when it can. A broken
   * row renders marked and unselectable — its directory still occupies the
   * id, so deleting it (or fixing the files) is the way out, and this page
   * is where both of those live.
   */
  broken?: string
}

/** The copy dialog: a new id and optional display name over a fixed source. */
export interface CopyDraft {
  /** The preset being copied. */
  from: string
  /** Display name of the source, for the dialog title. */
  fromTitle: string
  /** New preset id being typed; the directory name, so it is required. */
  id: string
  /** Display name being typed; empty falls back to the id. */
  name: string
  /** Whether the copy is in flight. */
  saving: boolean
  /** The last copy failure, cleared by the next edit. */
  error: string | null
}

/** The read-only composition viewer over one shipped preset. */
export interface PresetView {
  /** The preset whose composition is shown. */
  id: string
  /** Display name, for the dialog title. */
  title: string
  /** Composition text exactly as stored. */
  content: string
}

/** The delegation keys a preset's tool-subagent row may carry. */
export type DelegationKey =
  | 'provider'
  | 'toolName'
  | 'backgroundMode'
  | 'enableRunInBackground'
  | 'maxDepth'

/**
 * One delegation instance's staged draft. The host reports every
 * capability-supported field (with loader defaults for omitted keys), so the
 * fields here are the full surface; only the fields the user actually staged
 * (recorded in {@link touched}) are sent back on save, so an untouched default
 * never mints a key the composition did not carry.
 */
export interface DelegationDraft {
  /** The instance id within the delegation group (`tool-subagent`, …). */
  id: string
  /** Whether the instance is enabled (the inverse of `disabled`). */
  enabled: boolean
  /** Staged provider, when the row carries it (read-only identity). */
  provider?: string
  /** Staged background mode, when the row carries it. */
  backgroundMode?: string
  /** Whether the background-mode choice is locked to `one-shot`; the form
   * renders the field for every instance but disables it when locked. */
  backgroundModeLocked: boolean
  /** Staged run-in-background toggle, when the row carries it. */
  enableRunInBackground?: boolean
  /** Staged max-depth (a number string or `provider-managed`), when carried. */
  maxDepth?: string
  /** The tool name the model calls; read for uniqueness, never edited here. */
  toolName?: string
  /** The field names the user staged this editing session, so save writes only what changed. */
  touched: ReadonlySet<string>
}

/** One tool row's staged draft in the inventory. */
export interface ToolDraft {
  /** The row's `- id:` (e.g. `tool-bash`). */
  id: string
  /** The row's `name` (e.g. `@deepseek-ai/dsh-tool-bash`). */
  name: string
  /** Whether the row is enabled (the inverse of `disabled`). */
  enabled: boolean
  /** Whether the row's disabled is a user toggle (not a loader expression). */
  toggleable: boolean
  /** One-sentence description, when the catalog supplied one. */
  description?: string
}

/**
 * One available-tool catalog entry, with the user's staged add/remove choice.
 * `stagedRemove` is set when the user wants to remove an installed tool's row
 * on save; adding a not-yet-installed tool is the staged install list.
 */
export interface CatalogDraft {
  /** The plugin package name (e.g. `@deepseek-ai/dsh-tool-fs`). */
  name: string
  /** The model-visible tool names the package registers. */
  toolNames: readonly string[]
  /** One-sentence description, when the catalog supplied one. */
  description?: string
  /** Whether the preset already carries a row naming this package. */
  installed: boolean
}

/**
 * The editable-fields editor: the persona text, every delegation instance,
 * every tool row, and the display metadata, all as a form stages them. A
 * preset with no persona row simply has that group absent; delegation and
 * tools are arrays (possibly empty).
 */
export interface EditDraft {
  /** The preset being edited. */
  id: string
  /** Display name, for the dialog title. */
  title: string
  /** Staged persona text, or undefined when the preset carries no persona row. */
  persona?: string
  /** Every delegation instance, in file order. */
  delegation: readonly DelegationDraft[]
  /** Every tool row, in file order. */
  tools: readonly ToolDraft[]
  /** Every installable tool package the host's catalog knows. */
  catalog: readonly CatalogDraft[]
  /** Package names the user staged for install (not yet installed). */
  installTools: ReadonlySet<string>
  /** Tool row ids the user staged for removal (installed tools unchecked). */
  removeTools: ReadonlySet<string>
  /** Staged display name, or undefined when the preset publishes none. */
  name?: string
  /** Staged display description, or undefined when the preset publishes none. */
  description?: string
  /** Whether the save is in flight. */
  saving: boolean
  /** The last save failure, cleared by the next edit. */
  error: string | null
}

/** Page snapshot. */
export interface AgentPresetSectionState {
  status: 'idle' | 'loading' | 'ready' | 'unavailable' | 'error'
  /** Whole-load failure text; a copy failure stays on the dialog. */
  error: string | null
  /** Whether the deployment configures a root new presets can be written to. */
  authorable: boolean
  /** Whether the host can open a preset directory on a native desktop. */
  hasDocument: boolean
  /** Every preset the deployment currently supplies. */
  rows: readonly PresetRow[]
  /** The open copy dialog, or null. */
  copy: CopyDraft | null
  /** The open read-only viewer, or null. */
  view: PresetView | null
  /** The open editable-fields editor, or null. */
  edit: EditDraft | null
  /** The preset awaiting delete confirmation. */
  pendingDelete: string | null
  /** Whether a delete is in flight. */
  deleting: boolean
  /**
   * Preset directories shown as text because the host has no desktop opener
   * — the answer `openDocument` gives instead of opening.
   */
  revealedPaths: Readonly<Record<string, string>>
}

const INITIAL: AgentPresetSectionState = {
  status: 'idle',
  error: null,
  authorable: false,
  hasDocument: false,
  rows: [],
  copy: null,
  view: null,
  edit: null,
  pendingDelete: null,
  deleting: false,
  revealedPaths: {},
}

/**
 * Why this copy cannot be submitted yet, as a locale key, or undefined when
 * it can. Client-side only: the host re-checks the id and its answer is what
 * the dialog reports on failure.
 * @param draft - the open copy dialog.
 * @param rows - the roster, for the collision check.
 * @returns the blocking reason's locale key, or undefined when submittable.
 */
export function draftBlocker(
  draft: CopyDraft,
  rows: readonly PresetRow[],
): 'idRequired' | 'idInvalid' | 'idTaken' | undefined {
  if (draft.id === '') return 'idRequired'
  if (!PRESET_ID.test(draft.id)) return 'idInvalid'
  // A copy never overwrites: landing on a name already in use would replace
  // something the user did not open.
  if (rows.some(row => row.id === draft.id)) return 'idTaken'
  return undefined
}

/**
 * Map one wire delegation instance to its staged draft.
 * @param instance - the delegation instance the host returned.
 * @returns the draft a form edits.
 */
function delegationToDraft(instance: {
  id: string
  disabled?: boolean
  provider?: string
  backgroundMode?: string
  backgroundModeLocked?: boolean
  enableRunInBackground?: boolean
  maxDepth?: unknown
  toolName?: string
}): DelegationDraft {
  return {
    id: instance.id,
    enabled: instance.disabled !== true,
    ...instance.provider === undefined ? {} : { provider: instance.provider },
    ...instance.backgroundMode === undefined ? {} : { backgroundMode: instance.backgroundMode },
    // Default to unlocked so an absent marker never accidentally disables a
    // capable provider's background-mode choice.
    backgroundModeLocked: instance.backgroundModeLocked ?? false,
    ...instance.enableRunInBackground === undefined ? {} : { enableRunInBackground: instance.enableRunInBackground },
    ...instance.maxDepth === undefined ? {} : { maxDepth: String(instance.maxDepth) },
    ...instance.toolName === undefined ? {} : { toolName: instance.toolName },
    touched: new Set<string>(),
  }
}

/**
 * Map one wire tool row to its staged draft.
 * @param row - the tool row the host returned.
 * @returns the draft a form toggles.
 */
function toolToDraft(row: {
  id: string
  name: string
  disabled: boolean | 'expr'
  description?: string
}): ToolDraft {
  return {
    id: row.id,
    name: row.name,
    enabled: row.disabled !== true,
    toggleable: row.disabled !== 'expr',
    ...row.description === undefined ? {} : { description: row.description },
  }
}

/**
 * Map one wire catalog entry to its staged draft.
 * @param row - the catalog entry the host returned.
 * @returns the draft a form offers for adding/removing.
 */
function catalogToDraft(row: {
  name: string
  toolNames: readonly string[]
  description?: string
  installed: boolean
}): CatalogDraft {
  return {
    name: row.name,
    toolNames: row.toolNames,
    ...row.description === undefined ? {} : { description: row.description },
    installed: row.installed,
  }
}

/** Reads the roster and drives the copy dialog, viewer, and location reveals. */
export class AgentPresetSectionController {
  /** Page snapshot the renderer subscribes to. */
  readonly store: SnapshotStore<AgentPresetSectionState> = createSnapshotStore(INITIAL)

  constructor(
    private readonly api: Pick<IApiClient, 'agentPresets' | 'settings'>,
    /**
     * The editing wire: the dedicated `/agent-preset-edit` channel carrying
     * the structured field read and write, kept apart from the shared `/api`
     * agentPreset domain.
     */
    private readonly editWire: AgentPresetEditWire,
    /**
     * Called after this page changes the roster DIRECTORY, so the other
     * surfaces reading the same roster re-read it. A settings field moving is
     * already announced by the host through the forwarded
     * `settings/document-updated`; a directory copied or deleted here is not,
     * and the new-session chip has no other way to learn a preset it should
     * offer now exists.
     */
    private readonly rosterChanged: () => void = () => {},
  ) {}

  private set(patch: Partial<AgentPresetSectionState>): void {
    this.store.set({ ...this.store.getSnapshot(), ...patch })
  }

  private patchCopy(patch: Partial<CopyDraft>): void {
    const { copy } = this.store.getSnapshot()
    if (copy === null) return
    this.set({ copy: { ...copy, ...patch } })
  }

  /**
   * Load the roster. An empty roster means the deployment composes no
   * presets, which is a valid deployment rather than a failure — the section
   * reports `unavailable` and renders nothing.
   * @returns once the snapshot reflects the host.
   */
  async load(): Promise<void> {
    const roster = await beginRosterRead(this.api, this.store)
    if (roster === undefined) return
    const { presets, authorable, hasDocument } = roster
    if (presets.length === 0) {
      // Nothing to manage leaves nothing to keep a dialog open over.
      this.set({ status: 'unavailable', rows: [], authorable, hasDocument, copy: null, view: null, edit: null })
      return
    }
    // A reveal outlives a reload but not its preset: a path for a row the
    // roster no longer lists would be a claim about a directory that is gone.
    const revealed = this.store.getSnapshot().revealedPaths
    const kept = Object.fromEntries(
      Object.entries(revealed).filter(([id]) => presets.some(preset => preset.id === id)))
    this.set({
      status: 'ready',
      error: null,
      authorable,
      hasDocument,
      rows: presets.map(preset => ({ ...preset })),
      revealedPaths: kept,
    })
  }

  /**
   * Open one shipped preset's composition in the read-only viewer.
   * @param id - the preset to view.
   * @returns once the composition loaded or the failure is on the page.
   */
  async view(id: string): Promise<void> {
    this.set({ error: null })
    try {
      const response = await this.api.agentPresets.read({ agentPreset: id })
      if (!response.result.ok) {
        this.set({ error: response.result.error.message })
        return
      }
      const { name, content } = response.result.value
      this.set({ view: { id, title: name ?? id, content } })
    } catch (error) {
      this.set({ error: messageOf(error) })
    }
  }

  /** Close the read-only viewer. */
  closeView(): void {
    this.set({ view: null })
  }

  private patchEdit(patch: Partial<EditDraft>): void {
    const { edit } = this.store.getSnapshot()
    if (edit === null) return
    this.set({ edit: { ...edit, ...patch } })
  }

  /**
   * Open the editable-fields editor over one locally authored preset, seeding
   * it from the wire's structured read. A preset with no persona row simply
   * has that group absent; the delegation and tool inventories are arrays
   * (possibly empty).
   * @param id - the preset to edit.
   * @returns once the fields loaded or the failure is on the dialog.
   */
  async beginEdit(id: string): Promise<void> {
    const row = this.store.getSnapshot().rows.find(candidate => candidate.id === id)
    this.set({ error: null, edit: null })
    try {
      const response = await this.editWire.readEditable({ agentPreset: id })
      if (!response.ok) {
        this.set({ error: response.error.message })
        return
      }
      const value = response.value
      this.set({
        edit: {
          id,
          title: row?.name ?? id,
          ...value.persona === undefined ? {} : { persona: value.persona.text },
          delegation: value.delegation.map(delegationToDraft),
          tools: value.tools.map(toolToDraft),
          catalog: value.catalog.map(catalogToDraft),
          installTools: new Set<string>(),
          removeTools: new Set<string>(),
          ...value.name === undefined ? {} : { name: value.name },
          ...value.description === undefined ? {} : { description: value.description },
          saving: false,
          error: null,
        },
      })
    } catch (error) {
      this.set({ error: messageOf(error) })
    }
  }

  /** Close the editor, discarding whatever was typed. */
  cancelEdit(): void {
    this.set({ edit: null })
  }

  /**
   * Stage one editor field. The scope is either a top-level field (`persona`,
   * `name`, `description`), a delegation instance (`delegation:<id>`, where
   * the field is one of the delegation keys), or a tool row (`tool:<id>`,
   * where the field is `enabled`).
   * @param scope - the group the field belongs to.
   * @param field - the field name within that group.
   * @param value - the staged value (a string for text, a boolean for toggles).
   */
  setEditField(scope: string, field: string, value: string | boolean): void {
    const { edit } = this.store.getSnapshot()
    if (edit === null) return
    if (scope === 'persona') {
      this.patchEdit({ persona: String(value), error: null })
      return
    }
    if (scope === 'name') {
      this.patchEdit({ name: String(value), error: null })
      return
    }
    if (scope === 'description') {
      this.patchEdit({ description: String(value), error: null })
      return
    }
    if (scope.startsWith('delegation:')) {
      const id = scope.slice('delegation:'.length)
      this.patchEdit({
        delegation: edit.delegation.map(instance =>
          instance.id === id
            // Record the staged field so save writes only what the user
            // actually changed, never an untouched capability default.
            ? { ...instance, [field]: value, touched: new Set(instance.touched).add(field) }
            : instance),
        error: null,
      })
      return
    }
    if (scope.startsWith('tool:')) {
      const id = scope.slice('tool:'.length)
      this.patchEdit({
        tools: edit.tools.map(tool =>
          tool.id === id
            ? { ...tool, enabled: value === true }
            : tool),
        error: null,
      })
      return
    }
    if (scope.startsWith('catalog:')) {
      // The available-tools directory: checking a not-yet-installed package
      // stages it for install; unchecking an installed one stages removal.
      const name = scope.slice('catalog:'.length)
      const nextInstall = new Set(edit.installTools)
      const nextRemove = new Set(edit.removeTools)
      if (field === 'install') {
        if (value === true) nextInstall.add(name)
        else nextInstall.delete(name)
        // A package is either being installed or removed, never both.
        nextRemove.delete(name)
      } else if (field === 'remove') {
        if (value === true) nextRemove.add(name)
        else nextRemove.delete(name)
        nextInstall.delete(name)
      }
      this.patchEdit({ installTools: nextInstall, removeTools: nextRemove, error: null })
    }
  }

  /**
   * Whether the open editor can be saved. A delegation instance whose
   * backgroundMode is not one of the accepted literals is invalid (the form
   * only offers literals, so this guards stale or malformed drafts). An
   * unknown provider is NOT blocked: the host answers conservatively for it
   * (only `enableRunInBackground`, which needs no enum), so refusing the save
   * would leave the other blocks — persona, tools, metadata — stuck with no
   * feedback. The provider itself is read-only identity and is never sent.
   * @param edit - the open editor.
   * @returns the blocking locale key, or undefined when saveable.
   */
  editBlocker(edit: EditDraft): 'delegationInvalid' | undefined {
    const modes = new Set(['one-shot', 'continuable'])
    for (const instance of edit.delegation) {
      if (instance.backgroundMode !== undefined && !modes.has(instance.backgroundMode)) return 'delegationInvalid'
    }
    return undefined
  }

  /**
   * Save the editor's staged fields, then re-read the roster.
   * @returns once the save settled and the page reflects it.
   */
  async confirmEdit(): Promise<void> {
    const { edit } = this.store.getSnapshot()
    if (edit === null || edit.saving) return
    if (this.editBlocker(edit) !== undefined) return
    this.patchEdit({ saving: true, error: null })
    try {
      // A row carries a delegation edit only for the fields the user staged
      // (provider is read-only identity, so it is never sent and has no edit
      // path). The enabled toggle is sent through the tools inventory
      // (delegation rows are also tool rows), so it is not a delegation edit
      // here.
      const delegationEntries: [string, Partial<Record<DelegationKey, unknown>>][] = edit.delegation
        .map((instance): [string, Partial<Record<DelegationKey, unknown>>] => {
          const edits: Partial<Record<DelegationKey, unknown>> = {}
          if (instance.touched.has('backgroundMode') && instance.backgroundMode !== undefined) {
            edits.backgroundMode = instance.backgroundMode
          }
          if (instance.touched.has('enableRunInBackground') && instance.enableRunInBackground !== undefined) {
            edits.enableRunInBackground = instance.enableRunInBackground
          }
          if (instance.touched.has('maxDepth') && instance.maxDepth !== undefined) {
            edits.maxDepth = instance.maxDepth === 'provider-managed'
              ? 'provider-managed'
              : Number.isFinite(Number(instance.maxDepth)) ? Number(instance.maxDepth) : instance.maxDepth
          }
          return [instance.id, edits]
        })
        .filter(([, edits]) => Object.keys(edits).length > 0)
      const toolEntries: [string, { disabled: boolean }][] = edit.tools
        .filter(tool => tool.toggleable)
        .map(tool => [tool.id, { disabled: !tool.enabled }])
      // The available-tools directory maps to the same yaml rows: installing
      // a package the preset does not carry mints a new tool row, and removing
      // an installed one deletes its row. Stage by package name in the form,
      // then resolve to the row ids the host expects on save.
      const installTools = [...edit.installTools]
        .filter(name => !edit.catalog.some(entry => entry.name === name && entry.installed))
      const removeRowIds = [...edit.removeTools]
        .map(name => edit.tools.find(tool => tool.name === name)?.id)
        .filter((id): id is string => id !== undefined)
      const response = await this.editWire.update({
        agentPreset: edit.id,
        ...edit.persona === undefined ? {} : { persona: { text: edit.persona } },
        ...delegationEntries.length === 0 ? {} : { delegation: Object.fromEntries(delegationEntries) },
        ...toolEntries.length === 0 ? {} : { tools: Object.fromEntries(toolEntries) },
        ...installTools.length === 0 ? {} : { installTools },
        ...removeRowIds.length === 0 ? {} : { removeTools: removeRowIds },
        ...edit.name === undefined && edit.description === undefined ? {} : {
          metadata: {
            ...edit.name === undefined ? {} : { name: edit.name },
            ...edit.description === undefined ? {} : { description: edit.description },
          },
        },
      })
      if (!response.ok) {
        this.patchEdit({ saving: false, error: response.error.message })
        return
      }
      this.set({ edit: null })
      await this.load()
      this.rosterChanged()
    } catch (error) {
      this.patchEdit({ saving: false, error: messageOf(error) })
    }
  }

  /**
   * Open the copy dialog over one preset.
   * @param from - the preset the copy will start from.
   */
  beginCopy(from: string): void {
    const row = this.store.getSnapshot().rows.find(candidate => candidate.id === from)
    this.set({
      error: null,
      copy: { from, fromTitle: row?.name ?? from, id: '', name: '', saving: false, error: null },
    })
  }

  /** Close the copy dialog, discarding whatever was typed. */
  cancelCopy(): void {
    this.set({ copy: null })
  }

  /**
   * Name the preset the copy creates.
   * @param id - the id typed into the dialog.
   */
  setCopyId(id: string): void {
    this.patchCopy({ id, error: null })
  }

  /**
   * Name the copy's display name.
   * @param name - the display name typed into the dialog.
   */
  setCopyName(name: string): void {
    this.patchCopy({ name, error: null })
  }

  /**
   * Submit the copy, re-read the roster, then take the user to the new
   * preset's files — the directory opens where the host has a desktop, and
   * its path appears on the new row where it does not.
   * @returns once the copy settled and the page reflects it.
   */
  async confirmCopy(): Promise<void> {
    const draft = this.store.getSnapshot().copy
    if (draft === null || draft.saving) return
    if (draftBlocker(draft, this.store.getSnapshot().rows) !== undefined) return
    this.patchCopy({ saving: true, error: null })
    try {
      const name = draft.name.trim()
      const response = await this.api.agentPresets.copy({
        from: draft.from,
        agentPreset: draft.id,
        ...name === '' ? {} : { name },
      })
      if (!response.result.ok) {
        this.patchCopy({ saving: false, error: response.result.error.message })
        return
      }
      this.set({ copy: null })
      await this.load()
      this.rosterChanged()
      // A preset is its files from here on (the dialog collected nothing
      // else), so landing in them is the completion, not a follow-up.
      await this.openLocation(draft.id)
    } catch (error) {
      this.patchCopy({ saving: false, error: messageOf(error) })
    }
  }

  /**
   * Open one preset's directory on the host desktop, or reveal its path on
   * the row where the deployment has no opener to hand it to.
   * @param id - the preset whose files the user wants.
   * @returns once the host answered and the page reflects it.
   */
  async openLocation(id: string): Promise<void> {
    try {
      const response = await this.api.agentPresets.openDocument({ agentPreset: id })
      if (!response.result.ok) {
        this.set({ error: response.result.error.message })
        return
      }
      if (response.result.value.opened) return
      const { path } = response.result.value
      this.set({ revealedPaths: { ...this.store.getSnapshot().revealedPaths, [id]: path } })
    } catch (error) {
      this.set({ error: messageOf(error) })
    }
  }

  /**
   * Ask for confirmation before deleting one preset.
   * @param id - the preset to delete, or null to dismiss the confirmation.
   */
  confirmDelete(id: string | null): void {
    if (this.store.getSnapshot().deleting) return
    this.set({ pendingDelete: id })
  }

  /**
   * Delete the preset awaiting confirmation, then re-read the roster.
   *
   * A session already composed from it keeps running: its composition was
   * mounted at creation and nothing re-reads the file.
   * @returns once the delete settled and the page reflects it.
   */
  async remove(): Promise<void> {
    const { pendingDelete, deleting } = this.store.getSnapshot()
    if (pendingDelete === null || deleting) return
    this.set({ deleting: true, error: null })
    try {
      const response = await this.api.agentPresets.remove({ agentPreset: pendingDelete })
      if (!response.result.ok) {
        this.set({ deleting: false, pendingDelete: null, error: response.result.error.message })
        return
      }
      this.set({ deleting: false, pendingDelete: null })
      await this.load()
      this.rosterChanged()
    } catch (error) {
      this.set({ deleting: false, pendingDelete: null, error: messageOf(error) })
    }
  }

  /**
   * Make one preset the default for sessions created later. Running sessions
   * keep the composition they began with, so this never disturbs work.
   * @param id - the preset to make default.
   * @returns once the write settled and the roster was re-read.
   */
  async makeDefault(id: string): Promise<void> {
    const failure = await writeDefaultPreset(this.api, id)
    if (failure !== undefined) {
      this.set({ error: failure })
      return
    }
    await this.load()
  }
}
