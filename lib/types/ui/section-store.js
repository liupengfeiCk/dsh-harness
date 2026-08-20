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
import { createSnapshotStore } from '@deepseek-ai/dsh-client-runtime/client';
/** The familiar params pre-seeded into the bag editor. */
export const KNOWN_KEYS = ['temperature', 'reasoningEffort', 'maxTokens'];
/** A plan id may be named by, mirroring the host's own rule (id = file name). */
const PLAN_ID = /^[a-z0-9][a-z0-9-]*$/;
const INITIAL = {
    status: 'idle',
    error: null,
    authorable: false,
    rows: [],
    dialog: null,
    pendingDelete: null,
    deleting: false,
};
/** A fresh empty params-bag (the familiar keys pre-seeded, values blank). */
function seedParams() {
    return KNOWN_KEYS.map(key => ({ key, value: '' }));
}
/** A fresh create draft: id + the pre-seeded params bag. */
function emptyCreateDraft() {
    return { creating: true, id: '', provider: '', model: '', params: seedParams(), saving: false, error: null };
}
/** The failure message of a rejected wire call. */
function messageOf(error) {
    return error instanceof Error ? error.message : String(error);
}
/**
 * Whether a text is a legal JSON scalar per the wire's JSON-value vocabulary.
 * Any text `JSON.parse` accepts is a legal JSON value; the empty string is not.
 */
export function isJsonValue(text) {
    if (text.trim() === '')
        return false;
    try {
        JSON.parse(text);
        return true;
    }
    catch {
        return false;
    }
}
export function planBlocker(draft, creating, rows, ability = { reasoningEffort: null }) {
    if (creating) {
        if (draft.id === '')
            return 'idRequired';
        if (!PLAN_ID.test(draft.id))
            return 'idInvalid';
        if (rows.some(row => row.id === draft.id))
            return 'idTaken';
    }
    if (draft.provider === '' || draft.model === '')
        return 'modelRequired';
    for (const param of draft.params) {
        if (param.key.trim() === '')
            return 'keyRequired';
        if (!isJsonValue(param.value))
            return 'valueInvalid';
        // Capability gate: a well-known key the selected route cannot honour is a
        // real (typed) value is refused here so the user hears about it in the
        // editor instead of at request time.
        if (param.value.trim() !== '') {
            if (param.key === 'reasoningEffort' && ability.reasoningEffort === false)
                return 'reasoningUnsupported';
        }
    }
    return undefined;
}
/** Map the wire's params record onto editable draft rows. */
function paramsToDraft(params) {
    const entries = Object.entries(params);
    // Prefer the familiar-key order when any of them is present, then the rest.
    const known = KNOWN_KEYS.filter(key => entries.some(([k]) => k === key));
    const ordered = [
        ...known,
        ...entries.map(([k]) => k).filter(k => !KNOWN_KEYS.includes(k)),
    ];
    return ordered.map(key => ({ key, value: JSON.stringify(params[key]) }));
}
/**
 * Read the roster and drive the create/edit dialog, set-default, and delete.
 */
export class ModelPlanSectionController {
    plans;
    rosterChanged;
    /** Page snapshot the renderer subscribes to. */
    store = createSnapshotStore(INITIAL);
    constructor(plans, 
    /** Called after this page changes the roster, so sibling surfaces re-read. */
    rosterChanged = () => { }) {
        this.plans = plans;
        this.rosterChanged = rosterChanged;
    }
    set(patch) {
        this.store.set({ ...this.store.getSnapshot(), ...patch });
    }
    patchDialog(patch) {
        const { dialog } = this.store.getSnapshot();
        if (dialog === null)
            return;
        this.set({ dialog: { ...dialog, ...patch } });
    }
    /** Load the roster. An empty roster is a valid deployment, not a failure. */
    async load() {
        const before = this.store.getSnapshot();
        if (before.status === 'loading')
            return;
        this.set({ status: 'loading', error: null });
        let value;
        try {
            const result = await this.plans.list({});
            if (!result.ok) {
                this.set({ status: 'error', error: result.error.message });
                return;
            }
            value = result.value;
        }
        catch (error) {
            this.set({ status: 'error', error: messageOf(error) });
            return;
        }
        const { plans, authorable } = value;
        if (plans.length === 0) {
            this.set({ status: 'unavailable', rows: [], authorable, dialog: null, pendingDelete: null });
            return;
        }
        this.set({
            status: 'ready',
            error: null,
            authorable,
            rows: plans.map(planToRow),
        });
    }
    /** Open the create dialog with the pre-seeded params bag. */
    beginCreate() {
        this.set({ error: null, dialog: emptyCreateDraft() });
    }
    /** Open the edit dialog over one plan's full fields. */
    async beginEdit(id) {
        this.set({ error: null, dialog: null });
        try {
            const result = await this.plans.read({ id });
            if (!result.ok) {
                this.set({ error: result.error.message });
                return;
            }
            const plan = result.value.plan;
            this.set({
                dialog: {
                    creating: false,
                    id: plan.id,
                    provider: plan.provider,
                    model: plan.model,
                    params: paramsToDraft(plan.params),
                    saving: false,
                    error: null,
                },
            });
        }
        catch (error) {
            this.set({ error: messageOf(error) });
        }
    }
    /** Close the create/edit dialog, discarding whatever was staged. */
    closeDialog() {
        this.set({ dialog: null });
    }
    /** Set the draft's id (create only). */
    setDialogId(id) {
        this.patchDialog({ id, error: null });
    }
    /** Set the draft's provider route (clears the model under a different provider). */
    setDialogProvider(provider) {
        this.patchDialog({ provider, model: '', error: null });
    }
    /** Set the draft's model id. */
    setDialogModel(model) {
        this.patchDialog({ model, error: null });
    }
    /** Set one params-bag row's key (editable inline). */
    setParamKey(index, key) {
        const { dialog } = this.store.getSnapshot();
        if (dialog === null)
            return;
        this.patchDialog({
            params: dialog.params.map((param, i) => i === index ? { ...param, key } : param),
            error: null,
        });
    }
    /** Set one params-bag row's value (typed string form). */
    setParamValue(index, value) {
        const { dialog } = this.store.getSnapshot();
        if (dialog === null)
            return;
        this.patchDialog({
            params: dialog.params.map((param, i) => i === index ? { ...param, value } : param),
            error: null,
        });
    }
    /** Append an empty params-bag row. */
    addParam() {
        const { dialog } = this.store.getSnapshot();
        if (dialog === null)
            return;
        this.patchDialog({ params: [...dialog.params, { key: '', value: '' }], error: null });
    }
    /** Remove one params-bag row. */
    removeParam(index) {
        const { dialog } = this.store.getSnapshot();
        if (dialog === null)
            return;
        this.patchDialog({ params: dialog.params.filter((_, i) => i !== index), error: null });
    }
    /** Set the draft's `reasoningEffort` value through the dropdown. */
    setReasoningEffort(effort) {
        const { dialog } = this.store.getSnapshot();
        if (dialog === null)
            return;
        const row = dialog.params.find(param => param.key === 'reasoningEffort');
        if (row === undefined)
            return;
        this.patchDialog({
            params: dialog.params.map(param => param.key === 'reasoningEffort' ? { ...param, value: effort } : param),
            error: null,
        });
    }
    /** Submit the create or edit (the draft's own `creating` decides), then re-read. */
    async confirmSave() {
        const draft = this.store.getSnapshot().dialog;
        if (draft === null || draft.saving)
            return;
        if (planBlocker(draft, draft.creating, this.store.getSnapshot().rows) !== undefined)
            return;
        this.patchDialog({ saving: true, error: null });
        const params = paramsToWire(draft.params);
        try {
            const result = draft.creating
                ? await this.plans.create({
                    id: draft.id,
                    provider: draft.provider,
                    model: draft.model,
                    params,
                })
                : await this.plans.update({
                    id: draft.id,
                    provider: draft.provider,
                    model: draft.model,
                    params,
                });
            if (!result.ok) {
                this.patchDialog({ saving: false, error: result.error.message });
                return;
            }
            this.set({ dialog: null });
            await this.load();
            this.rosterChanged();
        }
        catch (error) {
            this.patchDialog({ saving: false, error: messageOf(error) });
        }
    }
    /** Submit the dialog (create or edit, decided by the draft). */
    confirmCreate() {
        return this.confirmSave();
    }
    /** Submit the dialog (create or edit, decided by the draft). */
    confirmEdit() {
        return this.confirmSave();
    }
    /** Set one plan as the deployment default, then re-read the roster. */
    async setDefault(id) {
        try {
            const result = await this.plans.update({ id, default: true });
            if (!result.ok) {
                this.set({ error: result.error.message });
                return;
            }
            await this.load();
            this.rosterChanged();
        }
        catch (error) {
            this.set({ error: messageOf(error) });
        }
    }
    /** Ask for confirmation before deleting one plan. */
    confirmDelete(id) {
        if (this.store.getSnapshot().deleting)
            return;
        this.set({ pendingDelete: id });
    }
    /** Delete the plan awaiting confirmation, then re-read the roster. */
    async remove() {
        const { pendingDelete, deleting } = this.store.getSnapshot();
        if (pendingDelete === null || deleting)
            return;
        this.set({ deleting: true, error: null });
        try {
            const result = await this.plans.remove({ id: pendingDelete });
            if (!result.ok) {
                this.set({ deleting: false, pendingDelete: null, error: result.error.message });
                return;
            }
            this.set({ deleting: false, pendingDelete: null });
            await this.load();
            this.rosterChanged();
        }
        catch (error) {
            this.set({ deleting: false, pendingDelete: null, error: messageOf(error) });
        }
    }
}
/** Map one wire plan onto a roster row. */
function planToRow(plan) {
    return {
        id: plan.id,
        provider: plan.provider,
        model: plan.model,
        paramCount: Object.keys(plan.params).length,
        isDefault: plan.isDefault,
        trust: plan.trust,
        ...plan.broken === undefined ? {} : { broken: plan.broken },
    };
}
/** Parse the typed draft rows back onto a JSON-value params record (validated by planBlocker). */
function paramsToWire(params) {
    const bag = {};
    for (const param of params) {
        if (param.key.trim() === '' || !isJsonValue(param.value))
            continue;
        bag[param.key] = JSON.parse(param.value);
    }
    return bag;
}
//# sourceMappingURL=section-store.js.map