/**
 * Memory settings section controller ("记忆").
 *
 * Drives the settings-section block over the `/memory` wire channel: the three
 * scope tabs (team / team+role / project), each rendering the three memory
 * layers (L1 atomic facts / L2 scene profiles / L3 personas), asset view +
 * delete (with confirmation), role↔asset binding (装配规则), the pipeline
 * status summary, and the live memory settings.
 *
 * The host stays the single fact source. Every mutation writes through the
 * wire and the section re-reads the affected scope afterwards, because a
 * delete or a bind changes more than the row it targeted (binding counts
 * re-read from the host).
 *
 * @module dsh-harness-memory-bundle/ui/section-store
 */
import { type SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client';
import type { MemoryWire, WireAssetScope, WireIsolation } from './wire-client.ts';
/** One scope tab with a stable identity and its isolation coordinates. */
export interface ScopeTab {
    readonly key: WireAssetScope;
    /** Isolation coordinates resolved for the tab (empty for the default). */
    readonly isolation: WireIsolation;
}
/** The three scope tabs, in render order. */
export declare const SCOPE_TABS: readonly ScopeTab[];
/** One asset row a layer list renders. */
export interface AssetRow {
    readonly ref: string;
    readonly layer: 'L1' | 'L2' | 'L3';
    readonly title: string;
    readonly preview: string;
}
/** The pipeline-status summary for the active tab. */
export interface StatusSummary {
    readonly l0Count: number;
    readonly l1Count: number;
    readonly l2Count: number;
    readonly l3Count: number;
    /** The most recent extraction time across layers, or 0. */
    readonly lastExtractedAtMs: number;
}
/** The memory settings surface. */
export interface ConfigState {
    readonly enabled: boolean;
    readonly refinementPlan: string;
    readonly compressionMode: 'follow' | 'plan';
    readonly compressionPlan: string;
    readonly injectionLimit: number;
    readonly compressionLine: number;
    readonly retainLine: number;
}
/** The open view-detail state. */
export interface AssetDetail {
    readonly ref: string;
    readonly title: string;
    readonly content: string;
}
/** Page snapshot. */
export interface MemorySectionState {
    status: 'idle' | 'loading' | 'ready' | 'error';
    /** Whole-load failure text; a mutation failure stays on its surface. */
    error: string | null;
    /** The active scope tab. */
    active: WireAssetScope;
    /** The assets of the active tab, grouped by layer. */
    l1: readonly AssetRow[];
    l2: readonly AssetRow[];
    l3: readonly AssetRow[];
    /** The pipeline status for the active tab. */
    statusSummary: StatusSummary | null;
    /** The live memory settings. */
    config: ConfigState | null;
    /** The open view-detail asset, or null. */
    detail: AssetDetail | null;
    /** The asset awaiting delete confirmation. */
    pendingDelete: string | null;
    /** Whether a delete is in flight. */
    deleting: boolean;
    /** The role id being bound to (装配规则 input). */
    bindRoleId: string;
    /** The role's currently bound assets. */
    roleAssets: readonly string[];
}
/**
 * The memory settings section controller.
 */
export declare class MemorySectionController {
    private readonly wire;
    /** Page snapshot the renderer subscribes to. */
    readonly store: SnapshotStore<MemorySectionState>;
    constructor(wire: MemoryWire);
    private set;
    /** Load the active tab's assets + status and the settings (parallel). */
    load(): Promise<void>;
    /** Switch the active tab and reload its assets + status. */
    setActive(scope: WireAssetScope): Promise<void>;
    /** Reload the active tab's assets (used after a mutation). */
    private loadActiveTab;
    /** Reload just the status summary. */
    private loadStatus;
    /** Load the memory settings into the config surface. */
    private loadConfig;
    /** Open one asset's detail. */
    viewAsset(ref: string): Promise<void>;
    /** Close the detail. */
    closeDetail(): void;
    /** Ask for confirmation before deleting one asset. */
    confirmDelete(ref: string | null): void;
    /** Delete the asset awaiting confirmation, then reload the tab. */
    remove(): Promise<void>;
    /** Set the role id for the binding editor. */
    setBindRoleId(roleId: string): void;
    /** Load the assets bound to one role into the editor. */
    loadRoleBindings(roleId: string): Promise<void>;
    /** Bind one asset to the current role, then refresh the bindings. */
    bindAsset(ref: string): Promise<void>;
    /** Unbind one asset from the current role, then refresh the bindings. */
    unbindAsset(ref: string): Promise<void>;
}
//# sourceMappingURL=section-store.d.ts.map