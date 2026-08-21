/**
 * Memory surface plugin, browser half — the "记忆" settings section over the
 * `/memory` wire channel.
 *
 * The section lists the three scope tabs (team / team+role / project), each
 * showing the three memory layers (L1 / L2 / L3), and drives view-detail,
 * delete (with confirmation), role↔asset binding (装配规则), the pipeline
 * status summary, and the live memory configuration.
 *
 * The section's apply is called from the package's single browser client entry
 * so the whole surface ships in one client bundle; the `settings.memory` locale
 * namespace keeps the copy apart from the model-plan section's.
 *
 * @module dsh-harness-memory-bundle/ui
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client';
export type { MemorySectionState, AssetRow, ScopeTab, StatusSummary, ConfigState, AssetDetail, } from './section-store.ts';
export { SCOPE_TABS, MemorySectionController } from './section-store.ts';
export type { MemoryKey } from './locales.ts';
export type { MemoryWire, WireAssetScope, WireIsolation, WireAssetEntry, WireScopeAssets, WireScopeStatus, WireMemorySettings } from './wire-client.ts';
/** Required services (cordis fiber inject). */
export declare const inject: string[];
/**
 * Mount the memory settings section.
 * @param ctx - the browser plugin context.
 */
export declare function apply(ctx: ClientContext): void;
//# sourceMappingURL=index.d.ts.map