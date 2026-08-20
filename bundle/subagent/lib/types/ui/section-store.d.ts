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
import type { RpcResult } from '@deepseek-ai/dsh-api-remotes/client';
import { type SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client';
import type { SubagentPresetWire } from './wire-client.ts';
/** A subagent's display metadata, mirrored from the wire. */
export interface SubagentMetadata {
    /** One sentence on what the subagent is for. */
    readonly description?: string;
    /** Whether the subagent is enabled for delegation. */
    readonly enabled?: boolean;
    /** Model-plan id the dispatched child binds; absent inherits the parent's. */
    readonly model?: string;
}
/** One subagent row the page renders. */
export interface SubagentRow {
    /** Subagent id and directory name; it is the display name. */
    id: string;
    /** Whether the subagent ships with the deployment or was authored locally. */
    trust: 'system' | 'user';
    /** The subagent's display metadata, carried as one object. */
    metadata: SubagentMetadata;
    /** Why the subagent cannot compose a child, absent when it can. */
    broken?: string;
}
/** The create/copy dialog: a new id and optional display name over a fixed source. */
export interface CreateDraft {
    /** The subagent being copied. */
    from: string;
    /** Display name of the source, for the dialog title. */
    fromTitle: string;
    /** New subagent id being typed; the directory name, so it is required. */
    id: string;
    /** Whether the create is in flight. */
    saving: boolean;
    /** The last create failure, cleared by the next edit. */
    error: string | null;
}
/** The read-only viewer over one subagent's composition. */
export interface ViewDraft {
    /** The subagent being viewed. */
    id: string;
    /** Display name, for the dialog title. */
    title: string;
    /** The composition text as stored. */
    content: string;
}
/** One staged tool row in the edit dialog. */
export interface ToolDraft {
    /** The composition row id. */
    id: string;
    /** The package the row loads. */
    name: string;
    /** Whether the row is disabled (`'expr'` means a `!!js` line owns it). */
    disabled: boolean | 'expr';
    /** Row prose, when the package published any. */
    description?: string;
}
/** One installable tool package the host's catalog knows. */
export interface CatalogDraft {
    readonly name: string;
    readonly toolNames: readonly string[];
    readonly description?: string;
    readonly installed: boolean;
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
    readonly id: string;
    /** The provider route the plan pins. */
    readonly provider: string;
    /** The provider-owned model id the plan pins. */
    readonly model: string;
    /** Why the plan cannot serve a subagent, when it cannot. */
    readonly broken?: string;
}
/**
 * One model-plan choice feeding the edit dialog's plan picker, mirrored from
 * the model-plan wire's roster entry. A plan is a fixed asset: an id plus the
 * provider/model route it pins (shown to disambiguate plans with similar ids).
 */
export interface PlanChoice {
    /** The plan id, which is what the subagent stores. */
    readonly id: string;
    /** The route the plan pins, shown as picker copy. */
    readonly provider: string;
    readonly model: string;
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
export declare function plansListEntries(result: RpcResult<{
    plans: readonly PlanWireEntry[];
    authorable: boolean;
}>): readonly PlanWireEntry[];
/** The edit dialog over one locally authored subagent. */
export interface EditDraft {
    /** The subagent being edited. */
    id: string;
    /** Display name, for the dialog title. */
    title: string;
    /**
     * The staged display metadata, seeded from the wire's `metadata` object and
     * submitted back as one whole on save. `description` is always a string (an
     * empty one clears the stored value); `model` is a plan id string when the
     * user picked a model-plan, and `undefined` when they have not or chose
     * "inherit the parent" (also a clear).
     */
    metadata: {
        description: string;
        model?: string;
        enabled?: boolean;
        /**
         * Whether the delegated child also inherits the main agent's preset before
         * the subagent's own tree. A form checkbox; `false` keeps the subagent
         * self-contained (the default), `true` overlays its tree on the inherited
         * parent composition. Only `true` is persisted, keeping the file clean.
         */
        inheritParent: boolean;
    };
    /** Every model-plan the deployment supplies, for the plan picker. */
    planChoices: readonly PlanChoice[];
    /** Staged persona text, when the composition carries a persona row. */
    persona?: string;
    /** Every tool row in the composition, with its enabled state. */
    tools: readonly ToolDraft[];
    /** Every installable tool package the host's catalog knows. */
    catalog: readonly CatalogDraft[];
    /** Package names staged for install (not yet installed). */
    installTools: ReadonlySet<string>;
    /** Tool row ids staged for removal (installed tools unchecked). */
    removeTools: ReadonlySet<string>;
    /** Whether the save is in flight. */
    saving: boolean;
    /** The last save failure, cleared by the next edit. */
    error: string | null;
}
/** Page snapshot. */
export interface SubagentSectionState {
    status: 'idle' | 'loading' | 'ready' | 'unavailable' | 'error';
    /** Whole-load failure text; a mutation failure stays on its dialog. */
    error: string | null;
    /** Whether the deployment configures a root new subagents can be written to. */
    authorable: boolean;
    /** Whether the host can open a subagent directory on a native desktop. */
    hasDocument: boolean;
    /** Every subagent the deployment currently supplies. */
    rows: readonly SubagentRow[];
    /** The open create/copy dialog, or null. */
    create: CreateDraft | null;
    /** The open read-only viewer, or null. */
    view: ViewDraft | null;
    /** The open edit dialog, or null. */
    edit: EditDraft | null;
    /** The subagent awaiting delete confirmation. */
    pendingDelete: string | null;
    /** Whether a delete is in flight. */
    deleting: boolean;
    /**
     * Subagent directories shown as text because the host has no desktop opener.
     */
    revealedPaths: Readonly<Record<string, string>>;
}
/** Why this create cannot be submitted yet, as a locale key, or undefined. */
export declare function createBlocker(draft: CreateDraft, rows: readonly SubagentRow[]): 'idRequired' | 'idInvalid' | 'idTaken' | undefined;
/**
 * Map the model-plan wire's roster entries to the edit dialog's plan choices.
 * A plan's picker copy shows its id plus the provider/model route it pins, so
 * a person can tell similarly-named plans apart. The plan id is the stored
 * value; the route is display-only.
 * @param plans - the model-plan roster entries.
 * @returns the plan choices for the picker, roster order preserved.
 */
export declare function planChoicesFrom(plans: readonly {
    id: string;
    provider: string;
    model: string;
    broken?: string;
}[]): readonly PlanChoice[];
/** The empty option value that restores "inherit the parent's model". */
export declare const INHERIT_MODEL_VALUE = "";
/**
 * The model-plan roster wire the edit dialog reads. This is the only seam
 * where the subagent surface reaches the model-plan bundle: a single `list`
 * over the `/model-plan` channel, consumed structurally (subagents do not
 * import the model-plan bundle's types).
 */
export interface PlanListWire {
    list(payload: Record<string, never>): Promise<RpcResult<{
        plans: readonly PlanWireEntry[];
        authorable: boolean;
    }>>;
}
/** Reads the roster and drives the create, edit, toggle, delete, and location reveals. */
export declare class SubagentSectionController {
    private readonly api;
    /** The model-plan wire, for the edit dialog's plan picker. */
    private readonly plans;
    /** Called after this page changes the roster, so sibling surfaces re-read. */
    private readonly rosterChanged;
    /** Page snapshot the renderer subscribes to. */
    readonly store: SnapshotStore<SubagentSectionState>;
    constructor(api: {
        subagentPresets: SubagentPresetWire;
    }, 
    /** The model-plan wire, for the edit dialog's plan picker. */
    plans: PlanListWire, 
    /** Called after this page changes the roster, so sibling surfaces re-read. */
    rosterChanged?: () => void);
    private set;
    private patchCreate;
    private patchEdit;
    /** Load the roster. An empty roster is a valid deployment, not a failure. */
    load(): Promise<void>;
    /** Open the create/copy dialog over one subagent. */
    beginCreate(from: string): void;
    /** Close the create dialog, discarding whatever was typed. */
    cancelCreate(): void;
    /** Name the subagent the create makes. */
    setCreateId(id: string): void;
    /** Submit the create, re-read the roster, then open the new subagent's files. */
    confirmCreate(): Promise<void>;
    /** Open one subagent's directory on the host desktop, or reveal its path. */
    openLocation(id: string): Promise<void>;
    /**
     * Toggle one subagent's enabled switch on the row.
     *
     * The toggle is now an enabled-only metadata write through `update` (the
     * wire-level `toggle` method was removed): the host routes it to the
     * enabled-only path that leaves the row's other metadata intact, writing a
     * shipped subagent's override rather than its install.
     */
    toggle(id: string, enabled: boolean): Promise<void>;
    /** Open the read-only viewer over one subagent's composition. */
    beginView(id: string): Promise<void>;
    /** Close the read-only viewer. */
    closeView(): void;
    /** Open the edit dialog over one locally authored subagent. */
    beginEdit(id: string): Promise<void>;
    /** Close the edit dialog, discarding whatever was typed. */
    cancelEdit(): void;
    /**
     * Stage one edit field.
     *
     * Scopes: `name`, `description`, and `persona` take `value`; `inheritParent`
     * takes the checkbox's boolean; `tools:<row id>` takes `disabled` (the
     * checkbox checked state inverts it); `catalog:<package name>` takes
     * `install`/`remove` to stage installing or removing an available-tools
     * package.
     */
    setEditField(scope: string, field: string, value: string | boolean): void;
    /** Save the edit dialog's staged fields, then re-read the roster. */
    confirmEdit(): Promise<void>;
    /** Ask for confirmation before deleting one subagent. */
    confirmDelete(id: string | null): void;
    /** Delete the subagent awaiting confirmation, then re-read the roster. */
    remove(): Promise<void>;
}
//# sourceMappingURL=section-store.d.ts.map