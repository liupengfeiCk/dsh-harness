/**
 * Memory management facade (host half, T14).
 *
 * The settings section needs read/write access to the memory engine's durable
 * assets and pipeline state, decoupled from the vendor internals. This module
 * is the single host-side manager the `/memory` wire calls:
 *   - enumerate assets grouped by scope (team / team+role / project) across
 *     the three layers (L1 records, L2 scene profiles, L3 personas),
 *   - read one asset's detail, delete one asset (with role-binding cleanup),
 *   - assemble role↔asset bindings (装配规则),
 *   - report pipeline status (L0/L1 counts, profile counts, last extraction),
 *   - expose the live `memory:` settings for the config surface.
 *
 * Layer mapping (design §4.1 三维正交 + profile-scope):
 *   - L1 atomic facts   — rows in the store's L1 table, isolated by team/agent.
 *   - L2 scene profiles — `profiles/{scope}/scene_blocks/*.md` on disk.
 *   - L3 personas       — `profiles/{scope}/persona.md` on disk.
 *
 * @module dsh-harness-memory-bundle/memory/manager
 */
import { Memory } from './service.ts';
import { RoleBindingStore } from './binding-store.ts';
import type { MemorySettings } from '../config/schema.ts';
/** The three scoping tabs the settings section offers. */
export type AssetScope = 'team' | 'teamRole' | 'project';
/** Isolation coordinates for one scope tab. */
export interface ScopeIsolation {
    readonly teamId?: string;
    readonly roleId?: string;
    readonly projectId?: string;
}
/** One enumerated asset row across any layer. */
export interface AssetEntry {
    /** Stable reference used by read/delete/bind. */
    readonly ref: string;
    /** The asset layer. */
    readonly layer: 'L1' | 'L2' | 'L3';
    /** Short human label. */
    readonly title: string;
    /** Content preview (truncated). */
    readonly preview: string;
    /** Update/created timestamp for sorting. */
    readonly updatedAtMs: number;
}
/** One scope's assets across the three layers. */
export interface ScopeAssets {
    readonly scope: AssetScope;
    readonly isolation: ScopeIsolation;
    readonly l1: readonly AssetEntry[];
    readonly l2: readonly AssetEntry[];
    readonly l3: readonly AssetEntry[];
}
/** Pipeline status for one scope. */
export interface ScopeStatus {
    readonly scope: AssetScope;
    readonly isolation: ScopeIsolation;
    readonly l0Count: number;
    readonly l1Count: number;
    readonly l2Count: number;
    readonly l3Count: number;
    /** The most recent extraction time across layers (epoch ms), or 0. */
    readonly lastExtractedAtMs: number;
}
/** The memory management facade. */
export declare class MemoryManager {
    private readonly memory;
    readonly bindings: RoleBindingStore;
    constructor(memory: Memory, dataDir: string);
    /** The underlying store, when the engine's store is ready. */
    private store;
    /**
     * Enumerate one scope's assets across L1/L2/L3.
     * @param scope - the scoping tab.
     * @param isolation - the coordinates for that tab.
     */
    assets(scope: AssetScope, isolation?: ScopeIsolation): Promise<ScopeAssets>;
    /**
     * Read one asset's full content.
     * @param ref - the stable asset reference from an entry.
     */
    readAsset(ref: string): Promise<{
        title: string;
        content: string;
    } | undefined>;
    /**
     * Delete one asset, cleaning up any role bindings that referenced it.
     * @param ref - the stable asset reference.
     * @returns true when deleted, false when not found.
     */
    deleteAsset(ref: string): Promise<boolean>;
    /** Bind one asset to a role (装配规则). */
    bindRole(roleId: string, assetRef: string): Promise<void>;
    /** Remove one asset binding from a role. */
    unbindRole(roleId: string, assetRef: string): Promise<void>;
    /** The assets bound to one role. */
    roleBindings(roleId: string): Promise<readonly string[]>;
    /** Pipeline status across layers for one scope. */
    status(scope: AssetScope, isolation?: ScopeIsolation): Promise<ScopeStatus>;
    /** The live `memory:` settings for the config surface. */
    settings(): MemorySettings;
    /** Enumerate L1 records for the given isolation as asset entries. */
    private l1Entries;
    /** Resolve a `profile:` asset ref onto its profile record. */
    private profileForRef;
}
//# sourceMappingURL=manager.d.ts.map