/**
 * Subagent management controller: the roster as a list, a create/copy dialog,
 * a row-level enable/disable toggle, an edit dialog over the metadata fields,
 * delete, and opening a subagent's directory.
 *
 * The host stays the single fact source. Every mutation writes through the
 * wire and the page re-reads the roster afterwards, because a toggle or edit
 * changes more than the row it targeted (the roster order and states recompute
 * from the host).
 */

import type { RpcResult } from '@deepseek-ai/dsh-api-remotes/client'
import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { SubagentPresetWire } from './wire-client.ts'

/** Ids a subagent directory may be named, mirroring the host's own rule. */
const SUBAGENT_ID = /^[a-z0-9][a-z0-9-]*$/

/** A subagent's display metadata, mirrored from the wire. */
export interface SubagentMetadata {
  /** One sentence on what the subagent is for. */
  readonly description?: string
  /** Whether the subagent is enabled for delegation. */
  readonly enabled?: boolean
  /** Model-plan id the dispatched child binds; absent inherits the parent's. */
  readonly model?: string
}

/** One subagent row the page renders. */
export interface SubagentRow {
  /** Subagent id and directory name; it is the display name. */
  id: string
  /** Whether the subagent ships with the deployment or was authored locally. */
  trust: 'system' | 'user'
  /** The subagent's display metadata, carried as one object. */
  metadata: SubagentMetadata
  /** Why the subagent cannot compose a child, absent when it can. */
  broken?: string
}

/** The create/copy dialog: a new id and optional display name over a fixed source. */
export interface CreateDraft {
  /** The subagent being copied. */
  from: string
  /** Display name of the source, for the dialog title. */
  fromTitle: string
  /** New subagent id being typed; the directory name, so it is required. */
  id: string
  /** Whether the create is in flight. */
  saving: boolean
  /** The last create failure, cleared by the next edit. */
  error: string | null
}

/** The read-only viewer over one subagent's composition. */
export interface ViewDraft {
  /** The subagent being viewed. */
  id: string
  /** Display name, for the dialog title. */
  title: string
  /** The composition text as stored. */
  content: string
}

/** One staged tool row in the edit dialog. */
export interface ToolDraft {
  /** The composition row id. */
  id: string
  /** The package the row loads. */
  name: string
  /** Whether the row is disabled (`'expr'` means a `!!js` line owns it). */
  disabled: boolean | 'expr'
  /** Row prose, when the package published any. */
  description?: string
}

/** One installable tool package the host's catalog knows. */
export interface CatalogDraft {
  readonly name: string
  readonly toolNames: readonly string[]
  readonly description?: string
  readonly installed: boolean
}

/**
 * One model-plan roster row as the `/model-plan` wire reports it, narrowed to
 * the fields the plan picker needs. Mirrored from the model-plan wire's own
 * entry; subagents cannot import the model-plan bundle (it is a separate
 * install), so this shape is declared here and the Host channel's value is
 * consumed structurally.
 */
export interface PlanWireEntry {
  /** The plan id, which is what the subagent stores. */
  readonly id: string
  /** The provider route the plan pins. */
  readonly provider: string
  /** The provider-owned model id the plan pins. */
  readonly model: string
  /** Why the plan cannot serve a subagent, when it cannot. */
  readonly broken?: string
}

/**
 * One model-plan choice feeding the edit dialog's plan picker, mirrored from
 * the model-plan wire's roster entry. A plan is a fixed asset: an id plus the
 * provider/model route it pins (shown to disambiguate plans with similar ids).
 */
export interface PlanChoice {
  /** The plan id, which is what the subagent stores. */
  readonly id: string
  /** The route the plan pins, shown as picker copy. */
  readonly provider: string
  readonly model: string
}

/**
 * Extract the plan roster from the model-plan wire's `list` result. A failure
 * or a non-conforming result yields an empty list — the edit dialog then offers
 * only "inherit the parent" and stays usable, exactly as an empty deployment
 * would. This is a defensive read of the RPC seam: subagents depend on the
 * model-plan bundle at runtime only through this channel, never by type.
 * @param result - the `RpcResult` the `/model-plan` list call resolved to.
 * @returns the plan roster entries, empty on failure.
 */
export function plansListEntries(
  result: RpcResult<{ plans: readonly PlanWireEntry[]; authorable: boolean }>,
): readonly PlanWireEntry[] {
  return result.ok ? result.value.plans : []
}

/** The edit dialog over one locally authored subagent. */
export interface EditDraft {
  /** The subagent being edited. */
  id: string
  /** Display name, for the dialog title. */
  title: string
  /**
   * The staged display metadata, seeded from the wire's `metadata` object and
   * submitted back as one whole on save. `description` is always a string (an
   * empty one clears the stored value); `model` is a plan id string when the
   * user picked a model-plan, and `undefined` when they have not or chose
   * "inherit the parent" (also a clear).
   */
  metadata: {
    description: string
    model?: string
    enabled?: boolean
    /**
     * Whether the delegated child also inherits the main agent's preset before
     * the subagent's own tree. A form checkbox; `false` keeps the subagent
     * self-contained (the default), `true` overlays its tree on the inherited
     * parent composition. Only `true` is persisted, keeping the file clean.
     */
    inheritParent: boolean
  }
  /** Every model-plan the deployment supplies, for the plan picker. */
  planChoices: readonly PlanChoice[]
  /** Staged persona text, when the composition carries a persona row. */
  persona?: string
  /** Every tool row in the composition, with its enabled state. */
  tools: readonly ToolDraft[]
  /** Every installable tool package the host's catalog knows. */
  catalog: readonly CatalogDraft[]
  /** Package names staged for install (not yet installed). */
  installTools: ReadonlySet<string>
  /** Tool row ids staged for removal (installed tools unchecked). */
  removeTools: ReadonlySet<string>
  /** Whether the save is in flight. */
  saving: boolean
  /** The last save failure, cleared by the next edit. */
  error: string | null
}

/** Page snapshot. */
export interface SubagentSectionState {
  status: 'idle' | 'loading' | 'ready' | 'unavailable' | 'error'
  /** Whole-load failure text; a mutation failure stays on its dialog. */
  error: string | null
  /** Whether the deployment configures a root new subagents can be written to. */
  authorable: boolean
  /** Whether the host can open a subagent directory on a native desktop. */
  hasDocument: boolean
  /** Every subagent the deployment currently supplies. */
  rows: readonly SubagentRow[]
  /** The open create/copy dialog, or null. */
  create: CreateDraft | null
  /** The open read-only viewer, or null. */
  view: ViewDraft | null
  /** The open edit dialog, or null. */
  edit: EditDraft | null
  /** The subagent awaiting delete confirmation. */
  pendingDelete: string | null
  /** Whether a delete is in flight. */
  deleting: boolean
  /**
   * Subagent directories shown as text because the host has no desktop opener.
   */
  revealedPaths: Readonly<Record<string, string>>
}

const INITIAL: SubagentSectionState = {
  status: 'idle',
  error: null,
  authorable: false,
  hasDocument: false,
  rows: [],
  create: null,
  view: null,
  edit: null,
  pendingDelete: null,
  deleting: false,
  revealedPaths: {},
}

/** The failure message of a rejected wire call. */
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Why this create cannot be submitted yet, as a locale key, or undefined. */
export function createBlocker(
  draft: CreateDraft,
  rows: readonly SubagentRow[],
): 'idRequired' | 'idInvalid' | 'idTaken' | undefined {
  if (draft.id === '') return 'idRequired'
  if (!SUBAGENT_ID.test(draft.id)) return 'idInvalid'
  if (rows.some(row => row.id === draft.id)) return 'idTaken'
  return undefined
}

/**
 * Map the model-plan wire's roster entries to the edit dialog's plan choices.
 * A plan's picker copy shows its id plus the provider/model route it pins, so
 * a person can tell similarly-named plans apart. The plan id is the stored
 * value; the route is display-only.
 * @param plans - the model-plan roster entries.
 * @returns the plan choices for the picker, roster order preserved.
 */
export function planChoicesFrom(plans: readonly {
  id: string
  provider: string
  model: string
  broken?: string
}[]): readonly PlanChoice[] {
  return plans
    .filter(plan => plan.broken === undefined)
    .map(plan => ({ id: plan.id, provider: plan.provider, model: plan.model }))
}

/** The empty option value that restores "inherit the parent's model". */
export const INHERIT_MODEL_VALUE = ''

/**
 * The model-plan roster wire the edit dialog reads. This is the only seam
 * where the subagent surface reaches the model-plan bundle: a single `list`
 * over the `/model-plan` channel, consumed structurally (subagents do not
 * import the model-plan bundle's types).
 */
export interface PlanListWire {
  list(payload: Record<string, never>): Promise<RpcResult<{ plans: readonly PlanWireEntry[]; authorable: boolean }>>
}

/** Reads the roster and drives the create, edit, toggle, delete, and location reveals. */
export class SubagentSectionController {
  /** Page snapshot the renderer subscribes to. */
  readonly store: SnapshotStore<SubagentSectionState> = createSnapshotStore(INITIAL)

  constructor(
    private readonly api: { subagentPresets: SubagentPresetWire },
    /** The model-plan wire, for the edit dialog's plan picker. */
    private readonly plans: PlanListWire,
    /** Called after this page changes the roster, so sibling surfaces re-read. */
    private readonly rosterChanged: () => void = () => {},
  ) {}

  private set(patch: Partial<SubagentSectionState>): void {
    this.store.set({ ...this.store.getSnapshot(), ...patch })
  }

  private patchCreate(patch: Partial<CreateDraft>): void {
    const { create } = this.store.getSnapshot()
    if (create === null) return
    this.set({ create: { ...create, ...patch } })
  }

  private patchEdit(patch: Partial<EditDraft>): void {
    const { edit } = this.store.getSnapshot()
    if (edit === null) return
    this.set({ edit: { ...edit, ...patch } })
  }

  /** Load the roster. An empty roster is a valid deployment, not a failure. */
  async load(): Promise<void> {
    const before = this.store.getSnapshot()
    if (before.status === 'loading') return
    this.set({ status: 'loading', error: null })
    let value
    try {
      const result = await this.api.subagentPresets.list({})
      if (!result.ok) {
        this.set({ status: 'error', error: result.error.message })
        return
      }
      value = result.value
    } catch (error) {
      this.set({ status: 'error', error: messageOf(error) })
      return
    }
    const { subagents, authorable, hasDocument } = value
    if (subagents.length === 0) {
      this.set({ status: 'unavailable', rows: [], authorable, hasDocument, create: null, edit: null })
      return
    }
    const revealed = this.store.getSnapshot().revealedPaths
    const kept = Object.fromEntries(
      Object.entries(revealed).filter(([id]) => subagents.some(subagent => subagent.id === id)))
    this.set({
      status: 'ready',
      error: null,
      authorable,
      hasDocument,
      rows: subagents.map(subagent => ({ ...subagent })),
      revealedPaths: kept,
    })
  }

  /** Open the create/copy dialog over one subagent. */
  beginCreate(from: string): void {
    const row = this.store.getSnapshot().rows.find(candidate => candidate.id === from)
    this.set({
      error: null,
      create: { from, fromTitle: row?.id ?? from, id: '', saving: false, error: null },
    })
  }

  /** Close the create dialog, discarding whatever was typed. */
  cancelCreate(): void {
    this.set({ create: null })
  }

  /** Name the subagent the create makes. */
  setCreateId(id: string): void {
    this.patchCreate({ id, error: null })
  }

  /** Submit the create, re-read the roster, then open the new subagent's files. */
  async confirmCreate(): Promise<void> {
    const draft = this.store.getSnapshot().create
    if (draft === null || draft.saving) return
    if (createBlocker(draft, this.store.getSnapshot().rows) !== undefined) return
    this.patchCreate({ saving: true, error: null })
    try {
      const result = await this.api.subagentPresets.create({
        from: draft.from,
        subagent: draft.id,
      })
      if (!result.ok) {
        this.patchCreate({ saving: false, error: result.error.message })
        return
      }
      this.set({ create: null })
      await this.load()
      this.rosterChanged()
      await this.openLocation(draft.id)
    } catch (error) {
      this.patchCreate({ saving: false, error: messageOf(error) })
    }
  }

  /** Open one subagent's directory on the host desktop, or reveal its path. */
  async openLocation(id: string): Promise<void> {
    try {
      const result = await this.api.subagentPresets.openDocument({ subagent: id })
      if (!result.ok) {
        this.set({ error: result.error.message })
        return
      }
      if (result.value.opened) return
      const { path } = result.value
      this.set({ revealedPaths: { ...this.store.getSnapshot().revealedPaths, [id]: path } })
    } catch (error) {
      this.set({ error: messageOf(error) })
    }
  }

  /**
   * Toggle one subagent's enabled switch on the row.
   *
   * The toggle is now an enabled-only metadata write through `update` (the
   * wire-level `toggle` method was removed): the host routes it to the
   * enabled-only path that leaves the row's other metadata intact, writing a
   * shipped subagent's override rather than its install.
   */
  async toggle(id: string, enabled: boolean): Promise<void> {
    try {
      const result = await this.api.subagentPresets.update({
        subagent: id,
        metadata: { enabled },
      })
      if (!result.ok) {
        this.set({ error: result.error.message })
        return
      }
      await this.load()
      this.rosterChanged()
    } catch (error) {
      this.set({ error: messageOf(error) })
    }
  }

  /** Open the read-only viewer over one subagent's composition. */
  async beginView(id: string): Promise<void> {
    const row = this.store.getSnapshot().rows.find(candidate => candidate.id === id)
    this.set({ error: null, view: null })
    try {
      const result = await this.api.subagentPresets.read({ subagent: id })
      if (!result.ok) {
        this.set({ error: result.error.message })
        return
      }
      this.set({
        view: { id, title: row?.id ?? id, content: result.value.content },
      })
    } catch (error) {
      this.set({ error: messageOf(error) })
    }
  }

  /** Close the read-only viewer. */
  closeView(): void {
    this.set({ view: null })
  }

  /** Open the edit dialog over one locally authored subagent. */
  async beginEdit(id: string): Promise<void> {
    const row = this.store.getSnapshot().rows.find(candidate => candidate.id === id)
    this.set({ error: null, edit: null })
    try {
      const [editableResult, plansResult] = await Promise.all([
        this.api.subagentPresets.readEditable({ subagent: id }),
        this.plans.list({}),
      ])
      if (!editableResult.ok) {
        this.set({ error: editableResult.error.message })
        return
      }
      const value = editableResult.value
      // The plan picker is fed from the model-plan roster so the plans a
      // subagent may bind never drift from what the deployment actually serves.
      // A plan-list failure leaves the "inherit the parent" entry alone; the
      // edit dialog stays usable, it just offers no concrete plans.
      const plans = planChoicesFrom(plansListEntries(plansResult))
      this.set({
        edit: {
          id,
          title: row?.id ?? id,
          metadata: {
            description: value.metadata.description ?? '',
            ...value.metadata.model === undefined ? {} : { model: value.metadata.model },
            ...value.metadata.enabled === undefined ? {} : { enabled: value.metadata.enabled },
            inheritParent: value.metadata.inheritParent === true,
          },
          ...value.persona === undefined ? {} : { persona: value.persona.text },
          tools: value.tools.map(toolToDraft),
          catalog: value.catalog.map(catalogToDraft),
          planChoices: plans,
          installTools: new Set<string>(),
          removeTools: new Set<string>(),
          saving: false,
          error: null,
        },
      })
    } catch (error) {
      this.set({ error: messageOf(error) })
    }
  }

  /** Close the edit dialog, discarding whatever was typed. */
  cancelEdit(): void {
    this.set({ edit: null })
  }

  /**
   * Stage one edit field.
   *
   * Scopes: `name`, `description`, and `persona` take `value`; `inheritParent`
   * takes the checkbox's boolean; `tools:<row id>` takes `disabled` (the
   * checkbox checked state inverts it); `catalog:<package name>` takes
   * `install`/`remove` to stage installing or removing an available-tools
   * package.
   */
  setEditField(scope: string, field: string, value: string | boolean): void {
    const { edit } = this.store.getSnapshot()
    if (edit === null) return
    if (scope === 'persona') {
      this.patchEdit({ persona: String(value), error: null })
      return
    }
    if (scope === 'description') {
      // The description is always a string; an empty one is a staged clear.
      this.patchEdit({
        metadata: { ...edit.metadata, description: String(value) },
        error: null,
      })
      return
    }
    if (scope === 'inheritParent') {
      this.patchEdit({
        metadata: { ...edit.metadata, inheritParent: value === true },
        error: null,
      })
      return
    }
    if (scope === 'model') {
      // An empty pick reverts to the parent's default: it stages `undefined`
      // so save clears the stored model rather than leaving it alone. A
      // concrete pick stores the plan id string directly.
      const planId = typeof value === 'string' ? value.trim() : ''
      this.patchEdit({
        metadata: { ...edit.metadata, ...planId === '' ? {} : { model: planId } },
        error: null,
      })
      return
    }
    if (scope.startsWith('tools:')) {
      const id = scope.slice('tools:'.length)
      this.patchEdit({
        tools: edit.tools.map(tool => tool.id === id ? { ...tool, disabled: value !== true } : tool),
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

  /** Save the edit dialog's staged fields, then re-read the roster. */
  async confirmEdit(): Promise<void> {
    const { edit } = this.store.getSnapshot()
    if (edit === null || edit.saving) return
    this.patchEdit({ saving: true, error: null })
    try {
      // A row disabled by a `!!js` expression is not the form's to write; every
      // literal row is submitted wholesale so the host rewrites only what the
      // form staged.
      const tools = Object.fromEntries(
        edit.tools
          .filter(tool => tool.disabled !== 'expr')
          .map(tool => [tool.id, { disabled: tool.disabled === true }]),
      )
      const installTools = [...edit.installTools]
        .filter(name => !edit.catalog.some(entry => entry.name === name && entry.installed))
      const removeRowIds = [...edit.removeTools]
        .map(name => edit.tools.find(tool => tool.name === name)?.id)
        .filter((id): id is string => id !== undefined)
      // The metadata is submitted as one whole so the host's whole-replace
      // semantics apply: every field the form owns is present, and an empty
      // description or an "inherit the parent" model pick (undefined) truly
      // clears the stored value instead of being skipped.
      const metadata = {
        description: edit.metadata.description,
        ...edit.metadata.model === undefined ? {} : { model: edit.metadata.model },
        ...edit.metadata.enabled === undefined ? {} : { enabled: edit.metadata.enabled },
        // Only a `true` inheritance opt-in is persisted; `false` (the default)
        // stays absent so the stored file reads as "no inheritance".
        ...edit.metadata.inheritParent ? { inheritParent: true } : {},
      }
      const result = await this.api.subagentPresets.update({
        subagent: edit.id,
        ...edit.persona === undefined ? {} : { persona: { text: edit.persona } },
        ...Object.keys(tools).length === 0 ? {} : { tools },
        ...installTools.length === 0 ? {} : { installTools },
        ...removeRowIds.length === 0 ? {} : { removeTools: removeRowIds },
        metadata,
      })
      if (!result.ok) {
        this.patchEdit({ saving: false, error: result.error.message })
        return
      }
      this.set({ edit: null })
      await this.load()
      this.rosterChanged()
    } catch (error) {
      this.patchEdit({ saving: false, error: messageOf(error) })
    }
  }

  /** Ask for confirmation before deleting one subagent. */
  confirmDelete(id: string | null): void {
    if (this.store.getSnapshot().deleting) return
    this.set({ pendingDelete: id })
  }

  /** Delete the subagent awaiting confirmation, then re-read the roster. */
  async remove(): Promise<void> {
    const { pendingDelete, deleting } = this.store.getSnapshot()
    if (pendingDelete === null || deleting) return
    this.set({ deleting: true, error: null })
    try {
      const result = await this.api.subagentPresets.remove({ subagent: pendingDelete })
      if (!result.ok) {
        this.set({ deleting: false, pendingDelete: null, error: result.error.message })
        return
      }
      this.set({ deleting: false, pendingDelete: null })
      await this.load()
      this.rosterChanged()
    } catch (error) {
      this.set({ deleting: false, pendingDelete: null, error: messageOf(error) })
    }
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
    disabled: row.disabled,
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
