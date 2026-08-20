import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * Session model-plan chip: the composer's named model seat (`conversation.input.model`),
 * replacing the official model selector with a plan-bound picker.
 *
 * The trigger shows the bound plan's name (`方案：<name> ▾`), or the deployment
 * default (or "选择方案") when none is bound. The menu lists every plan with its
 * provider/model and param summary, marks the default, and flags broken plans;
 * picking one binds the session through `select`. A "session overrides" footer
 * lets the user temporarily adjust params for this session only.
 *
 * Once the conversation has started the host refuses a binding swap, so the
 * chip disables itself on a non-blank session and explains why on hover; a
 * select the host rejects as locked rolls the binding back and surfaces the
 * failure. Note the composer deliberately keeps this seat LIVE while it refuses
 * text for a model-related block — the user clears such a block by picking a
 * usable plan here — so only the bar's own disable state (`locked`) and a
 * started session disable the trigger.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { IconChevronDownOutline14, IconPlusOutline16, IconTrashOutline16, IconWarningOutline16, Tooltip, } from '@deepseek-ai/dsh-client-ui-primitives';
import css from './ModelPlanChip.module.css';
/** The trigger's current label: the bound plan's name, else the default, else a prompt. */
function triggerLabel(state, t) {
    const overrideCount = Object.keys(state.overrides).length;
    const bound = state.options.find(option => option.id === state.planId);
    if (bound !== undefined) {
        const base = `${t('seatPrefix')}${bound.id}`;
        return overrideCount > 0 ? `${base} · ${overrideCount}` : base;
    }
    const fallback = state.options.find(option => option.isDefault);
    return `${t('seatPrefix')}${fallback?.id ?? t('seatEmpty')}`;
}
/**
 * Render the composer model-seat chip.
 * @param props - composed slot props.
 * @returns the chip trigger and, while open, the plan menu.
 */
export function ModelPlanChip({ locked, useModelPlanChip, t, load, select, beginOverrideDraft, setOverrideKey, setOverrideValue, addOverrideRow, removeOverrideRow, overrideBlocker, applyOverrides, clearOverrides, }) {
    const state = useModelPlanChip(snapshot => snapshot);
    const [open, setOpen] = useState(false);
    const rootRef = useRef(null);
    const menuRef = useRef(null);
    const triggerRef = useRef(null);
    // Fixed viewport position for the menu, resolved from the trigger rect with
    // the viewport clamped so the popup never exits the visible area.
    const [menuPos, setMenuPos] = useState(null);
    useEffect(() => {
        if (state.status === 'idle')
            void load();
    }, [state.status, load]);
    useEffect(() => {
        if (!open)
            return;
        const closeOutside = (event) => {
            if (!rootRef.current?.contains(event.target) && !menuRef.current?.contains(event.target))
                setOpen(false);
        };
        document.addEventListener('mousedown', closeOutside);
        return () => { document.removeEventListener('mousedown', closeOutside); };
    }, [open]);
    // Position the popup ABOVE the trigger (it sits in the composer's bottom
    // bar), clamped to the viewport so a tall menu or a short window never
    // pushes it off-screen. The menu uses `position: fixed`, so it anchors to
    // the viewport (escaping the composer's overflow clipping) and layers above
    // the stats bar; the composer container chain is deliberately transform-free
    // (ConversationRoot's .composerHero avoids transform precisely so fixed
    // pickers/modals like this stay viewport-anchored).
    useLayoutEffect(() => {
        if (!open) {
            setMenuPos(null);
            return;
        }
        const place = () => {
            const trigger = triggerRef.current;
            if (trigger === null)
                return;
            const r = trigger.getBoundingClientRect();
            const menuEl = menuRef.current;
            const MARGIN = 12;
            const vw = window.innerWidth;
            const vh = window.innerHeight;
            const mw = menuEl?.offsetWidth ?? 0;
            const mh = menuEl?.offsetHeight ?? 0;
            let x = r.right - mw;
            let y = r.top - mh - 4;
            if (mw > 0)
                x = Math.min(Math.max(x, MARGIN), vw - mw - MARGIN);
            if (mh > 0)
                y = Math.min(Math.max(y, MARGIN), vh - mh - MARGIN);
            setMenuPos({ left: x, top: y });
        };
        place();
        window.addEventListener('scroll', place, true);
        window.addEventListener('resize', place);
        return () => {
            window.removeEventListener('scroll', place, true);
            window.removeEventListener('resize', place);
        };
    }, [open]);
    // The owner passes only `locked` (the bar's chrome disable state for a
    // removed session). A started session cannot change its plan binding, but
    // that is enforced by the host rejecting the pick (the chip rolls back and
    // explains) rather than by disabling the seat here. A model-related block
    // deliberately does NOT lock the seat — the user clears it by picking a
    // usable plan here.
    const disabled = locked || state.busy;
    const label = triggerLabel(state, t);
    const onTriggerKeyDown = (event) => {
        if (event.key === 'Escape' && open) {
            event.preventDefault();
            setOpen(false);
        }
    };
    const onBlur = (event) => {
        if (event.relatedTarget instanceof Node && rootRef.current?.contains(event.relatedTarget))
            return;
        setOpen(false);
    };
    const overrideCount = Object.keys(state.overrides).length;
    const blocker = state.planId === undefined || state.busy ? null : overrideBlocker();
    const overrideMessage = state.overrideError === 'key'
        ? t('keyRequired')
        : state.overrideError === 'value'
            ? t('valueInvalid')
            : null;
    return (_jsxs("div", { ref: rootRef, className: css.root, onBlur: onBlur, children: [_jsx(Tooltip, { label: state.locked ? t('seatLocked') : (state.error ?? t('seatHint')), side: "top", delayMs: state.locked ? 0 : 500, children: _jsxs("button", { ref: triggerRef, type: "button", className: css.chip, "aria-haspopup": "menu", "aria-expanded": open, "aria-label": t('seatSelectAria'), title: label, disabled: disabled, onKeyDown: onTriggerKeyDown, onClick: () => {
                        // Re-read the roster each time the menu opens so a plan authored
                        // in Settings shows up here without a reload, and seed the override
                        // editor from the current session overrides so they are always
                        // visible and editable.
                        if (!open) {
                            void load();
                            beginOverrideDraft();
                        }
                        setOpen(value => !value);
                    }, children: [label, _jsx(IconChevronDownOutline14, { className: css.chevron })] }) }), open && !disabled && (_jsxs("div", { ref: menuRef, className: css.menu, role: "menu", "aria-label": t('seatSelect'), style: menuPos ?? undefined, children: [state.status === 'error' && _jsx("div", { className: css.error, children: t('error') }), _jsx("div", { className: css.plans, children: state.options.length === 0
                            ? (_jsxs("div", { className: css.empty, children: [_jsx("div", { children: t('noPlans') }), _jsx("div", { className: css.emptyHint, children: t('noPlansHint') })] }))
                            : state.options.map(option => {
                                const selected = option.id === state.planId;
                                const broken = option.broken !== undefined;
                                return (_jsxs("button", { type: "button", role: "menuitemradio", "aria-checked": selected, className: `${css.option} ${selected ? css.selected : ''} ${broken ? css.optionBroken : ''}`, disabled: state.busy, 
                                    // A plan switch keeps the current session overrides (they
                                    // ride above whichever plan is bound), so live overrides
                                    // survive changing plans.
                                    onClick: () => { void select(option.id); }, children: [_jsxs("span", { className: css.optionMain, children: [_jsx("span", { className: css.optionName, children: option.id }), option.isDefault && _jsx("span", { className: css.optionDefault, children: t('seatDefaultPlan') }), broken && _jsx("span", { className: css.optionBrokenTag, children: t('brokenPlan') })] }), _jsxs("span", { className: css.optionModel, children: [option.provider, "/", option.model, " \u00B7 ", option.paramCount, " ", t('paramCount')] })] }, option.id));
                            }) }), _jsxs("div", { className: css.override, children: [_jsxs("div", { className: css.overrideHead, children: [_jsx("span", { className: css.overrideTitle, children: t('seatOverrides') }), overrideCount > 0 ? _jsx("span", { className: css.overrideCount, children: overrideCount }) : null] }), _jsx("span", { className: css.overrideHint, children: t('seatOverrideHint') }), _jsxs("div", { className: css.overrideTable, children: [_jsxs("div", { className: css.overrideCols, children: [_jsx("span", { className: css.overrideColKey, children: t('paramKeyLabel') }), _jsx("span", { className: css.overrideColValue, children: t('paramValueLabel') }), _jsx("span", { className: css.overrideColRemove })] }), state.overrideDraft.map((row, index) => (_jsxs("div", { className: css.overrideRow, children: [_jsx("input", { className: css.input, value: row.key, placeholder: t('paramKeyPlaceholder'), onChange: e => setOverrideKey(index, e.target.value) }), _jsx("input", { className: css.input, value: row.value, placeholder: t('paramValuePlaceholder'), onChange: e => setOverrideValue(index, e.target.value) }), _jsx("button", { type: "button", className: css.removeRowButton, "aria-label": t('removeParam'), title: t('removeParam'), onClick: () => removeOverrideRow(index), children: _jsx(IconTrashOutline16, {}) })] }, `${index}-${row.key}`)))] }), _jsxs("button", { type: "button", className: css.addOverride, onClick: addOverrideRow, children: [_jsx(IconPlusOutline16, {}), t('addParam')] }), overrideMessage !== null ? _jsx("span", { className: css.overrideError, children: overrideMessage }) : null, _jsxs("div", { className: css.overrideActions, children: [_jsx("button", { type: "button", className: css.applyButton, disabled: state.planId === undefined || state.busy || blocker !== null, onClick: () => { void applyOverrides(); }, children: t('save') }), overrideCount > 0 ? (_jsx("button", { type: "button", className: css.clearButton, disabled: state.busy, onClick: () => { void clearOverrides(); }, children: t('seatClearOverrides') })) : null] })] }), state.locked ? (_jsxs("div", { className: css.rejected, children: [_jsx(IconWarningOutline16, {}), t('seatSelectRejected')] })) : null] }))] }));
}
//# sourceMappingURL=ModelPlanChip.js.map