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
import { createSnapshotStore } from '@deepseek-ai/dsh-client-runtime/client';
/** Ids a team directory may be named, mirroring the host's own rule. */
const TEAM_ID = /^[a-z0-9][a-z0-9-]*$/;
const INITIAL = {
    status: 'idle',
    error: null,
    authorable: false,
    hasDocument: false,
    bodies: [],
    rows: [],
    create: null,
    detail: null,
    pendingDelete: null,
    deleting: false,
    revealedPaths: {},
};
/** A fresh empty role row. */
function emptyRole() {
    return { id: '', description: '', prompt: '', body: '', memory: 'one-shot' };
}
/** The failure message of a rejected wire call. */
function messageOf(error) {
    return error instanceof Error ? error.message : String(error);
}
/** Why this create cannot be submitted yet, as a locale key, or undefined. */
export function createBlocker(draft, rows) {
    if (draft.id === '')
        return 'idRequired';
    if (!TEAM_ID.test(draft.id))
        return 'idInvalid';
    if (rows.some(row => row.id === draft.id))
        return 'idTaken';
    return roleBlocker(draft.roles);
}
/** Why an edit detail cannot be saved yet, as a locale key, or undefined. */
export function detailBlocker(draft) {
    return roleBlocker(draft.roles);
}
/** Why the role roster cannot be submitted, as a locale key, or undefined. */
export function roleBlocker(roles) {
    if (roles.length === 0)
        return 'roleIdRequired';
    for (const role of roles) {
        if (role.id === '')
            return 'roleIdRequired';
        if (role.body === '')
            return 'roleBodyRequired';
    }
    return undefined;
}
/**
 * Read the roster and drive the create, edit detail, toggle, delete, and
 * location reveals.
 */
export class TeamSectionController {
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
    patchDetail(patch) {
        const { detail } = this.store.getSnapshot();
        if (detail === null)
            return;
        this.set({ detail: { ...detail, ...patch } });
    }
    /** Load the roster. An empty roster is a valid deployment, not a failure. */
    async load() {
        const before = this.store.getSnapshot();
        if (before.status === 'loading')
            return;
        this.set({ status: 'loading', error: null });
        let value;
        try {
            const result = await this.api.teamPresets.list({});
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
        const { teams, authorable, hasDocument, bodies } = value;
        if (teams.length === 0) {
            this.set({
                status: 'unavailable', rows: [], authorable, hasDocument, bodies,
                create: null, detail: null,
            });
            return;
        }
        const revealed = this.store.getSnapshot().revealedPaths;
        const kept = Object.fromEntries(Object.entries(revealed).filter(([id]) => teams.some(team => team.id === id)));
        this.set({
            status: 'ready',
            error: null,
            authorable,
            hasDocument,
            bodies,
            rows: teams.map(team => ({
                id: team.id,
                trust: team.trust,
                metadata: team.metadata,
                roleCount: team.roles.length,
                ...team.broken === undefined ? {} : { broken: team.broken },
            })),
            revealedPaths: kept,
        });
    }
    /** Open the create dialog with one fresh empty role. */
    beginCreate() {
        this.set({
            error: null,
            create: { id: '', name: '', roles: [emptyRole()], saving: false, error: null },
        });
    }
    /** Close the create dialog, discarding whatever was typed. */
    cancelCreate() {
        this.set({ create: null });
    }
    /** Name the team the create makes. */
    setCreateId(id) {
        this.patchCreate({ id, error: null });
    }
    /** Set the create dialog's display name. */
    setCreateName(name) {
        this.patchCreate({ name, error: null });
    }
    /** Stage one field of one create role row. */
    setCreateRoleField(index, field, value) {
        const { create } = this.store.getSnapshot();
        if (create === null)
            return;
        this.patchCreate({
            roles: create.roles.map((role, i) => i === index ? patchRole(role, field, value) : role),
            error: null,
        });
    }
    /** Add an empty role row to the create dialog. */
    addCreateRole() {
        const { create } = this.store.getSnapshot();
        if (create === null)
            return;
        this.patchCreate({ roles: [...create.roles, emptyRole()], error: null });
    }
    /** Remove one role row from the create dialog. */
    removeCreateRole(index) {
        const { create } = this.store.getSnapshot();
        if (create === null)
            return;
        this.patchCreate({ roles: create.roles.filter((_, i) => i !== index), error: null });
    }
    /** Submit the create, then re-read the roster. */
    async confirmCreate() {
        const draft = this.store.getSnapshot().create;
        if (draft === null || draft.saving)
            return;
        if (createBlocker(draft, this.store.getSnapshot().rows) !== undefined)
            return;
        this.patchCreate({ saving: true, error: null });
        try {
            const result = await this.api.teamPresets.create({
                id: draft.id,
                ...draft.name === '' ? {} : { name: draft.name },
                roles: draft.roles.map(roleToWire),
            });
            if (!result.ok) {
                this.patchCreate({ saving: false, error: result.error.message });
                return;
            }
            this.set({ create: null });
            await this.load();
            this.rosterChanged();
        }
        catch (error) {
            this.patchCreate({ saving: false, error: messageOf(error) });
        }
    }
    /** Open one team's directory on the host desktop, or reveal its path. */
    async openLocation(id) {
        try {
            const result = await this.api.teamPresets.openLocation({ id });
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
     * Toggle one team's enabled switch on the row. An enabled-only metadata
     * write through `update`, mirroring the subagent surface.
     */
    async toggle(id, enabled) {
        try {
            const result = await this.api.teamPresets.update({
                id,
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
    /** Open the edit detail over one team's full role roster. */
    async beginDetail(id) {
        const row = this.store.getSnapshot().rows.find(candidate => candidate.id === id);
        this.set({ error: null, detail: null });
        try {
            const result = await this.api.teamPresets.read({ id });
            if (!result.ok) {
                this.set({ error: result.error.message });
                return;
            }
            const team = result.value.team;
            this.set({
                detail: {
                    id,
                    title: team.metadata.name ?? row?.id ?? id,
                    metadata: team.metadata,
                    roles: team.roles.map(role => ({
                        id: role.id,
                        description: role.description ?? '',
                        prompt: role.prompt ?? '',
                        body: role.body,
                        memory: role.memory,
                    })),
                    saving: false,
                    error: null,
                    roleEdit: null,
                },
            });
        }
        catch (error) {
            this.set({ error: messageOf(error) });
        }
    }
    /** Close the edit detail, discarding whatever was typed. */
    closeDetail() {
        this.set({ detail: null });
    }
    /** Set the detail dialog's display name. */
    setDetailName(name) {
        const { detail } = this.store.getSnapshot();
        if (detail === null)
            return;
        this.patchDetail({ metadata: { ...detail.metadata, name }, error: null });
    }
    /** Set the detail dialog's display description. */
    setDetailDescription(description) {
        const { detail } = this.store.getSnapshot();
        if (detail === null)
            return;
        this.patchDetail({ metadata: { ...detail.metadata, description }, error: null });
    }
    /**
     * Append a blank role to the team detail's roster and open the edit
     * dialog over it in a `'new'` draft state. The new row stays in the roster
     * through `saveRoleEdit` and is unwound on `cancelRoleEdit`.
     */
    addRoleInDetail() {
        const { detail } = this.store.getSnapshot();
        if (detail === null || detail.saving)
            return;
        const newRole = emptyRole();
        this.patchDetail({
            roles: [...detail.roles, newRole],
            roleEdit: { kind: 'new', draft: newRole, dirty: true, error: null },
            error: null,
        });
    }
    /** Open the single-role edit over one existing roster row. */
    beginRoleEdit(index) {
        const { detail } = this.store.getSnapshot();
        if (detail === null || detail.saving)
            return;
        const role = detail.roles[index];
        if (role === undefined)
            return;
        this.patchDetail({
            roleEdit: { kind: 'existing', index, draft: { ...role }, original: { ...role }, dirty: false, error: null },
            error: null,
        });
    }
    /** Remove one role row from the team detail (and any open edit on it). */
    removeRole(index) {
        const { detail } = this.store.getSnapshot();
        if (detail === null || detail.saving)
            return;
        const open = detail.roleEdit;
        const roleEdit = open !== null
            ? (open.kind === 'existing' && open.index === index
                ? null
                : (open.kind === 'new' && detail.roles.length - 1 === index ? null : open))
            : null;
        this.patchDetail({
            roles: detail.roles.filter((_, i) => i !== index),
            roleEdit,
            error: null,
        });
    }
    /** Stage one field on the open role edit draft, marking it dirty. */
    setRoleEditField(field, value) {
        const { detail } = this.store.getSnapshot();
        if (detail === null || detail.roleEdit === null)
            return;
        this.patchDetail({
            roleEdit: { ...detail.roleEdit, draft: patchRole(detail.roleEdit.draft, field, value), dirty: true, error: null },
            error: null,
        });
    }
    /**
     * Commit the open role edit: validate, then write back into the roster
     * (replacing the existing row, or trimming the trailing new row). The
     * team-level save (`confirmDetail`) is a separate step.
     */
    saveRoleEdit() {
        const { detail } = this.store.getSnapshot();
        if (detail === null || detail.roleEdit === null)
            return;
        const edit = detail.roleEdit;
        if (roleBlocker([edit.draft]) !== undefined)
            return;
        if (edit.kind === 'new') {
            // Trim the trailing role so save doesn't double-insert. The next
            // "add role" action will append a fresh row at the new tail.
            const head = detail.roles.slice(0, detail.roles.length - 1);
            this.patchDetail({
                roles: [...head, edit.draft],
                roleEdit: null,
                error: null,
            });
            return;
        }
        const index = edit.index;
        // An existing edit's index may have slipped out of range if the roster
        // was mutated while the dialog was open. Drop the draft in that case.
        if (index >= detail.roles.length) {
            this.patchDetail({ roleEdit: null });
            return;
        }
        this.patchDetail({
            roles: detail.roles.map((role, i) => i === index ? edit.draft : role),
            roleEdit: null,
            error: null,
        });
    }
    /**
     * Cancel the open role edit. For an existing row, the staged draft is
     * discarded (the roster was never touched, so rollback is a no-op). For a
     * new row, the trailing blank row that `addRoleInDetail` appended is
     * removed along with the discarded draft.
     */
    cancelRoleEdit() {
        const { detail } = this.store.getSnapshot();
        if (detail === null || detail.roleEdit === null)
            return;
        const edit = detail.roleEdit;
        if (edit.kind === 'new') {
            const next = detail.roles.slice(0, detail.roles.length - 1);
            this.patchDetail({ roles: next, roleEdit: null, error: null });
            return;
        }
        this.patchDetail({ roleEdit: null });
    }
    /** Save the edit detail's staged roster and metadata, then re-read. */
    async confirmDetail() {
        const { detail } = this.store.getSnapshot();
        if (detail === null || detail.saving)
            return;
        // A pending role edit must be resolved first; otherwise the team's save
        // would race with the draft and drop the unsaved role.
        if (detail.roleEdit !== null)
            return;
        if (detailBlocker(detail) !== undefined)
            return;
        this.patchDetail({ saving: true, error: null });
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
            });
            if (!result.ok) {
                this.patchDetail({ saving: false, error: result.error.message });
                return;
            }
            this.set({ detail: null });
            await this.load();
            this.rosterChanged();
        }
        catch (error) {
            this.patchDetail({ saving: false, error: messageOf(error) });
        }
    }
    /** Ask for confirmation before deleting one team. */
    confirmDelete(id) {
        if (this.store.getSnapshot().deleting)
            return;
        this.set({ pendingDelete: id });
    }
    /** Delete the team awaiting confirmation, then re-read the roster. */
    async remove() {
        const { pendingDelete, deleting } = this.store.getSnapshot();
        if (pendingDelete === null || deleting)
            return;
        this.set({ deleting: true, error: null });
        try {
            const result = await this.api.teamPresets.remove({ id: pendingDelete });
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
/** Patch one staged role field (id/description/prompt/body/memory). */
function patchRole(role, field, value) {
    if (field === 'id')
        return { ...role, id: value };
    if (field === 'description')
        return { ...role, description: value };
    if (field === 'prompt')
        return { ...role, prompt: value };
    if (field === 'body')
        return { ...role, body: value };
    if (field === 'memory')
        return { ...role, memory: value === 'persistent' ? 'persistent' : 'one-shot' };
    return role;
}
/** Map a staged role onto the wire's role shape. */
function roleToWire(role) {
    return {
        id: role.id,
        ...role.description === '' ? {} : { description: role.description },
        ...role.prompt === '' ? {} : { prompt: role.prompt },
        body: role.body,
        memory: role.memory,
    };
}
//# sourceMappingURL=section-store.js.map