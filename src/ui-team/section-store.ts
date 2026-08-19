/**
 * Team management controller: the roster as a list, a create dialog, a
 * row-level enable/disable toggle, an edit detail over the team's role roster
 * (subagent/prompt/memory per role), delete, and opening a team's directory.
 *
 * The host stays the single fact source. Every mutation writes through the
 * wire and the page re-reads the roster afterwards, because a toggle or edit
 * changes more than the row it targeted (the roster order and states recompute
 * from the host).
 *
 * Inside one team's edit detail, the role roster is rendered as compact list
 * rows. Tapping a row (or tapping "add role") opens a single-role edit
 * dialog over a staged draft. The open edit holds its own `dirty` flag so
 * `cancel` rolls back without touching the roster (for an existing role) and
 * without leaving a phantom row behind (for a new role). A role edit must be
 * either saved or cancelled before the team-level save; the controller
 * enforces that ordering at `confirmDetail`.
 */

import type { IApiClient } from '@deepseek-ai/dsh-api-remotes/client'
import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { TeamPresetWire, WireRole, WireRoleMemory } from './wire-client.ts'

/** Ids a team directory may be named, mirroring the host's own rule. */
const TEAM_ID = /^[a-z0-9][a-z0-9-]*$/

/** A team's display metadata, mirrored from the wire. */
export interface TeamMetadata {
  /** Display name (defaults to the id when absent). */
  readonly name?: string
  /** One sentence on what the team is for. */
  readonly description?: string
  /** Whether the team is enabled for delegation. */
  readonly enabled?: boolean
}

/** One team row the page renders. */
export interface TeamRow {
  /** Team id and directory name. */
  id: string
  /** Whether the team ships with the deployment or was authored locally. */
  trust: 'system' | 'user'
  /** The team's display metadata. */
  metadata: TeamMetadata
  /** Number of roles on the roster. */
  roleCount: number
  /** Why the team cannot be used, absent when it can. */
  broken?: string
}

/** One staged role row in the create/detail editor. */
export interface RoleDraft {
  /** The role id. */
  id: string
  /** One sentence on the role's responsibility. */
  description: string
  /** The role's own prompt, injected as the child's persona. */
  prompt: string
  /** The bound subagent: a user-defined subagent id. */
  subagent: string
  /**
   * The role's position in the team hierarchy: a positive integer, default 1.
   * Level 1 can only be delegated to; level >= 2 may delegate to lower levels.
   */
  level: number
  /** Memory policy: one-shot or persistent. */
  memory: WireRoleMemory
}

/** The create dialog: a new id plus its initial role roster. */
export interface CreateDraft {
  /** The new team id being typed; the directory name, so it is required. */
  id: string
  /** Display name (optional). */
  name: string
  /** The initial role roster. */
  roles: readonly RoleDraft[]
  /** Whether the create is in flight. */
  saving: boolean
  /** The last create failure, cleared by the next edit. */
  error: string | null
}

/**
 * The single-role edit draft open over a team detail. `kind` distinguishes
 * editing an existing roster row (`'existing'`) from drafting a freshly added
 * row that hasn't been written back yet (`'new'`). `dirty` flips on the first
 * field set so the cancel path can decide whether to roll back an existing
 * row or discard a brand-new draft.
 */
export type RoleEditDraft =
  | {
    kind: 'existing'
    /** Index into the team detail's roles array the draft opened from. */
    index: number
    /** The staged role fields. */
    draft: RoleDraft
    /** Whether any field has been staged since the edit opened. */
    dirty: boolean
    /** The original row the draft was cloned from, for cancel rollback. */
    original: RoleDraft
    /** Last wire error from a save attempt (cleared on the next edit). */
    error: string | null
  }
  | {
    kind: 'new'
    /** The staged role fields. */
    draft: RoleDraft
    /**
     * New drafts are always dirty until saved — typing is the only way to
     * reach this branch, and cancel must discard the draft anyway.
     */
    dirty: boolean
    /** Last wire error from a save attempt (cleared on the next edit). */
    error: string | null
  }

/** The open edit detail over one team's full role roster. */
export interface DetailDraft {
  /** The team being edited. */
  id: string
  /** Display name, for the dialog title. */
  title: string
  /** Display metadata (name/description/enabled). */
  metadata: TeamMetadata
  /**
   * A config-hygiene advisory read from the team detail (e.g. one-shot role at
   * level >= 2), shown on the dialog so the user sees why a delegation may not
   * recur. Absent when the team is clean.
   */
  warning?: string
  /** The editable role roster. */
  roles: readonly RoleDraft[]
  /** Whether the save is in flight. */
  saving: boolean
  /** The last save failure, cleared by the next edit. */
  error: string | null
  /**
   * The open single-role edit. When non-null the team-level dialog defers to
   * it: cancelling or saving the role edit resolves back into the roster
   * before the team-level save can run.
   */
  roleEdit: RoleEditDraft | null
}

/** Page snapshot. */
export interface TeamSectionState {
  status: 'idle' | 'loading' | 'ready' | 'unavailable' | 'error'
  /** Whole-load failure text; a mutation failure stays on its dialog. */
  error: string | null
  /** Whether the deployment configures a root new teams can be written to. */
  authorable: boolean
  /** Whether the host can open a team directory on a native desktop. */
  hasDocument: boolean
  /** The subagent ids a role's subagent may select from. */
  subagents: readonly string[]
  /** Every team the deployment currently supplies. */
  rows: readonly TeamRow[]
  /** The open create dialog, or null. */
  create: CreateDraft | null
  /** The open edit detail, or null. */
  detail: DetailDraft | null
  /** The team awaiting delete confirmation. */
  pendingDelete: string | null
  /** Whether a delete is in flight. */
  deleting: boolean
  /** Team directories shown as text because the host has no desktop opener. */
  revealedPaths: Readonly<Record<string, string>>
}

const INITIAL: TeamSectionState = {
  status: 'idle',
  error: null,
  authorable: false,
  hasDocument: false,
  subagents: [],
  rows: [],
  create: null,
  detail: null,
  pendingDelete: null,
  deleting: false,
  revealedPaths: {},
}

/** A fresh empty role row (default level 1). */
function emptyRole(): RoleDraft {
  return { id: '', description: '', prompt: '', subagent: '', level: 1, memory: 'one-shot' }
}

/** The failure message of a rejected wire call. */
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Why this create cannot be submitted yet, as a locale key, or undefined. */
export function createBlocker(
  draft: CreateDraft,
  rows: readonly TeamRow[],
): 'idRequired' | 'idInvalid' | 'idTaken' | 'roleIdRequired' | 'roleSubagentRequired' | undefined {
  if (draft.id === '') return 'idRequired'
  if (!TEAM_ID.test(draft.id)) return 'idInvalid'
  if (rows.some(row => row.id === draft.id)) return 'idTaken'
  return roleBlocker(draft.roles)
}

/** Why an edit detail cannot be saved yet, as a locale key, or undefined. */
export function detailBlocker(
  draft: DetailDraft,
): 'roleIdRequired' | 'roleSubagentRequired' | undefined {
  return roleBlocker(draft.roles)
}

/** Why the role roster cannot be submitted, as a locale key, or undefined. */
export function roleBlocker(roles: readonly RoleDraft[]): 'roleIdRequired' | 'roleSubagentRequired' | undefined {
  if (roles.length === 0) return 'roleIdRequired'
  for (const role of roles) {
    if (role.id === '') return 'roleIdRequired'
    if (role.subagent === '') return 'roleSubagentRequired'
  }
  return undefined
}

/**
 * Read the roster and drive the create, edit detail, toggle, delete, and
 * location reveals.
 */
export class TeamSectionController {
  /** Page snapshot the renderer subscribes to. */
  readonly store: SnapshotStore<TeamSectionState> = createSnapshotStore(INITIAL)

  constructor(
    private readonly api: Pick<IApiClient, 'llm'> & { teamPresets: TeamPresetWire },
    /** Called after this page changes the roster, so sibling surfaces re-read. */
    private readonly rosterChanged: () => void = () => {},
  ) {}

  private set(patch: Partial<TeamSectionState>): void {
    this.store.set({ ...this.store.getSnapshot(), ...patch })
  }

  private patchCreate(patch: Partial<CreateDraft>): void {
    const { create } = this.store.getSnapshot()
    if (create === null) return
    this.set({ create: { ...create, ...patch } })
  }

  private patchDetail(patch: Partial<DetailDraft>): void {
    const { detail } = this.store.getSnapshot()
    if (detail === null) return
    this.set({ detail: { ...detail, ...patch } })
  }

  /** Load the roster. An empty roster is a valid deployment, not a failure. */
  async load(): Promise<void> {
    const before = this.store.getSnapshot()
    if (before.status === 'loading') return
    this.set({ status: 'loading', error: null })
    let value
    try {
      const result = await this.api.teamPresets.list({})
      if (!result.ok) {
        this.set({ status: 'error', error: result.error.message })
        return
      }
      value = result.value
    } catch (error) {
      this.set({ status: 'error', error: messageOf(error) })
      return
    }
    const { teams, authorable, hasDocument, subagents } = value
    if (teams.length === 0) {
      this.set({
        status: 'unavailable', rows: [], authorable, hasDocument, subagents,
        create: null, detail: null,
      })
      return
    }
    const revealed = this.store.getSnapshot().revealedPaths
    const kept = Object.fromEntries(
      Object.entries(revealed).filter(([id]) => teams.some(team => team.id === id)))
    this.set({
      status: 'ready',
      error: null,
      authorable,
      hasDocument,
      subagents,
      rows: teams.map(team => ({
        id: team.id,
        trust: team.trust,
        metadata: team.metadata,
        roleCount: team.roles.length,
        ...team.broken === undefined ? {} : { broken: team.broken },
      })),
      revealedPaths: kept,
    })
  }

  /** Open the create dialog with one fresh empty role. */
  beginCreate(): void {
    this.set({
      error: null,
      create: { id: '', name: '', roles: [emptyRole()], saving: false, error: null },
    })
  }

  /** Close the create dialog, discarding whatever was typed. */
  cancelCreate(): void {
    this.set({ create: null })
  }

  /** Name the team the create makes. */
  setCreateId(id: string): void {
    this.patchCreate({ id, error: null })
  }

  /** Set the create dialog's display name. */
  setCreateName(name: string): void {
    this.patchCreate({ name, error: null })
  }

  /** Stage one field of one create role row. */
  setCreateRoleField(index: number, field: string, value: string): void {
    const { create } = this.store.getSnapshot()
    if (create === null) return
    this.patchCreate({
      roles: create.roles.map((role, i) => i === index ? patchRole(role, field, value) : role),
      error: null,
    })
  }

  /** Add an empty role row to the create dialog. */
  addCreateRole(): void {
    const { create } = this.store.getSnapshot()
    if (create === null) return
    this.patchCreate({ roles: [...create.roles, emptyRole()], error: null })
  }

  /** Remove one role row from the create dialog. */
  removeCreateRole(index: number): void {
    const { create } = this.store.getSnapshot()
    if (create === null) return
    this.patchCreate({ roles: create.roles.filter((_, i) => i !== index), error: null })
  }

  /** Submit the create, then re-read the roster. */
  async confirmCreate(): Promise<void> {
    const draft = this.store.getSnapshot().create
    if (draft === null || draft.saving) return
    if (createBlocker(draft, this.store.getSnapshot().rows) !== undefined) return
    this.patchCreate({ saving: true, error: null })
    try {
      const result = await this.api.teamPresets.create({
        id: draft.id,
        ...draft.name === '' ? {} : { name: draft.name },
        roles: draft.roles.map(roleToWire),
      })
      if (!result.ok) {
        this.patchCreate({ saving: false, error: result.error.message })
        return
      }
      this.set({ create: null })
      await this.load()
      this.rosterChanged()
    } catch (error) {
      this.patchCreate({ saving: false, error: messageOf(error) })
    }
  }

  /** Open one team's directory on the host desktop, or reveal its path. */
  async openLocation(id: string): Promise<void> {
    try {
      const result = await this.api.teamPresets.openLocation({ id })
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
   * Toggle one team's enabled switch on the row. An enabled-only metadata
   * write through `update`, mirroring the subagent surface.
   */
  async toggle(id: string, enabled: boolean): Promise<void> {
    try {
      const result = await this.api.teamPresets.update({
        id,
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

  /** Open the edit detail over one team's full role roster. */
  async beginDetail(id: string): Promise<void> {
    const row = this.store.getSnapshot().rows.find(candidate => candidate.id === id)
    this.set({ error: null, detail: null })
    try {
      const result = await this.api.teamPresets.read({ id })
      if (!result.ok) {
        this.set({ error: result.error.message })
        return
      }
      const team = result.value.team
      this.set({
        detail: {
          id,
          title: team.metadata.name ?? row?.id ?? id,
          metadata: team.metadata,
          ...team.warning === undefined ? {} : { warning: team.warning },
          roles: team.roles.map(role => ({
            id: role.id,
            description: role.description ?? '',
            prompt: role.prompt ?? '',
            subagent: role.subagent,
            level: role.level,
            memory: role.memory,
          })),
          saving: false,
          error: null,
          roleEdit: null,
        },
      })
    } catch (error) {
      this.set({ error: messageOf(error) })
    }
  }

  /** Close the edit detail, discarding whatever was typed. */
  closeDetail(): void {
    this.set({ detail: null })
  }

  /** Set the detail dialog's display name. */
  setDetailName(name: string): void {
    const { detail } = this.store.getSnapshot()
    if (detail === null) return
    this.patchDetail({ metadata: { ...detail.metadata, name }, error: null })
  }

  /** Set the detail dialog's display description. */
  setDetailDescription(description: string): void {
    const { detail } = this.store.getSnapshot()
    if (detail === null) return
    this.patchDetail({ metadata: { ...detail.metadata, description }, error: null })
  }

  /**
   * Append a blank role to the team detail's roster and open the edit
   * dialog over it in a `'new'` draft state. The new row stays in the roster
   * through `saveRoleEdit` and is unwound on `cancelRoleEdit`.
   */
  addRoleInDetail(): void {
    const { detail } = this.store.getSnapshot()
    if (detail === null || detail.saving) return
    const newRole = emptyRole()
    this.patchDetail({
      roles: [...detail.roles, newRole],
      roleEdit: { kind: 'new', draft: newRole, dirty: true, error: null },
      error: null,
    })
  }

  /** Open the single-role edit over one existing roster row. */
  beginRoleEdit(index: number): void {
    const { detail } = this.store.getSnapshot()
    if (detail === null || detail.saving) return
    const role = detail.roles[index]
    if (role === undefined) return
    this.patchDetail({
      roleEdit: { kind: 'existing', index, draft: { ...role }, original: { ...role }, dirty: false, error: null },
      error: null,
    })
  }

  /** Remove one role row from the team detail (and any open edit on it). */
  removeRole(index: number): void {
    const { detail } = this.store.getSnapshot()
    if (detail === null || detail.saving) return
    const open = detail.roleEdit
    const roleEdit = open !== null
      ? (open.kind === 'existing' && open.index === index
        ? null
        : (open.kind === 'new' && detail.roles.length - 1 === index ? null : open))
      : null
    this.patchDetail({
      roles: detail.roles.filter((_, i) => i !== index),
      roleEdit,
      error: null,
    })
  }

  /** Stage one field on the open role edit draft, marking it dirty. */
  setRoleEditField(field: 'id' | 'description' | 'prompt' | 'subagent' | 'level' | 'memory', value: string): void {
    const { detail } = this.store.getSnapshot()
    if (detail === null || detail.roleEdit === null) return
    this.patchDetail({
      roleEdit: { ...detail.roleEdit, draft: patchRole(detail.roleEdit.draft, field, value), dirty: true, error: null },
      error: null,
    })
  }

  /**
   * Commit the open role edit: validate, then write back into the roster
   * (replacing the existing row, or trimming the trailing new row). The
   * team-level save (`confirmDetail`) is a separate step.
   */
  saveRoleEdit(): void {
    const { detail } = this.store.getSnapshot()
    if (detail === null || detail.roleEdit === null) return
    const edit = detail.roleEdit
    if (roleBlocker([edit.draft]) !== undefined) return
    if (edit.kind === 'new') {
      // Trim the trailing role so save doesn't double-insert. The next
      // "add role" action will append a fresh row at the new tail.
      const head = detail.roles.slice(0, detail.roles.length - 1)
      this.patchDetail({
        roles: [...head, edit.draft],
        roleEdit: null,
        error: null,
      })
      return
    }
    const index = edit.index
    // An existing edit's index may have slipped out of range if the roster
    // was mutated while the dialog was open. Drop the draft in that case.
    if (index >= detail.roles.length) {
      this.patchDetail({ roleEdit: null })
      return
    }
    this.patchDetail({
      roles: detail.roles.map((role, i) => i === index ? edit.draft : role),
      roleEdit: null,
      error: null,
    })
  }

  /**
   * Cancel the open role edit. For an existing row, the staged draft is
   * discarded (the roster was never touched, so rollback is a no-op). For a
   * new row, the trailing blank row that `addRoleInDetail` appended is
   * removed along with the discarded draft.
   */
  cancelRoleEdit(): void {
    const { detail } = this.store.getSnapshot()
    if (detail === null || detail.roleEdit === null) return
    const edit = detail.roleEdit
    if (edit.kind === 'new') {
      const next = detail.roles.slice(0, detail.roles.length - 1)
      this.patchDetail({ roles: next, roleEdit: null, error: null })
      return
    }
    this.patchDetail({ roleEdit: null })
  }

  /** Save the edit detail's staged roster and metadata, then re-read. */
  async confirmDetail(): Promise<void> {
    const { detail } = this.store.getSnapshot()
    if (detail === null || detail.saving) return
    // A pending role edit must be resolved first; otherwise the team's save
    // would race with the draft and drop the unsaved role.
    if (detail.roleEdit !== null) return
    if (detailBlocker(detail) !== undefined) return
    this.patchDetail({ saving: true, error: null })
    try {
      const result = await this.api.teamPresets.update({
        id: detail.id,
        metadata: {
          ...detail.metadata.name === undefined || detail.metadata.name === '' ? {} : { name: detail.metadata.name },
          ...detail.metadata.description === undefined || detail.metadata.description === ''
            ? {}
            : { description: detail.metadata.description },
          ...detail.metadata.enabled === undefined ? {} : { enabled: detail.metadata.enabled },
        },
        roles: detail.roles.map(roleToWire),
      })
      if (!result.ok) {
        this.patchDetail({ saving: false, error: result.error.message })
        return
      }
      this.set({ detail: null })
      await this.load()
      this.rosterChanged()
    } catch (error) {
      this.patchDetail({ saving: false, error: messageOf(error) })
    }
  }

  /** Ask for confirmation before deleting one team. */
  confirmDelete(id: string | null): void {
    if (this.store.getSnapshot().deleting) return
    this.set({ pendingDelete: id })
  }

  /** Delete the team awaiting confirmation, then re-read the roster. */
  async remove(): Promise<void> {
    const { pendingDelete, deleting } = this.store.getSnapshot()
    if (pendingDelete === null || deleting) return
    this.set({ deleting: true, error: null })
    try {
      const result = await this.api.teamPresets.remove({ id: pendingDelete })
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

/** Patch one staged role field (id/description/prompt/subagent/level/memory). */
function patchRole(role: RoleDraft, field: string, value: string): RoleDraft {
  if (field === 'id') return { ...role, id: value }
  if (field === 'description') return { ...role, description: value }
  if (field === 'prompt') return { ...role, prompt: value }
  if (field === 'subagent') return { ...role, subagent: value }
  if (field === 'level') {
    // Level is a positive integer; the UI clamps non-integers and <1 to 1 so
    // the draft always stays schema-valid.
    const parsed = Number.parseInt(value, 10)
    return { ...role, level: Number.isInteger(parsed) && parsed >= 1 ? parsed : 1 }
  }
  if (field === 'memory') return { ...role, memory: value === 'persistent' ? 'persistent' : 'one-shot' }
  return role
}

/** Map a staged role onto the wire's role shape. */
function roleToWire(role: RoleDraft): WireRole {
  return {
    id: role.id,
    ...role.description === '' ? {} : { description: role.description },
    ...role.prompt === '' ? {} : { prompt: role.prompt },
    subagent: role.subagent,
    level: role.level,
    memory: role.memory,
  }
}
