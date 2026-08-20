import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * Session team-mode chip: the input-card tool-row control that names the
 * current delegation surface (standard or a user-defined team) and switches
 * it before the session starts.
 *
 * It registers into `conversation.input.left`, beside the resident chrome
 * (access mode, plan, attach). The choice is only available before a turn
 * runs — once the session is non-blank the host refuses the swap, so the
 * chip disables itself on a started session and explains why on hover. The
 * menu mirrors the official agent-preset chip: standard first, then every
 * user-defined team, in roster order. A pick flips the local current
 * immediately (the browser never sees the host's `mode-selected` broadcast),
 * and the host's reply reconciles it; a rejection rolls back.
 */
import { useEffect, useState } from 'react';
import { IconChevronDownOutline14, Menu, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives';
import css from './TeamModeChip.module.css';
/**
 * The current mode's display label: `标准`/`Standard` for the standard
 * surface, else the team's name prefixed with the team marker.
 */
function modeLabel(state, t) {
    if (state.current.mode === 'standard')
        return t('standard');
    const current = state.options.find(option => option.team === state.current.team);
    return `${t('teamPrefix')}${current?.name ?? state.current.team ?? ''}`;
}
/**
 * Render the session team-mode chip.
 * @param props - composed slot props.
 * @returns the chip and its menu.
 */
export function TeamModeChip({ session, useTeamMode, t, load, select }) {
    const state = useTeamMode(snapshot => snapshot);
    const [open, setOpen] = useState(false);
    useEffect(() => {
        if (state.status === 'idle')
            void load();
    }, [state.status, load]);
    // The mode is locked once the conversation has started: a non-blank session
    // produced its history under the current surface, and the host refuses the
    // swap. A still-loading or failed roster keeps the trigger live but the
    // menu empty beyond the current mode; the standard pick always remains.
    const locked = !session.blank;
    const disabled = locked || state.busy;
    const label = modeLabel(state, t);
    return (_jsx(Menu, { open: open, onClose: () => { setOpen(false); }, items: state.options.map(option => ({
            id: option.id,
            label: option.team === undefined ? t('standard') : option.name,
        })), selectedId: state.current.mode === 'team' && state.current.team !== undefined
            ? state.current.team
            : 'standard', onSelect: (id) => {
            setOpen(false);
            if (id === 'standard')
                void select('standard');
            else
                void select('team', id);
        }, align: "start", portal: true, anchor: (_jsx(Tooltip, { label: locked ? t('modeLocked') : (state.error ?? t('modeHint')), side: "top", delayMs: locked ? 0 : 500, children: _jsxs("button", { type: "button", className: css.chip, "aria-haspopup": "menu", "aria-expanded": open, "aria-label": t('modeHint'), disabled: disabled, onClick: () => { setOpen(value => !value); }, children: [label, _jsx(IconChevronDownOutline14, { className: css.chevron })] }) })) }));
}
//# sourceMappingURL=TeamModeChip.js.map