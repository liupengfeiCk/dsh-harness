import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/**
 * Memory settings section ("记忆"): the independent settings block over the
 * `/memory` wire channel.
 *
 * Renders the three scope tabs (team / team+role / project), each showing the
 * three memory layers (L1 / L2 / L3), with view-detail, delete-with-
 * confirmation, role↔asset binding (装配规则), the pipeline status summary, and
 * the live memory configuration.
 *
 * @module dsh-harness-memory-bundle/ui/MemorySection
 */
import { useEffect } from 'react';
import { Button, IconBrowseOutline16, IconTrashOutline16, Modal, } from '@deepseek-ai/dsh-client-ui-primitives';
import css from './MemorySection.module.css';
/** One asset row in a layer list. */
function AssetRowView(props) {
    const { row, t, onView, onDelete, onBind, onUnbind, bound } = props;
    return (_jsxs("li", { className: css.assetRow, children: [_jsx("button", { type: "button", className: css.assetTitle, onClick: () => onView(row.ref), children: row.title }), _jsx("span", { className: css.assetPreview, children: row.preview }), _jsxs("div", { className: css.assetActions, children: [_jsx("button", { type: "button", className: css.iconButton, onClick: () => onView(row.ref), "aria-label": t('view'), children: _jsx(IconBrowseOutline16, {}) }), bound
                        ? (_jsx("button", { type: "button", className: `${css.iconButton} ${css.iconWarn}`, onClick: () => onUnbind(row.ref), "aria-label": t('unbind'), children: t('unbind') }))
                        : (_jsx("button", { type: "button", className: css.iconButton, onClick: () => onBind(row.ref), "aria-label": t('bind'), children: t('bind') })), _jsx("button", { type: "button", className: `${css.iconButton} ${css.iconDanger}`, onClick: () => onDelete(row.ref), "aria-label": t('delete'), children: _jsx(IconTrashOutline16, {}) })] })] }));
}
/** One layer's asset list with an empty state. */
function LayerList(props) {
    const { title, rows, t, onView, onDelete, onBind, onUnbind, bound } = props;
    if (rows.length === 0) {
        return (_jsxs("section", { className: css.layer, children: [_jsx("h4", { className: css.layerTitle, children: title }), _jsx("p", { className: css.emptyLayer, children: t('emptyLayer') })] }));
    }
    return (_jsxs("section", { className: css.layer, children: [_jsx("h4", { className: css.layerTitle, children: title }), _jsx("ul", { className: css.assetList, children: rows.map(row => (_jsx(AssetRowView, { row: row, t: t, onView: onView, onDelete: onDelete, onBind: onBind, onUnbind: onUnbind, bound: bound(row.ref) }, row.ref))) })] }));
}
/** The status summary block. */
function StatusBlock(props) {
    const { t, l0Count, l1Count, l2Count, l3Count, lastExtractedAtMs } = props;
    const last = lastExtractedAtMs > 0
        ? new Date(lastExtractedAtMs).toLocaleString()
        : t('statusNever');
    return (_jsxs("section", { className: css.statusBlock, children: [_jsx("h4", { className: css.blockTitle, children: t('statusTitle') }), _jsxs("ul", { className: css.statusGrid, children: [_jsxs("li", { children: [_jsx("span", { children: t('statusL0') }), _jsx("strong", { children: l0Count })] }), _jsxs("li", { children: [_jsx("span", { children: t('statusL1') }), _jsx("strong", { children: l1Count })] }), _jsxs("li", { children: [_jsx("span", { children: t('statusL2') }), _jsx("strong", { children: l2Count })] }), _jsxs("li", { children: [_jsx("span", { children: t('statusL3') }), _jsx("strong", { children: l3Count })] })] }), _jsxs("p", { className: css.statusLast, children: [t('statusLastExtracted'), ": ", last] })] }));
}
/**
 * Render the memory settings section content column.
 * @param props - composed slot props.
 * @returns the section, or null when loading/error states resolve elsewhere.
 */
export function MemorySection(props) {
    const { useMemorySection, t, load, setActive, viewAsset, closeDetail, confirmDelete, remove, setBindRoleId, loadRoleBindings, bindAsset, unbindAsset } = props;
    const state = useMemorySection(snapshot => snapshot);
    useEffect(() => {
        if (state.status === 'idle')
            void load();
    }, [state.status, load]);
    if (state.status === 'loading')
        return _jsx("div", { children: t('loading') });
    if (state.status === 'error')
        return _jsx("div", { style: { color: 'var(--dsw-alias-state-error-primary)' }, children: t('error') });
    if (state.status !== 'ready')
        return null;
    const bound = (ref) => state.roleAssets.includes(ref);
    const tab = state.active;
    return (_jsxs("div", { className: css.section, children: [_jsx("h2", { className: css.title, children: t('nav') }), _jsx("p", { className: css.intro, children: t('sectionIntro') }), _jsxs("div", { className: css.tabs, children: [_jsx("button", { type: "button", className: `${css.tab} ${tab === 'team' ? css.tabActive : ''}`, onClick: () => void setActive('team'), children: t('scopeTeam') }), _jsx("button", { type: "button", className: `${css.tab} ${tab === 'teamRole' ? css.tabActive : ''}`, onClick: () => void setActive('teamRole'), children: t('scopeTeamRole') }), _jsx("button", { type: "button", className: `${css.tab} ${tab === 'project' ? css.tabActive : ''}`, onClick: () => void setActive('project'), children: t('scopeProject') })] }), _jsx("div", { className: css.statusRow, children: state.statusSummary !== null
                    ? (_jsx(StatusBlock, { t: t, l0Count: state.statusSummary.l0Count, l1Count: state.statusSummary.l1Count, l2Count: state.statusSummary.l2Count, l3Count: state.statusSummary.l3Count, lastExtractedAtMs: state.statusSummary.lastExtractedAtMs }))
                    : null }), _jsxs("div", { className: css.layers, children: [_jsx(LayerList, { title: t('layerL1'), rows: state.l1, t: t, onView: viewAsset, onDelete: confirmDelete, onBind: bindAsset, onUnbind: unbindAsset, bound: bound }), _jsx(LayerList, { title: t('layerL2'), rows: state.l2, t: t, onView: viewAsset, onDelete: confirmDelete, onBind: bindAsset, onUnbind: unbindAsset, bound: bound }), _jsx(LayerList, { title: t('layerL3'), rows: state.l3, t: t, onView: viewAsset, onDelete: confirmDelete, onBind: bindAsset, onUnbind: unbindAsset, bound: bound })] }), _jsxs("section", { className: css.bindBlock, children: [_jsx("h4", { className: css.blockTitle, children: t('bindTitle') }), _jsx("p", { className: css.bindHint, children: t('bindHint') }), _jsxs("div", { className: css.bindRow, children: [_jsx("label", { className: css.bindLabel, htmlFor: "memory-bind-role", children: t('bindRoleLabel') }), _jsx("input", { id: "memory-bind-role", className: css.input, value: state.bindRoleId, placeholder: t('bindRolePlaceholder'), onChange: e => setBindRoleId(e.target.value) }), _jsx(Button, { variant: "outline", onClick: () => void loadRoleBindings(state.bindRoleId), children: t('loadBindings') })] }), state.bindRoleId !== '' ? (_jsx("p", { className: css.boundAssets, children: state.roleAssets.length === 0
                            ? t('noBindings')
                            : `${t('boundAssets')}: ${state.roleAssets.join(', ')}` })) : null] }), state.config !== null ? (_jsxs("section", { className: css.configBlock, children: [_jsx("h4", { className: css.blockTitle, children: t('configTitle') }), _jsxs("ul", { className: css.configGrid, children: [_jsxs("li", { children: [_jsx("span", { children: t('configEnabled') }), _jsx("strong", { children: state.config.enabled ? 'on' : 'off' })] }), _jsxs("li", { children: [_jsx("span", { children: t('configRefinementPlan') }), _jsx("strong", { children: state.config.refinementPlan || '—' })] }), _jsxs("li", { children: [_jsx("span", { children: t('configCompression') }), _jsx("strong", { children: state.config.compressionMode === 'follow' ? t('configCompressionFollow') : state.config.compressionPlan })] }), _jsxs("li", { children: [_jsx("span", { children: t('configInjectionLimit') }), _jsxs("strong", { children: [Math.round(state.config.injectionLimit * 100), t('percent')] })] }), _jsxs("li", { children: [_jsx("span", { children: t('configCompressionLine') }), _jsxs("strong", { children: [Math.round(state.config.compressionLine * 100), t('percent')] })] }), _jsxs("li", { children: [_jsx("span", { children: t('configRetainLine') }), _jsxs("strong", { children: [Math.round(state.config.retainLine * 100), t('percent')] })] })] })] })) : null, _jsx(Modal, { open: state.detail !== null, onClose: closeDetail, title: state.detail?.title ?? '', closeLabel: t('close'), className: css.detailDialog, footer: (_jsx(Button, { variant: "outline", onClick: closeDetail, children: t('close') })), children: _jsx("pre", { className: css.detailContent, children: state.detail?.content ?? '' }) }), _jsx(Modal, { open: state.pendingDelete !== null, onClose: () => confirmDelete(null), title: t('deleteTitle'), closeLabel: t('close'), description: t('deleteDescription'), className: css.deleteDialog, footer: (_jsxs(_Fragment, { children: [_jsx(Button, { variant: "outline", disabled: state.deleting, onClick: () => confirmDelete(null), children: t('close') }), _jsx(Button, { className: css.deleteConfirm, disabled: state.deleting, onClick: () => void remove(), children: state.deleting ? t('deleting') : t('deleteConfirm') })] })), children: t('deleteDescription') })] }));
}
//# sourceMappingURL=MemorySection.js.map