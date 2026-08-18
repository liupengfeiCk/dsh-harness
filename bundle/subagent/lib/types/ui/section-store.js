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
import { createSnapshotStore } from '@deepseek-ai/dsh-client-runtime/client';
/** Ids a subagent directory may be named, mirroring the host's own rule. */
const SUBAGENT_ID = /^[a-z0-9][a-z0-9-]*$/;
const INITIAL = {
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
};
/** The failure message of a rejected wire call. */
function messageOf(error) {
    return error instanceof Error ? error.message : String(error);
}
/** Why this create cannot be submitted yet, as a locale key, or undefined. */
export function createBlocker(draft, rows) {
    if (draft.id === '')
        return 'idRequired';
    if (!SUBAGENT_ID.test(draft.id))
        return 'idInvalid';
    if (rows.some(row => row.id === draft.id))
        return 'idTaken';
    return undefined;
}
/**
 * Map the host's model-catalog groups to the edit dialog's grouped choices,
 * clipping each model to the id/name pair the picker renders. This drops the
 * catalog's per-model reasoning metadata, which the subagent override does not
 * carry yet.
 * @param groups - the `llm.models` provider groups.
 * @returns the grouped choices, provider-preferred order preserved.
 */
function modelChoicesFrom(groups) {
    return groups.map(group => ({
        provider: group.id,
        providerName: group.name,
        models: group.models.map(model => ({ id: model.id, name: model.name })),
    }));
}
/** The optgroup-encoded option value for one provider/model pick. */
export function modelOptionValue(pick) {
    return `${pick.provider}\u0000${pick.model}`;
}
/** Decode an optgroup-encoded option value back to provider/model. */
function modelOptionDecode(value) {
    if (value === '')
        return undefined;
    const separator = value.indexOf('\u0000');
    if (separator === -1)
        return undefined;
    const provider = value.slice(0, separator);
    const model = value.slice(separator + 1);
    return provider === '' || model === '' ? undefined : { provider, model };
}
/** The empty option value that restores "inherit the parent's model". */
export const INHERIT_MODEL_VALUE = '';
/** Reads the roster and drives the create, edit, toggle, delete, and location reveals. */
export class SubagentSectionController {
    api;
    rosterChanged;
    /** Page snapshot the renderer subscribes to. */
    store = createSnapshotStore(INITIAL);
    constructor(api, 
    /** Called after this page changes the roster, so sibling surfaces re-read. */
    rosterChanged = () => { }) {
        this.api = api;
        this.rosterChanged = rosterChanged;
    }
    set(patch) {
        this.store.set({ ...this.store.getSnapshot(), ...patch });
    }
    patchCreate(patch) {
        const { create } = this.store.getSnapshot();
        if (create === null)
            return;
        this.set({ create: { ...create, ...patch } });
    }
    patchEdit(patch) {
        const { edit } = this.store.getSnapshot();
        if (edit === null)
            return;
        this.set({ edit: { ...edit, ...patch } });
    }
    /** Load the roster. An empty roster is a valid deployment, not a failure. */
    async load() {
        const before = this.store.getSnapshot();
        if (before.status === 'loading')
            return;
        this.set({ status: 'loading', error: null });
        let value;
        try {
            const result = await this.api.subagentPresets.list({});
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
        const { subagents, authorable, hasDocument } = value;
        if (subagents.length === 0) {
            this.set({ status: 'unavailable', rows: [], authorable, hasDocument, create: null, edit: null });
            return;
        }
        const revealed = this.store.getSnapshot().revealedPaths;
        const kept = Object.fromEntries(Object.entries(revealed).filter(([id]) => subagents.some(subagent => subagent.id === id)));
        this.set({
            status: 'ready',
            error: null,
            authorable,
            hasDocument,
            rows: subagents.map(subagent => ({ ...subagent })),
            revealedPaths: kept,
        });
    }
    /** Open the create/copy dialog over one subagent. */
    beginCreate(from) {
        const row = this.store.getSnapshot().rows.find(candidate => candidate.id === from);
        this.set({
            error: null,
            create: { from, fromTitle: row?.id ?? from, id: '', saving: false, error: null },
        });
    }
    /** Close the create dialog, discarding whatever was typed. */
    cancelCreate() {
        this.set({ create: null });
    }
    /** Name the subagent the create makes. */
    setCreateId(id) {
        this.patchCreate({ id, error: null });
    }
    /** Submit the create, re-read the roster, then open the new subagent's files. */
    async confirmCreate() {
        const draft = this.store.getSnapshot().create;
        if (draft === null || draft.saving)
            return;
        if (createBlocker(draft, this.store.getSnapshot().rows) !== undefined)
            return;
        this.patchCreate({ saving: true, error: null });
        try {
            const result = await this.api.subagentPresets.create({
                from: draft.from,
                subagent: draft.id,
            });
            if (!result.ok) {
                this.patchCreate({ saving: false, error: result.error.message });
                return;
            }
            this.set({ create: null });
            await this.load();
            this.rosterChanged();
            await this.openLocation(draft.id);
        }
        catch (error) {
            this.patchCreate({ saving: false, error: messageOf(error) });
        }
    }
    /** Open one subagent's directory on the host desktop, or reveal its path. */
    async openLocation(id) {
        try {
            const result = await this.api.subagentPresets.openDocument({ subagent: id });
            if (!result.ok) {
                this.set({ error: result.error.message });
                return;
            }
            if (result.value.opened)
                return;
            const { path } = result.value;
            this.set({ revealedPaths: { ...this.store.getSnapshot().revealedPaths, [id]: path } });
        }
        catch (error) {
            this.set({ error: messageOf(error) });
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
    async toggle(id, enabled) {
        try {
            const result = await this.api.subagentPresets.update({
                subagent: id,
                metadata: { enabled },
            });
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
    /** Open the read-only viewer over one subagent's composition. */
    async beginView(id) {
        const row = this.store.getSnapshot().rows.find(candidate => candidate.id === id);
        this.set({ error: null, view: null });
        try {
            const result = await this.api.subagentPresets.read({ subagent: id });
            if (!result.ok) {
                this.set({ error: result.error.message });
                return;
            }
            this.set({
                view: { id, title: row?.id ?? id, content: result.value.content },
            });
        }
        catch (error) {
            this.set({ error: messageOf(error) });
        }
    }
    /** Close the read-only viewer. */
    closeView() {
        this.set({ view: null });
    }
    /** Open the edit dialog over one locally authored subagent. */
    async beginEdit(id) {
        const row = this.store.getSnapshot().rows.find(candidate => candidate.id === id);
        this.set({ error: null, edit: null });
        try {
            const [editableResult, modelsResponse] = await Promise.all([
                this.api.subagentPresets.readEditable({ subagent: id }),
                this.api.llm.models({}),
            ]);
            if (!editableResult.ok) {
                this.set({ error: editableResult.error.message });
                return;
            }
            const value = editableResult.value;
            // The model picker is fed from the live catalog so the options a subagent
            // may choose never drift from what the deployment actually serves. A
            // catalog failure leaves the "inherit the parent" entry alone; the edit
            // dialog stays usable, it just offers no concrete models.
            const groups = modelsResponse.result.ok
                ? modelChoicesFrom(modelsResponse.result.value.groups)
                : [];
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
                    modelChoices: groups,
                    installTools: new Set(),
                    removeTools: new Set(),
                    saving: false,
                    error: null,
                },
            });
        }
        catch (error) {
            this.set({ error: messageOf(error) });
        }
    }
    /** Close the edit dialog, discarding whatever was typed. */
    cancelEdit() {
        this.set({ edit: null });
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
    setEditField(scope, field, value) {
        const { edit } = this.store.getSnapshot();
        if (edit === null)
            return;
        if (scope === 'persona') {
            this.patchEdit({ persona: String(value), error: null });
            return;
        }
        if (scope === 'description') {
            // The description is always a string; an empty one is a staged clear.
            this.patchEdit({
                metadata: { ...edit.metadata, description: String(value) },
                error: null,
            });
            return;
        }
        if (scope === 'inheritParent') {
            this.patchEdit({
                metadata: { ...edit.metadata, inheritParent: value === true },
                error: null,
            });
            return;
        }
        if (scope === 'model') {
            // An empty pick reverts to the parent's default: it stages `undefined`
            // so save clears the stored model rather than leaving it alone. A
            // concrete pick decodes the optgroup-encoded value back to provider/model.
            const decoded = modelOptionDecode(String(value));
            this.patchEdit({
                metadata: { ...edit.metadata, ...decoded === undefined ? {} : { model: decoded } },
                error: null,
            });
            return;
        }
        if (scope.startsWith('tools:')) {
            const id = scope.slice('tools:'.length);
            this.patchEdit({
                tools: edit.tools.map(tool => tool.id === id ? { ...tool, disabled: value !== true } : tool),
                error: null,
            });
            return;
        }
        if (scope.startsWith('catalog:')) {
            // The available-tools directory: checking a not-yet-installed package
            // stages it for install; unchecking an installed one stages removal.
            const name = scope.slice('catalog:'.length);
            const nextInstall = new Set(edit.installTools);
            const nextRemove = new Set(edit.removeTools);
            if (field === 'install') {
                if (value === true)
                    nextInstall.add(name);
                else
                    nextInstall.delete(name);
                // A package is either being installed or removed, never both.
                nextRemove.delete(name);
            }
            else if (field === 'remove') {
                if (value === true)
                    nextRemove.add(name);
                else
                    nextRemove.delete(name);
                nextInstall.delete(name);
            }
            this.patchEdit({ installTools: nextInstall, removeTools: nextRemove, error: null });
        }
    }
    /** Save the edit dialog's staged fields, then re-read the roster. */
    async confirmEdit() {
        const { edit } = this.store.getSnapshot();
        if (edit === null || edit.saving)
            return;
        this.patchEdit({ saving: true, error: null });
        try {
            // A row disabled by a `!!js` expression is not the form's to write; every
            // literal row is submitted wholesale so the host rewrites only what the
            // form staged.
            const tools = Object.fromEntries(edit.tools
                .filter(tool => tool.disabled !== 'expr')
                .map(tool => [tool.id, { disabled: tool.disabled === true }]));
            const installTools = [...edit.installTools]
                .filter(name => !edit.catalog.some(entry => entry.name === name && entry.installed));
            const removeRowIds = [...edit.removeTools]
                .map(name => edit.tools.find(tool => tool.name === name)?.id)
                .filter((id) => id !== undefined);
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
            };
            const result = await this.api.subagentPresets.update({
                subagent: edit.id,
                ...edit.persona === undefined ? {} : { persona: { text: edit.persona } },
                ...Object.keys(tools).length === 0 ? {} : { tools },
                ...installTools.length === 0 ? {} : { installTools },
                ...removeRowIds.length === 0 ? {} : { removeTools: removeRowIds },
                metadata,
            });
            if (!result.ok) {
                this.patchEdit({ saving: false, error: result.error.message });
                return;
            }
            this.set({ edit: null });
            await this.load();
            this.rosterChanged();
        }
        catch (error) {
            this.patchEdit({ saving: false, error: messageOf(error) });
        }
    }
    /** Ask for confirmation before deleting one subagent. */
    confirmDelete(id) {
        if (this.store.getSnapshot().deleting)
            return;
        this.set({ pendingDelete: id });
    }
    /** Delete the subagent awaiting confirmation, then re-read the roster. */
    async remove() {
        const { pendingDelete, deleting } = this.store.getSnapshot();
        if (pendingDelete === null || deleting)
            return;
        this.set({ deleting: true, error: null });
        try {
            const result = await this.api.subagentPresets.remove({ subagent: pendingDelete });
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
/**
 * Map one wire tool row to its staged draft.
 * @param row - the tool row the host returned.
 * @returns the draft a form toggles.
 */
function toolToDraft(row) {
    return {
        id: row.id,
        name: row.name,
        disabled: row.disabled,
        ...row.description === undefined ? {} : { description: row.description },
    };
}
/**
 * Map one wire catalog entry to its staged draft.
 * @param row - the catalog entry the host returned.
 * @returns the draft a form offers for adding/removing.
 */
function catalogToDraft(row) {
    return {
        name: row.name,
        toolNames: row.toolNames,
        ...row.description === undefined ? {} : { description: row.description },
        installed: row.installed,
    };
}
//# sourceMappingURL=section-store.js.map