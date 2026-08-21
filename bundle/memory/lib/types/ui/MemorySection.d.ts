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
import type { ReactNode } from 'react';
import type { SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client';
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type { MemorySectionState, ScopeTab } from './section-store.ts';
import type { MemoryKey } from './locales.ts';
/** Registration-side business face for the memory settings section. */
export interface MemorySectionInjected {
    hooks: {
        /** Page snapshot bound by the renderer as useMemorySection. */
        memorySection: SnapshotStore<MemorySectionState>;
    };
    /** Load the active tab + config; called once when the section first renders. */
    load: () => Promise<void>;
    /** Switch the active scope tab. */
    setActive: (scope: ScopeTab['key']) => Promise<void>;
    /** Open one asset's detail. */
    viewAsset: (ref: string) => Promise<void>;
    /** Close the detail. */
    closeDetail: () => void;
    /** Ask for confirmation before deleting one asset. */
    confirmDelete: (ref: string | null) => void;
    /** Delete the asset awaiting confirmation. */
    remove: () => Promise<void>;
    /** Set the role id for the binding editor. */
    setBindRoleId: (roleId: string) => void;
    /** Load the assets bound to one role. */
    loadRoleBindings: (roleId: string) => Promise<void>;
    /** Bind one asset to the current role. */
    bindAsset: (ref: string) => Promise<void>;
    /** Unbind one asset from the current role. */
    unbindAsset: (ref: string) => Promise<void>;
}
/** Full component props. */
export type MemorySectionProps = PropsRuntime<'settings.section'> & PropsLocale<'settings.memory'> & InjectFace<MemorySectionInjected>;
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        /** Memory management-section copy. */
        'settings.memory': MemoryKey;
    }
}
/**
 * Render the memory settings section content column.
 * @param props - composed slot props.
 * @returns the section, or null when loading/error states resolve elsewhere.
 */
export declare function MemorySection(props: MemorySectionProps): ReactNode;
//# sourceMappingURL=MemorySection.d.ts.map