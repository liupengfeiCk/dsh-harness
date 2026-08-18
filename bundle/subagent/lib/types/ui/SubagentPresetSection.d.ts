/**
 * Subagents settings section: the independent "子代理" roster as cards, with
 * a create/copy dialog, a row-level enable/disable switch, an edit dialog over
 * the metadata fields, delete, and open-directory.
 *
 * This section reads the subagent registry — fully separate from the
 * agent-preset section — so the two rosters never mix. A shipped (system)
 * subagent is read-only: it cannot be toggled, edited, or deleted.
 */
import type { ReactNode } from 'react';
import type { SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client';
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import { type SubagentSectionState } from './section-store.ts';
import type { SubagentSettingsKey } from './locales.ts';
/** Registration-side business face for the subagent management section. */
export interface SubagentSectionInjected {
    hooks: {
        /** Page snapshot bound by the renderer as useSubagentSection. */
        subagentSection: SnapshotStore<SubagentSectionState>;
    };
    /** Read the roster; called once when the section first renders. */
    load: () => Promise<void>;
    /** Open the create/copy dialog over one subagent. */
    beginCreate: (from: string) => void;
    /** Close the create dialog, discarding the draft. */
    cancelCreate: () => void;
    /** Name the subagent the create makes. */
    setCreateId: (id: string) => void;
    /** Submit the create. */
    confirmCreate: () => Promise<void>;
    /** Toggle one subagent's enabled switch on the row. */
    toggle: (id: string, enabled: boolean) => void;
    /** Open the read-only viewer over one subagent's composition. */
    beginView: (id: string) => Promise<void>;
    /** Close the read-only viewer. */
    closeView: () => void;
    /** Open the metadata edit dialog over one locally authored subagent. */
    beginEdit: (id: string) => Promise<void>;
    /** Close the edit dialog, discarding the draft. */
    cancelEdit: () => void;
    /** Stage one edit field. */
    setEditField: (scope: string, field: string, value: string | boolean) => void;
    /** Submit the edit dialog's staged fields. */
    confirmEdit: () => Promise<void>;
    /** Open one subagent's directory, or reveal its path where there is no desktop. */
    openLocation: (id: string) => Promise<void>;
    /** Ask for confirmation before deleting one subagent. */
    confirmDelete: (id: string | null) => void;
    /** Delete the subagent awaiting confirmation. */
    remove: () => Promise<void>;
}
/** Full component props. */
export type SubagentPresetSectionProps = PropsRuntime<'settings.section'> & PropsLocale<'settings.subagentPreset'> & InjectFace<SubagentSectionInjected>;
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        /** Subagent management-section copy. */
        'settings.subagentPreset': SubagentSettingsKey;
    }
}
/**
 * Render the Subagents section content column.
 * @param props - composed slot props.
 * @returns the section, or null when the deployment composes no subagents.
 */
export declare function SubagentPresetSection(props: SubagentPresetSectionProps): ReactNode;
//# sourceMappingURL=SubagentPresetSection.d.ts.map