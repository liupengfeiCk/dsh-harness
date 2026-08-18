import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/**
 * Teams settings section: the independent "团队" (编制表) roster as cards, with
 * a create dialog, a row-level enable/disable switch, an edit detail over the
 * team's full role roster (body/soul/memory per role), delete, and
 * open-directory.
 *
 * This section reads the team registry — fully separate from both the
 * agent-preset roster and the subagent roster — so the rosters never mix. A
 * shipped (system) team is read-only: it cannot be toggled, edited, or deleted.
 */
import { useEffect } from 'react';
import { Button, IconEditOutline16, IconFolderOpenOutline16, IconPlusOutline16, IconTrashOutline16, Modal, Tooltip, } from '@deepseek-ai/dsh-client-ui-primitives';
import { createBlocker, detailBlocker, } from "./section-store.js";
import css from './TeamSection.module.css';
/** A one-card row rendering a team's identity, role count, and switch. */
function TeamRowView(props) {
    const { row, t, onToggle, onDetail, onDelete, onOpen, hasDocument, revealedPath } = props;
    const custom = row.trust === 'user';
    const broken = row.broken !== undefined;
    return (_jsxs("li", { className: `${css.card} ${broken ? css.cardBroken : ''}`, children: [_jsxs("div", { className: css.cardHead, children: [_jsx("span", { className: css.cardName, children: row.metadata.name ?? row.id }), _jsx("span", { className: css.badge, children: custom ? t('userTrust') : t('systemTrust') }), broken ? _jsx("span", { className: css.brokenBadge, children: t('brokenBadge') }) : null, _jsx("span", { className: css.headSpacer }), _jsx(Tooltip, { label: row.metadata.enabled !== false ? t('enabled') : t('disabled'), side: "top", children: _jsx("input", { type: "checkbox", className: css.toggle, checked: row.metadata.enabled !== false, disabled: broken, onChange: e => onToggle(row.id, e.target.checked) }) })] }), _jsx("p", { className: css.cardDesc, children: row.metadata.description ?? t('noDescription') }), _jsx("div", { className: css.cardId, children: _jsxs("span", { className: css.roleCount, children: [row.roleCount, " ", t('roleCount')] }) }), _jsxs("div", { className: css.cardFoot, children: [_jsx(Tooltip, { label: t('detailTitle'), side: "top", children: _jsx("button", { type: "button", className: css.iconButton, disabled: !custom, onClick: () => onDetail(row.id), children: _jsx(IconEditOutline16, {}) }) }), _jsx(Tooltip, { label: t('delete'), side: "top", children: _jsx("button", { type: "button", className: `${css.iconButton} ${css.iconDanger}`, disabled: !custom, onClick: () => onDelete(row.id), children: _jsx(IconTrashOutline16, {}) }) }), _jsx(Tooltip, { label: hasDocument ? t('openLocation') : t('showLocation'), side: "top", children: _jsx("button", { type: "button", className: css.iconButton, onClick: () => onOpen(row.id), children: _jsx(IconFolderOpenOutline16, {}) }) })] }), revealedPath !== undefined
                ? _jsxs("p", { className: css.revealedPath, children: [_jsx("span", { className: css.revealedPathLabel, children: t('revealedPathLabel') }), " ", _jsx("code", { children: revealedPath })] })
                : null] }));
}
/** A single editable role row, shared by the create and detail dialogs. */
function RoleEditorRow(props) {
    const { role, index, bodies, t, onField, onRemove, removable } = props;
    return (_jsxs("div", { className: css.roleRow, children: [_jsxs("div", { className: css.roleGrid, children: [_jsxs("div", { className: css.field, children: [_jsx("span", { className: css.fieldLabel, children: t('roleIdLabel') }), _jsx("input", { className: css.input, value: role.id, placeholder: t('roleIdPlaceholder'), onChange: e => onField(index, 'id', e.target.value) })] }), _jsxs("div", { className: css.field, children: [_jsx("span", { className: css.fieldLabel, children: t('roleDescriptionLabel') }), _jsx("input", { className: css.input, value: role.description, placeholder: t('roleDescriptionPlaceholder'), onChange: e => onField(index, 'description', e.target.value) })] }), _jsxs("div", { className: css.field, children: [_jsx("span", { className: css.fieldLabel, children: t('roleBodyLabel') }), _jsxs("select", { className: `${css.input} ${css.select}`, value: role.body, onChange: e => onField(index, 'body', e.target.value), children: [_jsx("option", { value: "", disabled: true, children: bodies.length === 0 ? t('noBodies') : t('roleBodyPlaceholder') }), bodies.map(body => _jsx("option", { value: body, children: body }, body))] })] }), _jsxs("div", { className: css.field, children: [_jsx("span", { className: css.fieldLabel, children: t('roleMemoryLabel') }), _jsxs("select", { className: `${css.input} ${css.select}`, value: role.memory, onChange: e => onField(index, 'memory', e.target.value), children: [_jsx("option", { value: "one-shot", children: t('memoryOneShot') }), _jsx("option", { value: "persistent", children: t('memoryPersistent') })] })] })] }), _jsxs("div", { className: css.field, children: [_jsx("span", { className: css.fieldLabel, children: t('rolePromptLabel') }), _jsx("textarea", { className: `${css.input} ${css.textarea}`, value: role.prompt, placeholder: t('rolePromptPlaceholder'), onChange: e => onField(index, 'prompt', e.target.value) })] }), _jsx("div", { className: css.roleRowFoot, children: removable
                    ? (_jsx("button", { type: "button", className: css.removeRole, onClick: () => onRemove(index), children: t('removeRole') }))
                    : _jsx("span", {}) })] }));
}
/** The create dialog. */
function CreateDialog(props) {
    const { state, t, setCreateId, setCreateName, setRoleField, addRole, removeRole, confirm, cancel } = props;
    const draft = state.create;
    if (draft === null)
        return null;
    const blocker = createBlocker(draft, state.rows);
    const message = draft.error ?? (blocker === undefined ? null : t(blocker));
    return (_jsx(Modal, { open: true, onClose: cancel, title: t('createTitle'), closeLabel: t('close'), description: t('createIntro'), className: css.dialog, contentClassName: css.dialogScroll, footer: (_jsxs(_Fragment, { children: [_jsx(Button, { variant: "outline", disabled: draft.saving, onClick: cancel, children: t('cancel') }), _jsx(Button, { disabled: draft.saving || blocker !== undefined, onClick: confirm, children: draft.saving ? t('creating') : t('create') })] })), children: _jsxs("div", { className: css.dialogFields, children: [_jsxs("div", { className: css.field, children: [_jsx("span", { className: css.fieldLabel, children: t('idLabel') }), _jsx("input", { className: css.input, value: draft.id, placeholder: t('idPlaceholder'), onChange: e => setCreateId(e.target.value) })] }), _jsxs("div", { className: css.field, children: [_jsx("span", { className: css.fieldLabel, children: t('nameLabel') }), _jsx("input", { className: css.input, value: draft.name, placeholder: t('namePlaceholder'), onChange: e => setCreateName(e.target.value) })] }), _jsx(RolesEditor, { roles: draft.roles, bodies: state.bodies, t: t, setRoleField: setRoleField, addRole: addRole, removeRole: removeRole }), message !== null ? _jsx("p", { className: css.error, children: message }) : null] }) }));
}
/** The edit detail over one team's full role roster. */
function DetailDialog(props) {
    const { detail, bodies, t, setDetailName, setDetailDescription, setRoleField, addRole, removeRole, confirm, cancel } = props;
    const blocker = detailBlocker(detail);
    const message = detail.error ?? (blocker === undefined ? null : t(blocker));
    return (_jsx(Modal, { open: true, onClose: cancel, title: `${t('detailTitle')}: ${detail.title}`, closeLabel: t('close'), description: t('detailIntro'), className: css.dialog, contentClassName: css.dialogScroll, footer: (_jsxs(_Fragment, { children: [_jsx(Button, { variant: "outline", disabled: detail.saving, onClick: cancel, children: t('cancel') }), _jsx(Button, { disabled: detail.saving || blocker !== undefined, onClick: confirm, children: detail.saving ? t('saving') : t('save') })] })), children: _jsxs("div", { className: css.dialogFields, children: [_jsxs("div", { className: css.field, children: [_jsx("span", { className: css.fieldLabel, children: t('nameLabel') }), _jsx("input", { className: css.input, value: detail.metadata.name ?? '', placeholder: t('namePlaceholder'), onChange: e => setDetailName(e.target.value) })] }), _jsxs("div", { className: css.field, children: [_jsx("span", { className: css.fieldLabel, children: t('descriptionLabel') }), _jsx("input", { className: css.input, value: detail.metadata.description ?? '', placeholder: t('descriptionPlaceholder'), onChange: e => setDetailDescription(e.target.value) })] }), _jsx(RolesEditor, { roles: detail.roles, bodies: bodies, t: t, setRoleField: setRoleField, addRole: addRole, removeRole: removeRole }), message !== null ? _jsx("p", { className: css.error, children: message }) : null] }) }));
}
/** The shared role roster editor used by both dialogs. */
function RolesEditor(props) {
    const { roles, bodies, t, setRoleField, addRole, removeRole } = props;
    return (_jsxs("section", { className: css.editorBlock, children: [_jsx("h4", { className: css.blockTitle, children: t('rolesLabel') }), roles.map((role, index) => (_jsx(RoleEditorRow, { role: role, index: index, bodies: bodies, t: t, onField: setRoleField, onRemove: removeRole, removable: roles.length > 1 }, index))), _jsxs("button", { type: "button", className: css.addRole, onClick: addRole, children: [_jsx(IconPlusOutline16, {}), t('addRole')] })] }));
}
/**
 * Render the Teams section content column.
 * @param props - composed slot props.
 * @returns the section, or null when the deployment composes no teams.
 */
export function TeamSection(props) {
    const { useTeamSection, t, load } = props;
    const state = useTeamSection(snapshot => snapshot);
    useEffect(() => {
        if (state.status === 'idle')
            void load();
    }, [state.status, load]);
    if (state.status === 'loading')
        return _jsx("div", { children: t('loading') });
    if (state.status === 'error')
        return _jsx("div", { style: { color: 'var(--dsw-alias-state-error-primary)' }, children: t('error') });
    if (state.status === 'unavailable')
        return _jsx("div", { children: t('unavailable') });
    if (state.status !== 'ready')
        return null;
    return (_jsxs("div", { className: css.section, children: [_jsx("h2", { className: css.title, children: t('nav') }), _jsx("p", { className: css.intro, children: t('sectionIntro') }), _jsx("ul", { className: css.cards, children: state.rows.map(row => (_jsx(TeamRowView, { row: row, t: t, onToggle: props.toggle, onDetail: props.beginDetail, onDelete: props.confirmDelete, onOpen: props.openLocation, hasDocument: state.hasDocument, revealedPath: state.revealedPaths[row.id] }, row.id))) }), _jsxs("button", { type: "button", className: css.creatorButton, disabled: !state.authorable, onClick: () => props.beginCreate(), children: [_jsx(IconPlusOutline16, {}), t('create')] }), _jsx(CreateDialog, { state: state, t: t, setCreateId: props.setCreateId, setCreateName: props.setCreateName, setRoleField: props.setCreateRoleField, addRole: props.addCreateRole, removeRole: props.removeCreateRole, confirm: () => void props.confirmCreate(), cancel: props.cancelCreate }), state.detail !== null
                ? _jsx(DetailDialog, { detail: state.detail, bodies: state.bodies, t: t, setDetailName: props.setDetailName, setDetailDescription: props.setDetailDescription, setRoleField: props.setDetailRoleField, addRole: props.addDetailRole, removeRole: props.removeDetailRole, confirm: () => void props.confirmDetail(), cancel: props.closeDetail })
                : null, _jsx(Modal, { open: state.pendingDelete !== null, onClose: () => props.confirmDelete(null), title: t('deleteTitle'), closeLabel: t('close'), description: t('deleteDescription'), className: css.deleteDialog, footer: (_jsxs(_Fragment, { children: [_jsx(Button, { variant: "outline", disabled: state.deleting, onClick: () => props.confirmDelete(null), children: t('cancel') }), _jsx(Button, { className: css.deleteConfirm, disabled: state.deleting, onClick: () => void props.remove(), children: state.deleting ? t('deleting') : t('deleteConfirm') })] })), children: t('deleteDescription') })] }));
}
//# sourceMappingURL=TeamSection.js.map