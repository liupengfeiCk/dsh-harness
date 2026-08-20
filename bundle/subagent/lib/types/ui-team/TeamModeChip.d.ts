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
import type { SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client';
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type { TeamModeState } from './mode-store.ts';
import type { TeamSettingsKey } from './locales.ts';
/** Registration-side business face for the session mode chip. */
export interface TeamModeChipInjected {
    hooks: {
        /** Chip snapshot bound by the renderer as useTeamMode. */
        teamMode: SnapshotStore<TeamModeState>;
    };
    /** Read the session's mode and the team roster when the chip first renders. */
    load: () => Promise<void>;
    /** Select one surface (standard or a team) for this session. */
    select: (mode: 'standard' | 'team', team?: string) => Promise<void>;
}
/** Full component props: the input-zone owner share + session kit + locale + injected face. */
export type TeamModeChipProps = PropsRuntime<'conversation.input.left'> & PropsLocale<'settings.subagentTeam'> & InjectFace<TeamModeChipInjected>;
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        /** Team management-section copy, shared with the settings section. */
        'settings.subagentTeam': TeamSettingsKey;
    }
}
/**
 * Render the session team-mode chip.
 * @param props - composed slot props.
 * @returns the chip and its menu.
 */
export declare function TeamModeChip({ session, useTeamMode, t, load, select }: TeamModeChipProps): import("react").JSX.Element;
//# sourceMappingURL=TeamModeChip.d.ts.map