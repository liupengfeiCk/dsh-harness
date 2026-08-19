import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/**
 * Model-plan settings section ("模型方案"): the independent plan roster as
 * cards, with a create/edit dialog over a staged draft (name, provider-grouped
 * model pick, and a params bag) and delete with confirmation.
 *
 * The model pick reads the session-independent host catalog (`llm.models`):
 * provider-grouped, with each exact route's reasoning metadata. `reasoningEffort`
 * renders as a dropdown sourced from the selected model's efforts when that
 * model exposes them. The params bag is an array of editable key/value rows —
 * every key can be deleted, re-valued, its spelling edited inline, and new
 * key=value rows appended. A note reminds the user that custom keys pass
 * through into the request body without implying provider support.
 *
 * A shipped (system) plan is read-only: it cannot be edited or deleted.
 */
import { useEffect } from 'react';
import { Button, IconCheckOutline16, IconEditOutline16, IconPlusOutline16, IconTrashOutline16, Modal, Tooltip, } from '@deepseek-ai/dsh-client-ui-primitives';
import { planBlocker, } from "./section-store.js";
import css from './ModelPlanSection.module.css';
/** The `reasoningEffort` bag row's dropdown choices for the selected model. */
function reasoningChoices(reasoning) {
    if (reasoning === undefined)
        return [];
    return [
        ...reasoning.defaultEffort === undefined ? [''] : [],
        ...reasoning.efforts.map(effort => effort.id),
    ];
}
/** One plan card: name, model, param summary, default badge, broken marker, and row controls. */
function PlanCard(props) {
    const { row, t, custom, onEdit, onSetDefault, onDelete } = props;
    const broken = row.broken !== undefined;
    return (_jsxs("li", { className: `${css.card} ${broken ? css.cardBroken : ''}`, children: [_jsxs("div", { className: css.cardHead, children: [_jsx("span", { className: css.cardName, children: row.name }), row.isDefault
                        ? (_jsx(Tooltip, { label: t('defaultLabel'), side: "top", children: _jsxs("span", { className: css.defaultBadge, children: [_jsx(IconCheckOutline16, {}), t('providerDefaultBadge')] }) }))
                        : null, broken ? _jsx("span", { className: css.brokenBadge, children: t('brokenBadge') }) : null] }), _jsxs("div", { className: css.cardModel, children: [_jsxs("span", { className: css.cardModelValue, children: [row.provider, "/", row.model] }), _jsxs("span", { className: css.paramSummary, children: [row.paramCount, " ", t('paramSummary')] })] }), _jsxs("div", { className: css.cardFoot, children: [_jsx(Tooltip, { label: t('editTitle'), side: "top", children: _jsx("button", { type: "button", className: css.iconButton, disabled: !custom, onClick: () => onEdit(row.id), children: _jsx(IconEditOutline16, {}) }) }), _jsx(Tooltip, { label: t('setDefault'), side: "top", children: _jsx("button", { type: "button", className: css.iconButton, disabled: !custom || row.isDefault, onClick: () => onSetDefault(row.id), children: _jsx(IconCheckOutline16, {}) }) }), _jsx(Tooltip, { label: t('delete'), side: "top", children: _jsx("button", { type: "button", className: `${css.iconButton} ${css.iconDanger}`, disabled: !custom, onClick: () => onDelete(row.id), children: _jsx(IconTrashOutline16, {}) }) })] })] }));
}
/** One params-bag row: key + value (value is a typed JSON scalar). */
function ParamRow(props) {
    const { param, index, reasoningEffortOptions, t, onKey, onValue, onRemove } = props;
    return (_jsxs("div", { className: css.paramRow, children: [_jsxs("div", { className: css.field, children: [_jsx("span", { className: css.fieldLabel, children: t('paramKeyLabel') }), _jsx("input", { className: css.input, value: param.key, placeholder: t('paramKeyPlaceholder'), onChange: e => onKey(index, e.target.value) })] }), _jsxs("div", { className: css.field, children: [_jsx("span", { className: css.fieldLabel, children: t('paramValueLabel') }), param.key === 'reasoningEffort' && reasoningEffortOptions.length > 0
                        ? (_jsx("select", { className: `${css.input} ${css.select}`, value: param.value, onChange: e => onValue(index, e.target.value), children: reasoningEffortOptions.map(effort => (_jsx("option", { value: JSON.stringify(effort), children: effort === '' ? t('reasoningProviderDefault') : effort }, effort))) }))
                        : (_jsx("input", { className: css.input, value: param.value, placeholder: t('paramValuePlaceholder'), onChange: e => onValue(index, e.target.value) }))] }), _jsx(Tooltip, { label: t('removeParam'), side: "top", children: _jsx("button", { type: "button", className: `${css.iconButton} ${css.iconDanger}`, onClick: () => onRemove(index), "aria-label": t('removeParam'), children: _jsx(IconTrashOutline16, {}) }) })] }));
}
/** The create/edit dialog: name, provider-grouped model pick, and the params bag editor. */
function PlanDialog(props) {
    const { draft, creating, catalog, t, setDialogId, setDialogName, setDialogProvider, setDialogModel, setParamKey, setParamValue, setReasoningEffort, addParam, removeParam, confirm, cancel } = props;
    const blocker = planBlocker(draft, creating);
    const message = draft.error ?? (blocker === undefined ? null : t(blocker));
    const group = catalog.groups.find(g => g.id === draft.provider);
    const model = group?.models.find(m => m.id === draft.model);
    const reasoningOptions = reasoningChoices(model?.reasoning);
    const catalogFailed = catalog.status === 'error';
    const modelSelectable = catalog.status === 'ready' && catalog.groups.length > 0;
    return (_jsx(Modal, { open: true, onClose: cancel, title: creating ? t('createTitle') : t('editTitle'), closeLabel: t('close'), description: creating ? t('createIntro') : t('editIntro'), className: css.dialog, contentClassName: css.dialogScroll, footer: (_jsxs(_Fragment, { children: [_jsx(Button, { variant: "outline", disabled: draft.saving, onClick: cancel, children: t('cancel') }), _jsx(Button, { disabled: draft.saving || blocker !== undefined, onClick: confirm, children: draft.saving ? t('saving') : t('save') })] })), children: _jsxs("div", { className: css.dialogFields, children: [creating ? (_jsxs("div", { className: css.field, children: [_jsx("span", { className: css.fieldLabel, children: "Id" }), _jsx("input", { className: css.input, value: draft.id, placeholder: "e.g. flash", onChange: e => setDialogId(e.target.value) })] })) : null, _jsxs("div", { className: css.field, children: [_jsx("span", { className: css.fieldLabel, children: t('nameLabel') }), _jsx("input", { className: css.input, value: draft.name, placeholder: t('namePlaceholder'), onChange: e => setDialogName(e.target.value) })] }), _jsxs("div", { className: css.field, children: [_jsx("span", { className: css.fieldLabel, children: t('modelLabel') }), catalogFailed
                            ? _jsx("p", { className: css.error, children: t('error') })
                            : (_jsxs("div", { className: css.modelRow, children: [_jsxs("select", { className: `${css.input} ${css.select}`, value: draft.provider, disabled: !modelSelectable, onChange: e => setDialogProvider(e.target.value), children: [_jsx("option", { value: "", disabled: true, children: t('modelPlaceholder') }), catalog.groups.map(group => (_jsx("option", { value: group.id, children: group.name }, group.id)))] }), _jsxs("select", { className: `${css.input} ${css.select}`, value: draft.model, disabled: group === undefined, onChange: e => setDialogModel(e.target.value), children: [_jsx("option", { value: "", disabled: true, children: t('modelPlaceholder') }), group?.models.map(model => (_jsx("option", { value: model.id, children: model.name }, model.id)))] })] }))] }), _jsxs("section", { className: css.editorBlock, children: [_jsx("h4", { className: css.blockTitle, children: t('paramsLabel') }), _jsx("p", { className: css.paramsHint, children: t('paramsHint') }), draft.params.map((param, index) => (_jsx(ParamRow, { param: param, index: index, reasoningEffortOptions: reasoningOptions, t: t, onKey: setParamKey, onValue: param.key === 'reasoningEffort' ? (_i, v) => setReasoningEffort(v) : setParamValue, onRemove: removeParam }, `${index}-${param.key}`))), _jsxs("button", { type: "button", className: css.addParam, onClick: addParam, children: [_jsx(IconPlusOutline16, {}), t('addParam')] })] }), _jsx("p", { className: css.customNote, children: t('customKeyNote') }), message !== null ? _jsx("p", { className: css.error, children: message }) : null] }) }));
}
/**
 * Render the model-plan settings section content column.
 * @param props - composed slot props.
 * @returns the section, or null when the deployment composes no plans.
 */
export function ModelPlanSection(props) {
    const { useModelPlanSection, useModelCatalog, t, load, loadCatalog } = props;
    const state = useModelPlanSection(snapshot => snapshot);
    const catalog = useModelCatalog(snapshot => snapshot);
    useEffect(() => {
        if (state.status === 'idle')
            void load();
    }, [state.status, load]);
    useEffect(() => {
        if (state.dialog !== null && catalog.status === 'idle')
            void loadCatalog();
    }, [state.dialog, catalog.status, loadCatalog]);
    if (state.status === 'loading')
        return _jsx("div", { children: t('loading') });
    if (state.status === 'error')
        return _jsx("div", { style: { color: 'var(--dsw-alias-state-error-primary)' }, children: t('error') });
    // An empty roster is a valid deployment (status 'unavailable'): it still
    // renders the full page — title, empty-state copy, the create button, and
    // the create dialog — so the user can author the first plan.
    if (state.status !== 'ready' && state.status !== 'unavailable')
        return null;
    const dialog = state.dialog;
    return (_jsxs("div", { className: css.section, children: [_jsx("h2", { className: css.title, children: t('nav') }), _jsx("p", { className: css.intro, children: state.status === 'unavailable' ? t('unavailable') : t('sectionIntro') }), _jsx("ul", { className: css.cards, children: state.rows.map(row => (_jsx(PlanCard, { row: row, t: t, custom: row.trust === 'user', onEdit: props.beginEdit, onSetDefault: props.setDefault, onDelete: props.confirmDelete }, row.id))) }), _jsxs("button", { type: "button", className: css.creatorButton, disabled: !state.authorable, onClick: () => props.beginCreate(), children: [_jsx(IconPlusOutline16, {}), t('create')] }), dialog !== null ? (_jsx(PlanDialog, { draft: dialog, creating: dialog.creating, catalog: catalog, t: t, setDialogId: props.setDialogId, setDialogName: props.setDialogName, setDialogProvider: props.setDialogProvider, setDialogModel: props.setDialogModel, setParamKey: props.setParamKey, setParamValue: props.setParamValue, setReasoningEffort: props.setReasoningEffort, addParam: props.addParam, removeParam: props.removeParam, confirm: () => void (dialog.creating ? props.confirmCreate() : props.confirmEdit()), cancel: props.closeDialog })) : null, _jsx(Modal, { open: state.pendingDelete !== null, onClose: () => props.confirmDelete(null), title: t('deleteTitle'), closeLabel: t('close'), description: t('deleteDescription'), className: css.deleteDialog, footer: (_jsxs(_Fragment, { children: [_jsx(Button, { variant: "outline", disabled: state.deleting, onClick: () => props.confirmDelete(null), children: t('cancel') }), _jsx(Button, { className: css.deleteConfirm, disabled: state.deleting, onClick: () => void props.remove(), children: state.deleting ? t('deleting') : t('deleteConfirm') })] })), children: t('deleteDescription') })] }));
}
//# sourceMappingURL=ModelPlanSection.js.map