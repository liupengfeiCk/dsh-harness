import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/**
 * Subagents settings section: the independent "子代理" roster as cards, with
 * a create/copy dialog, a row-level enable/disable switch, an edit dialog over
 * the metadata fields, delete, and open-directory.
 *
 * This section reads the subagent registry — fully separate from the
 * agent-preset section — so the two rosters never mix. A shipped (system)
 * subagent is read-only: it cannot be toggled, edited, or deleted.
 */
import { useEffect } from 'react';
import { Button, IconBrowseOutline16, IconEditOutline16, IconFolderOpenOutline16, IconPlusOutline16, IconTrashOutline16, Modal, Tooltip, } from '@deepseek-ai/dsh-client-ui-primitives';
import { createBlocker, INHERIT_MODEL_VALUE, modelOptionValue, } from "./section-store.js";
import css from './SubagentPresetSection.module.css';
/** A one-card row rendering a subagent's identity, mode, Auto Run, and switch. */
function SubagentRowView(props) {
    const { row, t, onToggle, onView, onEdit, onDelete, onOpen, hasDocument, revealedPath } = props;
    const custom = row.trust === 'user';
    const broken = row.broken !== undefined;
    return (_jsxs("li", { className: `${css.card} ${broken ? css.cardBroken : ''}`, children: [_jsxs("div", { className: css.cardHead, children: [_jsx("span", { className: css.cardName, children: row.id }), _jsx("span", { className: css.badge, children: custom ? t('userTrust') : t('systemTrust') }), broken ? _jsx("span", { className: css.brokenBadge, children: t('brokenBadge') }) : null, _jsx("span", { className: css.headSpacer }), _jsx(Tooltip, { label: row.metadata.enabled !== false ? t('enabled') : t('disabled'), side: "top", children: _jsx("input", { type: "checkbox", className: css.toggle, checked: row.metadata.enabled !== false, disabled: broken, onChange: e => onToggle(row.id, e.target.checked) }) })] }), _jsx("p", { className: css.cardDesc, children: row.metadata.description ?? t('noDescription') }), _jsx("div", { className: css.cardId, children: row.id }), _jsxs("div", { className: css.cardFoot, children: [_jsx(Tooltip, { label: t('view'), side: "top", children: _jsx("button", { type: "button", className: css.iconButton, onClick: () => onView(row.id), children: _jsx(IconBrowseOutline16, {}) }) }), _jsx(Tooltip, { label: t('edit'), side: "top", children: _jsx("button", { type: "button", className: css.iconButton, disabled: !custom, onClick: () => onEdit(row.id), children: _jsx(IconEditOutline16, {}) }) }), _jsx(Tooltip, { label: t('delete'), side: "top", children: _jsx("button", { type: "button", className: `${css.iconButton} ${css.iconDanger}`, disabled: !custom, onClick: () => onDelete(row.id), children: _jsx(IconTrashOutline16, {}) }) }), _jsx(Tooltip, { label: hasDocument ? t('openLocation') : t('showLocation'), side: "top", children: _jsx("button", { type: "button", className: css.iconButton, onClick: () => onOpen(row.id), children: _jsx(IconFolderOpenOutline16, {}) }) })] }), revealedPath !== undefined
                ? _jsxs("p", { className: css.revealedPath, children: [_jsx("span", { className: css.revealedPathLabel, children: t('revealedPathLabel') }), " ", _jsx("code", { children: revealedPath })] })
                : null] }));
}
/** The create/copy dialog. */
function CreateDialog(props) {
    const { state, t, setCreateId, confirm, cancel } = props;
    const draft = state.create;
    if (draft === null)
        return null;
    const blocker = createBlocker(draft, state.rows);
    const message = draft.error ?? (blocker === undefined ? null : t(blocker));
    return (_jsx(Modal, { open: true, onClose: cancel, title: t('createTitle'), closeLabel: t('close'), description: t('createIntro'), className: css.dialog, footer: (_jsxs(_Fragment, { children: [_jsx(Button, { variant: "outline", disabled: draft.saving, onClick: cancel, children: t('cancel') }), _jsx(Button, { disabled: draft.saving || blocker !== undefined, onClick: confirm, children: draft.saving ? t('creating') : t('create') })] })), children: _jsxs("div", { className: css.dialogFields, children: [_jsx("div", { className: css.field, children: _jsxs("span", { className: css.fieldLabel, children: [t('copyOf'), ": ", draft.fromTitle] }) }), _jsxs("div", { className: css.field, children: [_jsx("span", { className: css.fieldLabel, children: t('idLabel') }), _jsx("input", { className: css.input, value: draft.id, placeholder: t('idPlaceholder'), onChange: e => setCreateId(e.target.value) })] }), message !== null ? _jsx("p", { className: css.error, children: message }) : null] }) }));
}
/** The read-only composition viewer. */
function ViewDialog(props) {
    const { view, t, close } = props;
    return (_jsx(Modal, { open: true, onClose: close, title: `${t('viewTitle')}: ${view.title}`, closeLabel: t('close'), description: t('viewIntro'), className: css.dialog, contentClassName: css.dialogScroll, footer: (_jsx(Button, { variant: "outline", onClick: close, children: t('close') })), children: _jsx("pre", { className: css.viewer, children: view.content }) }));
}
/** The metadata edit dialog. */
function EditDialog(props) {
    const { edit, t, setEditField, confirm, cancel } = props;
    return (_jsx(Modal, { open: true, onClose: cancel, title: `${t('editTitle')}: ${edit.title}`, closeLabel: t('close'), description: t('editIntro'), className: css.dialog, contentClassName: css.dialogScroll, footer: (_jsxs(_Fragment, { children: [_jsx(Button, { variant: "outline", disabled: edit.saving, onClick: cancel, children: t('cancel') }), _jsx(Button, { disabled: edit.saving, onClick: confirm, children: edit.saving ? t('saving') : t('save') })] })), children: _jsxs("div", { className: css.dialogFields, children: [_jsxs("div", { className: css.field, children: [_jsx("span", { className: css.fieldLabel, children: t('descriptionLabel') }), _jsx("input", { className: css.input, value: edit.metadata.description, placeholder: t('descriptionPlaceholder'), onChange: e => setEditField('description', 'value', e.target.value) })] }), _jsxs("div", { className: css.field, children: [_jsx("span", { className: css.fieldLabel, children: t('personaLabel') }), _jsx("textarea", { className: `${css.input} ${css.textarea}`, value: edit.persona ?? '', placeholder: t('personaPlaceholder'), onChange: e => setEditField('persona', 'value', e.target.value) })] }), _jsxs("div", { className: css.field, children: [_jsx("span", { className: css.fieldLabel, children: t('model') }), _jsxs("select", { className: `${css.input} ${css.select}`, value: edit.metadata.model === undefined
                                ? INHERIT_MODEL_VALUE
                                : modelOptionValue(edit.metadata.model), onChange: e => setEditField('model', 'value', e.target.value), children: [_jsx("option", { value: INHERIT_MODEL_VALUE, children: t('inheritModel') }), edit.modelChoices.map(group => (_jsx("optgroup", { label: group.providerName, children: group.models.map(model => (_jsx("option", { value: modelOptionValue({ provider: group.provider, model: model.id }), children: model.name }, `${group.provider}\u0000${model.id}`))) }, group.provider)))] })] }), _jsxs("div", { className: css.field, children: [_jsxs("label", { className: css.inheritRow, children: [_jsx("input", { type: "checkbox", role: "switch", className: css.toggle, checked: edit.metadata.inheritParent, onChange: e => setEditField('inheritParent', 'value', e.target.checked) }), _jsx("span", { className: css.inheritLabel, children: t('inheritParentLabel') })] }), _jsx("span", { className: css.fieldHint, children: t('inheritParentHint') })] }), edit.catalog.length === 0
                    ? null
                    : (_jsxs("section", { className: css.editorBlock, children: [_jsx("h4", { className: css.blockTitle, children: t('toolsTitle') }), edit.catalog.map(entry => (_jsx(ToolRowView, { entry: entry, edit: edit, t: t, setEditField: setEditField }, entry.name)))] })), edit.error !== null ? _jsx("p", { className: css.error, children: edit.error }) : null] }) }));
}
/** A collapsible detail disclosure rendered as an info marker after a row. */
function ToolInfo({ title, children }) {
    return (_jsxs("details", { className: css.toolInfo, children: [_jsx("summary", { className: css.toolInfoSummary, "aria-label": `${title}: 详情`, title: title, children: "!" }), _jsx("div", { className: css.toolInfoBody, children: children })] }));
}
/** One available-tool catalog row: one switch + id + state + info marker. */
function ToolRowView({ entry, edit, t, setEditField, }) {
    const scope = `catalog:${entry.name}`;
    if (entry.installed) {
        // A row disabled by a loader expression is not the form's to write; its
        // toggle reads disabled, so the remove control is disabled too.
        const tool = edit.tools.find(candidate => candidate.name === entry.name);
        const toggleable = tool?.disabled !== 'expr';
        return (_jsxs("div", { className: css.toolRow, children: [_jsx("input", { type: "checkbox", role: "switch", "aria-label": entry.name, className: css.toggle, checked: edit.removeTools.has(entry.name) === false, disabled: !toggleable, onChange: (event) => { setEditField(scope, 'remove', !event.target.checked); } }), _jsx("span", { className: css.toolId, children: entry.name }), _jsx("span", { className: css.toolState, children: t('toolInstalled') }), !toggleable ? _jsx("span", { className: css.toolExpr, children: t('toolExprDisabled') }) : null, entry.description === undefined
                    ? _jsx("span", { className: css.toolInfoSpacer })
                    : (_jsx(ToolInfo, { title: entry.name, children: _jsx("span", { className: css.toolDesc, children: entry.description }) }))] }));
    }
    // Not yet installed: a checkbox the user ticks to install on save.
    return (_jsxs("div", { className: css.toolRow, children: [_jsx("input", { type: "checkbox", role: "switch", "aria-label": entry.name, className: css.toggle, checked: edit.installTools.has(entry.name), onChange: (event) => { setEditField(scope, 'install', event.target.checked); } }), _jsx("span", { className: css.toolId, children: entry.name }), _jsx("span", { className: css.toolState, children: t('toolUninstalled') }), entry.description === undefined
                ? _jsx("span", { className: css.toolInfoSpacer })
                : (_jsx(ToolInfo, { title: entry.name, children: _jsx("span", { className: css.toolDesc, children: entry.description }) }))] }));
}
/**
 * Render the Subagents section content column.
 * @param props - composed slot props.
 * @returns the section, or null when the deployment composes no subagents.
 */
export function SubagentPresetSection(props) {
    const { useSubagentSection, t, load } = props;
    const state = useSubagentSection(snapshot => snapshot);
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
    const factory = state.rows.find(row => row.trust === 'system');
    return (_jsxs("div", { className: css.section, children: [_jsx("h2", { className: css.title, children: t('nav') }), _jsx("p", { className: css.intro, children: t('sectionIntro') }), _jsx("ul", { className: css.cards, children: state.rows.map(row => (_jsx(SubagentRowView, { row: row, t: t, onToggle: props.toggle, onView: props.beginView, onEdit: props.beginEdit, onDelete: props.confirmDelete, onOpen: props.openLocation, hasDocument: state.hasDocument, revealedPath: state.revealedPaths[row.id] }, row.id))) }), _jsxs("button", { type: "button", className: css.creatorButton, disabled: !state.authorable || factory === undefined, onClick: () => factory !== undefined && props.beginCreate(factory.id), children: [_jsx(IconPlusOutline16, {}), t('create')] }), _jsx(CreateDialog, { state: state, t: t, setCreateId: props.setCreateId, confirm: () => void props.confirmCreate(), cancel: props.cancelCreate }), state.view !== null
                ? _jsx(ViewDialog, { view: state.view, t: t, close: props.closeView })
                : null, state.edit !== null
                ? _jsx(EditDialog, { edit: state.edit, t: t, setEditField: props.setEditField, confirm: () => void props.confirmEdit(), cancel: props.cancelEdit })
                : null, _jsx(Modal, { open: state.pendingDelete !== null, onClose: () => props.confirmDelete(null), title: t('deleteTitle'), closeLabel: t('close'), description: t('deleteDescription'), className: css.deleteDialog, footer: (_jsxs(_Fragment, { children: [_jsx(Button, { variant: "outline", disabled: state.deleting, onClick: () => props.confirmDelete(null), children: t('cancel') }), _jsx(Button, { className: css.deleteConfirm, disabled: state.deleting, onClick: () => void props.remove(), children: state.deleting ? t('deleting') : t('deleteConfirm') })] })), children: t('deleteDescription') })] }));
}
//# sourceMappingURL=SubagentPresetSection.js.map