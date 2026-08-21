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

import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type {
  MemoryWire, WireAssetEntry, WireAssetScope, WireIsolation, WireMemorySettings, WireScopeStatus,
} from './wire-client.ts'

/** One scope tab with a stable identity and its isolation coordinates. */
export interface ScopeTab {
  readonly key: WireAssetScope
  /** Isolation coordinates resolved for the tab (empty for the default). */
  readonly isolation: WireIsolation
}

/** The three scope tabs, in render order. */
export const SCOPE_TABS: readonly ScopeTab[] = [
  { key: 'team', isolation: {} },
  { key: 'teamRole', isolation: {} },
  { key: 'project', isolation: {} },
]

/** One asset row a layer list renders. */
export interface AssetRow {
  readonly ref: string
  readonly layer: 'L1' | 'L2' | 'L3'
  readonly title: string
  readonly preview: string
}

/** The pipeline-status summary for the active tab. */
export interface StatusSummary {
  readonly l0Count: number
  readonly l1Count: number
  readonly l2Count: number
  readonly l3Count: number
  /** The most recent extraction time across layers, or 0. */
  readonly lastExtractedAtMs: number
}

/** The memory settings surface. */
export interface ConfigState {
  readonly enabled: boolean
  readonly refinementPlan: string
  readonly compressionMode: 'follow' | 'plan'
  readonly compressionPlan: string
  readonly injectionLimit: number
  readonly compressionLine: number
  readonly retainLine: number
}

/** The open view-detail state. */
export interface AssetDetail {
  readonly ref: string
  readonly title: string
  readonly content: string
}

/** Page snapshot. */
export interface MemorySectionState {
  status: 'idle' | 'loading' | 'ready' | 'error'
  /** Whole-load failure text; a mutation failure stays on its surface. */
  error: string | null
  /** The active scope tab. */
  active: WireAssetScope
  /** The assets of the active tab, grouped by layer. */
  l1: readonly AssetRow[]
  l2: readonly AssetRow[]
  l3: readonly AssetRow[]
  /** The pipeline status for the active tab. */
  statusSummary: StatusSummary | null
  /** The live memory settings. */
  config: ConfigState | null
  /** The open view-detail asset, or null. */
  detail: AssetDetail | null
  /** The asset awaiting delete confirmation. */
  pendingDelete: string | null
  /** Whether a delete is in flight. */
  deleting: boolean
  /** The role id being bound to (装配规则 input). */
  bindRoleId: string
  /** The role's currently bound assets. */
  roleAssets: readonly string[]
}

const INITIAL: MemorySectionState = {
  status: 'idle',
  error: null,
  active: 'team',
  l1: [],
  l2: [],
  l3: [],
  statusSummary: null,
  config: null,
  detail: null,
  pendingDelete: null,
  deleting: false,
  bindRoleId: '',
  roleAssets: [],
}

/** Map one wire asset entry onto a render row. */
function assetRow(entry: WireAssetEntry): AssetRow {
  return {
    ref: entry.ref,
    layer: entry.layer,
    title: entry.title,
    preview: entry.preview,
  }
}

/**
 * The memory settings section controller.
 */
export class MemorySectionController {
  /** Page snapshot the renderer subscribes to. */
  readonly store: SnapshotStore<MemorySectionState> = createSnapshotStore(INITIAL)

  constructor(private readonly wire: MemoryWire) {}

  private set(patch: Partial<MemorySectionState>): void {
    this.store.set({ ...this.store.getSnapshot(), ...patch })
  }

  /** Load the active tab's assets + status and the settings (parallel). */
  async load(): Promise<void> {
    const before = this.store.getSnapshot()
    if (before.status === 'loading') return
    this.set({ status: 'loading', error: null })
    await Promise.all([this.loadActiveTab(), this.loadConfig()])
    this.set({ status: 'ready', error: null })
  }

  /** Switch the active tab and reload its assets + status. */
  async setActive(scope: WireAssetScope): Promise<void> {
    const before = this.store.getSnapshot()
    if (before.active === scope) return
    this.set({ active: scope, status: 'loading', error: null, detail: null, pendingDelete: null })
    await Promise.all([this.loadActiveTab(), this.loadStatus()])
    this.set({ status: 'ready', error: null })
  }

  /** Reload the active tab's assets (used after a mutation). */
  private async loadActiveTab(): Promise<void> {
    const { active } = this.store.getSnapshot()
    const tab = SCOPE_TABS.find(t => t.key === active) ?? SCOPE_TABS[0]
    if (tab === undefined) return
    const [assetsResult, statusResult] = await Promise.all([
      this.wire.assets({ scope: active, isolation: tab.isolation }),
      this.wire.status({ scope: active, isolation: tab.isolation }),
    ])
    if (assetsResult.ok) {
      this.set({
        l1: assetsResult.value.l1.map(assetRow),
        l2: assetsResult.value.l2.map(assetRow),
        l3: assetsResult.value.l3.map(assetRow),
      })
    } else {
      this.set({ error: assetsResult.error.message })
      return
    }
    if (statusResult.ok) {
      this.set({ statusSummary: statusOf(statusResult.value) })
    }
  }

  /** Reload just the status summary. */
  private async loadStatus(): Promise<void> {
    const { active } = this.store.getSnapshot()
    const tab = SCOPE_TABS.find(t => t.key === active) ?? SCOPE_TABS[0]
    if (tab === undefined) return
    const result = await this.wire.status({ scope: active, isolation: tab.isolation })
    if (result.ok) this.set({ statusSummary: statusOf(result.value) })
  }

  /** Load the memory settings into the config surface. */
  private async loadConfig(): Promise<void> {
    const result = await this.wire.config({})
    if (!result.ok) return
    this.set({ config: configOf(result.value) })
  }

  /** Open one asset's detail. */
  async viewAsset(ref: string): Promise<void> {
    const result = await this.wire.assetRead({ ref })
    if (!result.ok) {
      this.set({ error: result.error.message })
      return
    }
    this.set({ detail: { ref, title: result.value.title, content: result.value.content } })
  }

  /** Close the detail. */
  closeDetail(): void {
    this.set({ detail: null })
  }

  /** Ask for confirmation before deleting one asset. */
  confirmDelete(ref: string | null): void {
    if (this.store.getSnapshot().deleting) return
    this.set({ pendingDelete: ref })
  }

  /** Delete the asset awaiting confirmation, then reload the tab. */
  async remove(): Promise<void> {
    const { pendingDelete, deleting } = this.store.getSnapshot()
    if (pendingDelete === null || deleting) return
    this.set({ deleting: true, error: null })
    const result = await this.wire.assetDelete({ ref: pendingDelete })
    if (!result.ok) {
      this.set({ deleting: false, pendingDelete: null, error: result.error.message })
      return
    }
    this.set({ deleting: false, pendingDelete: null })
    await this.loadActiveTab()
  }

  /** Set the role id for the binding editor. */
  setBindRoleId(roleId: string): void {
    this.set({ bindRoleId: roleId, error: null })
  }

  /** Load the assets bound to one role into the editor. */
  async loadRoleBindings(roleId: string): Promise<void> {
    const result = await this.wire.roleBindings({ roleId })
    if (!result.ok) {
      this.set({ error: result.error.message })
      return
    }
    this.set({ bindRoleId: roleId, roleAssets: result.value.assets })
  }

  /** Bind one asset to the current role, then refresh the bindings. */
  async bindAsset(ref: string): Promise<void> {
    const { bindRoleId } = this.store.getSnapshot()
    if (bindRoleId === '') return
    const result = await this.wire.bindRole({ roleId: bindRoleId, assetRef: ref })
    if (!result.ok) {
      this.set({ error: result.error.message })
      return
    }
    this.set({ roleAssets: result.value.assets })
  }

  /** Unbind one asset from the current role, then refresh the bindings. */
  async unbindAsset(ref: string): Promise<void> {
    const { bindRoleId } = this.store.getSnapshot()
    if (bindRoleId === '') return
    const result = await this.wire.unbindRole({ roleId: bindRoleId, assetRef: ref })
    if (!result.ok) {
      this.set({ error: result.error.message })
      return
    }
    this.set({ roleAssets: result.value.assets })
  }
}

/** Map one wire status onto the summary shape. */
function statusOf(status: WireScopeStatus): StatusSummary {
  return {
    l0Count: status.l0Count,
    l1Count: status.l1Count,
    l2Count: status.l2Count,
    l3Count: status.l3Count,
    lastExtractedAtMs: status.lastExtractedAtMs,
  }
}

/** Map one wire settings value onto the config surface. */
function configOf(settings: WireMemorySettings): ConfigState {
  return {
    enabled: settings.enabled,
    refinementPlan: settings.refinementPlan,
    compressionMode: settings.compression.mode,
    compressionPlan: settings.compression.planId,
    injectionLimit: settings.injectionLimit,
    compressionLine: settings.compressionLine,
    retainLine: settings.retainLine,
  }
}
