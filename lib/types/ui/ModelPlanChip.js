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
import { useEffect, useRef, useState } from 'react';
import { IconChevronDownOutline14, IconWarningOutline16, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives';
import css from './ModelPlanChip.module.css';
/** The trigger's current label: the bound plan's name, else the default, else a prompt. */
function triggerLabel(state, t) {
    const bound = state.options.find(option => option.id === state.planId);
    if (bound !== undefined)
        return `${t('seatPrefix')}${bound.name}`;
    const fallback = state.options.find(option => option.isDefault);
    return `${t('seatPrefix')}${fallback?.name ?? t('seatEmpty')}`;
}
/**
 * Render the composer model-seat chip.
 * @param props - composed slot props.
 * @returns the chip trigger and, while open, the plan menu.
 */
export function ModelPlanChip({ locked, useModelPlanChip, t, load, select }) {
    const state = useModelPlanChip(snapshot => snapshot);
    const [open, setOpen] = useState(false);
    const [overrideTemp, setOverrideTemp] = useState('');
    const rootRef = useRef(null);
    const triggerRef = useRef(null);
    useEffect(() => {
        if (state.status === 'idle')
            void load();
    }, [state.status, load]);
    useEffect(() => {
        if (!open)
            return;
        const closeOutside = (event) => {
            if (!rootRef.current?.contains(event.target))
                setOpen(false);
        };
        document.addEventListener('mousedown', closeOutside);
        return () => { document.removeEventListener('mousedown', closeOutside); };
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
    const applyOverride = () => {
        if (state.planId === undefined)
            return;
        if (overrideTemp.trim() === '') {
            void select(state.planId, {});
        }
        else {
            const parsed = Number(overrideTemp);
            if (!Number.isNaN(parsed))
                void select(state.planId, { temperature: parsed });
        }
        setOverrideTemp('');
    };
    return (_jsxs("div", { ref: rootRef, className: css.root, onBlur: onBlur, children: [_jsx(Tooltip, { label: state.locked ? t('seatLocked') : (state.error ?? t('seatHint')), side: "top", delayMs: state.locked ? 0 : 500, children: _jsxs("button", { ref: triggerRef, type: "button", className: css.chip, "aria-haspopup": "menu", "aria-expanded": open, "aria-label": t('seatSelectAria'), title: label, disabled: disabled, onKeyDown: onTriggerKeyDown, onClick: () => { setOpen(value => !value); }, children: [label, _jsx(IconChevronDownOutline14, { className: css.chevron })] }) }), open && !disabled && (_jsxs("div", { className: css.menu, role: "menu", "aria-label": t('seatSelect'), children: [state.status === 'error' && _jsx("div", { className: css.error, children: t('error') }), _jsx("div", { className: css.plans, children: state.options.length === 0
                            ? (_jsxs("div", { className: css.empty, children: [_jsx("div", { children: t('noPlans') }), _jsx("div", { className: css.emptyHint, children: t('noPlansHint') })] }))
                            : state.options.map(option => {
                                const selected = option.id === state.planId;
                                const broken = option.broken !== undefined;
                                return (_jsxs("button", { type: "button", role: "menuitemradio", "aria-checked": selected, className: `${css.option} ${selected ? css.selected : ''} ${broken ? css.optionBroken : ''}`, disabled: state.busy, onClick: () => { void select(option.id); }, children: [_jsxs("span", { className: css.optionMain, children: [_jsx("span", { className: css.optionName, children: option.name }), option.isDefault && _jsx("span", { className: css.optionDefault, children: t('seatDefaultPlan') }), broken && _jsx("span", { className: css.optionBrokenTag, children: t('brokenPlan') })] }), _jsxs("span", { className: css.optionModel, children: [option.provider, "/", option.model, " \u00B7 ", option.paramCount, " ", t('paramCount')] })] }, option.id));
                            }) }), _jsxs("div", { className: css.override, children: [_jsx("span", { className: css.overrideTitle, children: t('seatOverrides') }), _jsx("span", { className: css.overrideHint, children: t('seatOverrideHint') }), _jsxs("div", { className: css.overrideRow, children: [_jsx("label", { className: css.overrideKey, children: t('temperatureKey') }), _jsx("input", { className: css.input, type: "number", step: "0.1", value: overrideTemp, placeholder: t('paramValuePlaceholder'), onChange: e => setOverrideTemp(e.target.value) }), _jsx("button", { type: "button", className: css.applyButton, disabled: state.planId === undefined, onClick: applyOverride, children: t('save') })] }), state.overrides !== undefined && Object.keys(state.overrides).length > 0 ? (_jsx("button", { type: "button", className: css.clearButton, onClick: () => { if (state.planId !== undefined)
                                    void select(state.planId, {}); }, children: t('seatClearOverrides') })) : null] }), state.locked ? (_jsxs("div", { className: css.rejected, children: [_jsx(IconWarningOutline16, {}), t('seatSelectRejected')] })) : null] }))] }));
}
//# sourceMappingURL=ModelPlanChip.js.map