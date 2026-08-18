/**
 * Teams settings section: the independent "团队" (编制表) roster as cards, with
 * a create dialog, a row-level enable/disable switch, an edit detail over the
 * team's full role roster (body/soul/memory per role), delete, and
 * open-directory.
 *
 * This section reads the team registry — fully separate from both the
 * agent-preset roster and the subagent roster — so the rosters never mix. A
 * shipped (system) team is read-only: it cannot be toggled, edited, or deleted.
 *
 * The role roster renders as compact list rows (id + description one-line
 * summary + body id + memory tag + remove control); tapping a row opens a
 * single-role edit dialog over id / description / body / memory / soul prompt
 * — a single-column vertical form so future role attributes become one more
 * field row, not a layout overhaul. Adding a role enters the same edit dialog
 * in a fresh-draft state.
 */
import type { ReactNode } from 'react';
import type { SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client';
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import { type TeamSectionState } from './section-store.ts';
import type { TeamSettingsKey } from './locales.ts';
/** Registration-side business face for the team management section. */
export interface TeamSectionInjected {
    hooks: {
        /** Page snapshot bound by the renderer as useTeamSection. */
        teamSection: SnapshotStore<TeamSectionState>;
    };
    /** Read the roster; called once when the section first renders. */
    load: () => Promise<void>;
    /** Open the create dialog. */
    beginCreate: () => void;
    /** Close the create dialog, discarding the draft. */
    cancelCreate: () => void;
    /** Name the team the create makes. */
    setCreateId: (id: string) => void;
    /** Set the create dialog's display name. */
    setCreateName: (name: string) => void;
    /** Stage one field of one create role row. */
    setCreateRoleField: (index: number, field: string, value: string) => void;
    /** Add an empty role row to the create dialog. */
    addCreateRole: () => void;
    /** Remove one role row from the create dialog. */
    removeCreateRole: (index: number) => void;
    /** Submit the create. */
    confirmCreate: () => Promise<void>;
    /** Toggle one team's enabled switch on the row. */
    toggle: (id: string, enabled: boolean) => void;
    /** Open the edit detail over one team's full role roster. */
    beginDetail: (id: string) => Promise<void>;
    /** Close the edit detail, discarding the draft. */
    closeDetail: () => void;
    /** Set the detail dialog's display name. */
    setDetailName: (name: string) => void;
    /** Set the detail dialog's display description. */
    setDetailDescription: (description: string) => void;
    /** Open the single-role edit dialog over one roster row. */
    beginRoleEdit: (index: number) => void;
    /** Add a blank role to the team detail and open it in the edit dialog. */
    addRoleInDetail: () => void;
    /** Stage one field of the role currently being edited. */
    setRoleEditField: (field: 'id' | 'description' | 'prompt' | 'body' | 'memory', value: string) => void;
    /** Save the staged role back into the team detail's roster. */
    saveRoleEdit: () => Promise<void>;
    /** Cancel the open role edit, rolling back the staged draft. */
    cancelRoleEdit: () => void;
    /** Remove one role from the team detail's roster (also closes any open edit). */
    removeRole: (index: number) => void;
    /** Submit the edit detail's staged roster. */
    confirmDetail: () => Promise<void>;
    /** Open one team's directory, or reveal its path where there is no desktop. */
    openLocation: (id: string) => Promise<void>;
    /** Ask for confirmation before deleting one team. */
    confirmDelete: (id: string | null) => void;
    /** Delete the team awaiting confirmation. */
    remove: () => Promise<void>;
}
/** Full component props. */
export type TeamSectionProps = PropsRuntime<'settings.section'> & PropsLocale<'settings.subagentTeam'> & InjectFace<TeamSectionInjected>;
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        /** Team management-section copy. */
        'settings.subagentTeam': TeamSettingsKey;
    }
}
/**
 * Render the Teams section content column.
 * @param props - composed slot props.
 * @returns the section, or null when the deployment composes no teams.
 */
export declare function TeamSection(props: TeamSectionProps): ReactNode;
//# sourceMappingURL=TeamSection.d.ts.map