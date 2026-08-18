/**
 * Team management controller: the roster as a list, a create dialog, a
 * row-level enable/disable toggle, an edit detail over the team's role roster
 * (body/soul/memory per role), delete, and opening a team's directory.
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
import type { IApiClient } from '@deepseek-ai/dsh-api-remotes/client';
import { type SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client';
import type { TeamPresetWire, WireRoleMemory } from './wire-client.ts';
/** A team's display metadata, mirrored from the wire. */
export interface TeamMetadata {
    /** Display name (defaults to the id when absent). */
    readonly name?: string;
    /** One sentence on what the team is for. */
    readonly description?: string;
    /** Whether the team is enabled for delegation. */
    readonly enabled?: boolean;
}
/** One team row the page renders. */
export interface TeamRow {
    /** Team id and directory name. */
    id: string;
    /** Whether the team ships with the deployment or was authored locally. */
    trust: 'system' | 'user';
    /** The team's display metadata. */
    metadata: TeamMetadata;
    /** Number of roles on the roster. */
    roleCount: number;
    /** Why the team cannot be used, absent when it can. */
    broken?: string;
}
/** One staged role row in the create/detail editor. */
export interface RoleDraft {
    /** The role id. */
    id: string;
    /** One sentence on the role's responsibility. */
    description: string;
    /** The role's own soul prompt, injected as the child's persona. */
    prompt: string;
    /** The bound body: a user-defined subagent id. */
    body: string;
    /** Memory policy: one-shot or persistent. */
    memory: WireRoleMemory;
}
/** The create dialog: a new id plus its initial role roster. */
export interface CreateDraft {
    /** The new team id being typed; the directory name, so it is required. */
    id: string;
    /** Display name (optional). */
    name: string;
    /** The initial role roster. */
    roles: readonly RoleDraft[];
    /** Whether the create is in flight. */
    saving: boolean;
    /** The last create failure, cleared by the next edit. */
    error: string | null;
}
/**
 * The single-role edit draft open over a team detail. `kind` distinguishes
 * editing an existing roster row (`'existing'`) from drafting a freshly added
 * row that hasn't been written back yet (`'new'`). `dirty` flips on the first
 * field set so the cancel path can decide whether to roll back an existing
 * row or discard a brand-new draft.
 */
export type RoleEditDraft = {
    kind: 'existing';
    /** Index into the team detail's roles array the draft opened from. */
    index: number;
    /** The staged role fields. */
    draft: RoleDraft;
    /** Whether any field has been staged since the edit opened. */
    dirty: boolean;
    /** The original row the draft was cloned from, for cancel rollback. */
    original: RoleDraft;
    /** Last wire error from a save attempt (cleared on the next edit). */
    error: string | null;
} | {
    kind: 'new';
    /** The staged role fields. */
    draft: RoleDraft;
    /**
     * New drafts are always dirty until saved — typing is the only way to
     * reach this branch, and cancel must discard the draft anyway.
     */
    dirty: boolean;
    /** Last wire error from a save attempt (cleared on the next edit). */
    error: string | null;
};
/** The open edit detail over one team's full role roster. */
export interface DetailDraft {
    /** The team being edited. */
    id: string;
    /** Display name, for the dialog title. */
    title: string;
    /** Display metadata (name/description/enabled). */
    metadata: TeamMetadata;
    /** The editable role roster. */
    roles: readonly RoleDraft[];
    /** Whether the save is in flight. */
    saving: boolean;
    /** The last save failure, cleared by the next edit. */
    error: string | null;
    /**
     * The open single-role edit. When non-null the team-level dialog defers to
     * it: cancelling or saving the role edit resolves back into the roster
     * before the team-level save can run.
     */
    roleEdit: RoleEditDraft | null;
}
/** Page snapshot. */
export interface TeamSectionState {
    status: 'idle' | 'loading' | 'ready' | 'unavailable' | 'error';
    /** Whole-load failure text; a mutation failure stays on its dialog. */
    error: string | null;
    /** Whether the deployment configures a root new teams can be written to. */
    authorable: boolean;
    /** Whether the host can open a team directory on a native desktop. */
    hasDocument: boolean;
    /** The subagent ids a role's body may select from. */
    bodies: readonly string[];
    /** Every team the deployment currently supplies. */
    rows: readonly TeamRow[];
    /** The open create dialog, or null. */
    create: CreateDraft | null;
    /** The open edit detail, or null. */
    detail: DetailDraft | null;
    /** The team awaiting delete confirmation. */
    pendingDelete: string | null;
    /** Whether a delete is in flight. */
    deleting: boolean;
    /** Team directories shown as text because the host has no desktop opener. */
    revealedPaths: Readonly<Record<string, string>>;
}
/** Why this create cannot be submitted yet, as a locale key, or undefined. */
export declare function createBlocker(draft: CreateDraft, rows: readonly TeamRow[]): 'idRequired' | 'idInvalid' | 'idTaken' | 'roleIdRequired' | 'roleBodyRequired' | undefined;
/** Why an edit detail cannot be saved yet, as a locale key, or undefined. */
export declare function detailBlocker(draft: DetailDraft): 'roleIdRequired' | 'roleBodyRequired' | undefined;
/** Why the role roster cannot be submitted, as a locale key, or undefined. */
export declare function roleBlocker(roles: readonly RoleDraft[]): 'roleIdRequired' | 'roleBodyRequired' | undefined;
/**
 * Read the roster and drive the create, edit detail, toggle, delete, and
 * location reveals.
 */
export declare class TeamSectionController {
    private readonly api;
    /** Called after this page changes the roster, so sibling surfaces re-read. */
    private readonly rosterChanged;
    /** Page snapshot the renderer subscribes to. */
    readonly store: SnapshotStore<TeamSectionState>;
    constructor(api: Pick<IApiClient, 'llm'> & {
        teamPresets: TeamPresetWire;
    }, 
    /** Called after this page changes the roster, so sibling surfaces re-read. */
    rosterChanged?: () => void);
    private set;
    private patchCreate;
    private patchDetail;
    /** Load the roster. An empty roster is a valid deployment, not a failure. */
    load(): Promise<void>;
    /** Open the create dialog with one fresh empty role. */
    beginCreate(): void;
    /** Close the create dialog, discarding whatever was typed. */
    cancelCreate(): void;
    /** Name the team the create makes. */
    setCreateId(id: string): void;
    /** Set the create dialog's display name. */
    setCreateName(name: string): void;
    /** Stage one field of one create role row. */
    setCreateRoleField(index: number, field: string, value: string): void;
    /** Add an empty role row to the create dialog. */
    addCreateRole(): void;
    /** Remove one role row from the create dialog. */
    removeCreateRole(index: number): void;
    /** Submit the create, then re-read the roster. */
    confirmCreate(): Promise<void>;
    /** Open one team's directory on the host desktop, or reveal its path. */
    openLocation(id: string): Promise<void>;
    /**
     * Toggle one team's enabled switch on the row. An enabled-only metadata
     * write through `update`, mirroring the subagent surface.
     */
    toggle(id: string, enabled: boolean): Promise<void>;
    /** Open the edit detail over one team's full role roster. */
    beginDetail(id: string): Promise<void>;
    /** Close the edit detail, discarding whatever was typed. */
    closeDetail(): void;
    /** Set the detail dialog's display name. */
    setDetailName(name: string): void;
    /** Set the detail dialog's display description. */
    setDetailDescription(description: string): void;
    /**
     * Append a blank role to the team detail's roster and open the edit
     * dialog over it in a `'new'` draft state. The new row stays in the roster
     * through `saveRoleEdit` and is unwound on `cancelRoleEdit`.
     */
    addRoleInDetail(): void;
    /** Open the single-role edit over one existing roster row. */
    beginRoleEdit(index: number): void;
    /** Remove one role row from the team detail (and any open edit on it). */
    removeRole(index: number): void;
    /** Stage one field on the open role edit draft, marking it dirty. */
    setRoleEditField(field: 'id' | 'description' | 'prompt' | 'body' | 'memory', value: string): void;
    /**
     * Commit the open role edit: validate, then write back into the roster
     * (replacing the existing row, or trimming the trailing new row). The
     * team-level save (`confirmDetail`) is a separate step.
     */
    saveRoleEdit(): void;
    /**
     * Cancel the open role edit. For an existing row, the staged draft is
     * discarded (the roster was never touched, so rollback is a no-op). For a
     * new row, the trailing blank row that `addRoleInDetail` appended is
     * removed along with the discarded draft.
     */
    cancelRoleEdit(): void;
    /** Save the edit detail's staged roster and metadata, then re-read. */
    confirmDetail(): Promise<void>;
    /** Ask for confirmation before deleting one team. */
    confirmDelete(id: string | null): void;
    /** Delete the team awaiting confirmation, then re-read the roster. */
    remove(): Promise<void>;
}
//# sourceMappingURL=section-store.d.ts.map