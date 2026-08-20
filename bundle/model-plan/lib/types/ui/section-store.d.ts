/**
 * Model-plan management controller: the plan roster as a list, a create/edit
 * dialog over a staged draft (name, provider-grouped model pick, and a params
 * bag), set-default, and delete.
 *
 * The host stays the single fact source. Every mutation writes through the
 * wire and the page re-reads the roster afterwards, because a create/edit/
 * default flip changes more than the row it targeted (the default marker
 * recomputes from the host).
 *
 * The params bag is edited as an array of `{ key, value }` rows: every key can
 * be deleted, its value re-typed, its spelling edited inline, and arbitrary
 * new key=value rows appended. The three familiar keys (temperature / maxTokens
 * / reasoningEffort) are pre-seeded with friendly labels, and
 * `reasoningEffort` renders as a dropdown sourced from the selected model's
 * reasoning metadata when that model exposes any. Validation rejects an empty
 * key and a value that is not a legal JSON scalar (the wire's JSON-value
 * vocabulary: string / number / boolean / null / array / object).
 */
import { type SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client';
import type { ModelPlanWire } from './wire-client.ts';
/** The familiar params pre-seeded into the bag editor. */
export declare const KNOWN_KEYS: readonly ["temperature", "reasoningEffort", "maxTokens"];
/** One staged params-bag row: the key plus the value in typed (string) form. */
export interface ParamDraft {
    /** The param key (editable inline; any spelling). */
    key: string;
    /** The param value in typed string form, parsed to JSON on save. */
    value: string;
}
/** The create/edit dialog draft (both share one shape; create needs the id). */
export interface PlanDraft {
    /** Whether this dialog creates a new plan (vs editing an existing one). */
    creating: boolean;
    /** The plan id (the file name; required on create, read-only on edit). */
    id: string;
    /** Selected provider route id. */
    provider: string;
    /** Selected provider-owned model id. */
    model: string;
    /** The params bag as editable rows. */
    params: readonly ParamDraft[];
    /** Whether the dialog's save is in flight. */
    saving: boolean;
    /** The last save failure, cleared by the next edit. */
    error: string | null;
}
/** One plan roster row the section renders. */
export interface PlanRow {
    id: string;
    provider: string;
    model: string;
    /** Number of params in the bag (the row's summary). */
    paramCount: number;
    /** Whether this plan is the deployment default. */
    isDefault: boolean;
    /** Whether this plan could not be authored (read-only marker). */
    trust: 'system' | 'user';
    /** Why the plan is broken, absent when it is usable. */
    broken?: string;
}
/** Page snapshot. */
export interface ModelPlanSectionState {
    status: 'idle' | 'loading' | 'ready' | 'unavailable' | 'error';
    /** Whole-load failure text; a mutation failure stays on its dialog. */
    error: string | null;
    /** Whether the deployment configures a root new plans can be written to. */
    authorable: boolean;
    /** Every plan the deployment currently supplies. */
    rows: readonly PlanRow[];
    /** The open create/edit dialog, or null. */
    dialog: PlanDraft | null;
    /** The plan awaiting delete confirmation. */
    pendingDelete: string | null;
    /** Whether a delete is in flight. */
    deleting: boolean;
}
/**
 * The capability face of the currently selected model/route, as far as the
 * editor can tell. Each field is `null` when no model is selected yet (the
 * capability is undetermined and the editor stays permissive); `true`/`false`
 * once a model is selected.
 *
 * `reasoningEffort` sources from the official model directory's per-route
 * reasoning metadata (the exact field the reasoning dropdown already reads),
 * so it needs no local copy. Adapter-parameter capabilities the official
 * surface does not expose (e.g. whether a route honours `stop`) are layered in
 * here from the architecture map in `capability.ts`.
 */
export interface PlanAbility {
    /** Whether the selected model exposes reasoning efforts. */
    reasoningEffort: boolean | null;
}
/**
 * Whether a text is a legal JSON scalar per the wire's JSON-value vocabulary.
 * Any text `JSON.parse` accepts is a legal JSON value; the empty string is not.
 */
export declare function isJsonValue(text: string): boolean;
/**
 * The first block preventing this draft from saving, as a locale key, or undefined.
 * When creating, the id is checked for emptiness, then legality, then a clash
 * against the roster (a duplicate id is refused before the host does).
 */
export type PlanBlockerKey = 'idRequired' | 'idInvalid' | 'idTaken' | 'modelRequired' | 'keyRequired' | 'valueInvalid' | 'reasoningUnsupported';
export declare function planBlocker(draft: PlanDraft, creating: boolean, rows: readonly PlanRow[], ability?: PlanAbility): PlanBlockerKey | undefined;
/**
 * Read the roster and drive the create/edit dialog, set-default, and delete.
 */
export declare class ModelPlanSectionController {
    private readonly plans;
    /** Called after this page changes the roster, so sibling surfaces re-read. */
    private readonly rosterChanged;
    /** Page snapshot the renderer subscribes to. */
    readonly store: SnapshotStore<ModelPlanSectionState>;
    constructor(plans: ModelPlanWire, 
    /** Called after this page changes the roster, so sibling surfaces re-read. */
    rosterChanged?: () => void);
    private set;
    private patchDialog;
    /** Load the roster. An empty roster is a valid deployment, not a failure. */
    load(): Promise<void>;
    /** Open the create dialog with the pre-seeded params bag. */
    beginCreate(): void;
    /** Open the edit dialog over one plan's full fields. */
    beginEdit(id: string): Promise<void>;
    /** Close the create/edit dialog, discarding whatever was staged. */
    closeDialog(): void;
    /** Set the draft's id (create only). */
    setDialogId(id: string): void;
    /** Set the draft's provider route (clears the model under a different provider). */
    setDialogProvider(provider: string): void;
    /** Set the draft's model id. */
    setDialogModel(model: string): void;
    /** Set one params-bag row's key (editable inline). */
    setParamKey(index: number, key: string): void;
    /** Set one params-bag row's value (typed string form). */
    setParamValue(index: number, value: string): void;
    /** Append an empty params-bag row. */
    addParam(): void;
    /** Remove one params-bag row. */
    removeParam(index: number): void;
    /** Set the draft's `reasoningEffort` value through the dropdown. */
    setReasoningEffort(effort: string): void;
    /** Submit the create or edit (the draft's own `creating` decides), then re-read. */
    confirmSave(): Promise<void>;
    /** Submit the dialog (create or edit, decided by the draft). */
    confirmCreate(): Promise<void>;
    /** Submit the dialog (create or edit, decided by the draft). */
    confirmEdit(): Promise<void>;
    /** Set one plan as the deployment default, then re-read the roster. */
    setDefault(id: string): Promise<void>;
    /** Ask for confirmation before deleting one plan. */
    confirmDelete(id: string | null): void;
    /** Delete the plan awaiting confirmation, then re-read the roster. */
    remove(): Promise<void>;
}
//# sourceMappingURL=section-store.d.ts.map