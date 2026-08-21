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

import { join } from 'node:path'
import type { IMemoryStore, ProfileRecord } from '@tencentdb-agent-memory/memory-core-vendor/core/store/types'
import { listLocalProfiles } from '@tencentdb-agent-memory/memory-core-vendor/core/profile/profile-sync'
import { Memory } from './service.ts'
import { RoleBindingStore } from './binding-store.ts'
import { readMemorySettings } from '../config/index.ts'
import type { MemorySettings } from '../config/schema.ts'

/** The three scoping tabs the settings section offers. */
export type AssetScope = 'team' | 'teamRole' | 'project'

/** Isolation coordinates for one scope tab. */
export interface ScopeIsolation {
  readonly teamId?: string
  readonly roleId?: string
  readonly projectId?: string
}

/** One enumerated asset row across any layer. */
export interface AssetEntry {
  /** Stable reference used by read/delete/bind. */
  readonly ref: string
  /** The asset layer. */
  readonly layer: 'L1' | 'L2' | 'L3'
  /** Short human label. */
  readonly title: string
  /** Content preview (truncated). */
  readonly preview: string
  /** Update/created timestamp for sorting. */
  readonly updatedAtMs: number
}

/** One scope's assets across the three layers. */
export interface ScopeAssets {
  readonly scope: AssetScope
  readonly isolation: ScopeIsolation
  readonly l1: readonly AssetEntry[]
  readonly l2: readonly AssetEntry[]
  readonly l3: readonly AssetEntry[]
}

/** Pipeline status for one scope. */
export interface ScopeStatus {
  readonly scope: AssetScope
  readonly isolation: ScopeIsolation
  readonly l0Count: number
  readonly l1Count: number
  readonly l2Count: number
  readonly l3Count: number
  /** The most recent extraction time across layers (epoch ms), or 0. */
  readonly lastExtractedAtMs: number
}

/** The memory management facade. */
export class MemoryManager {
  readonly bindings: RoleBindingStore

  constructor(
    private readonly memory: Memory,
    dataDir: string,
  ) {
    this.bindings = new RoleBindingStore(join(dataDir, 'bindings.json'))
  }

  /** The underlying store, when the engine's store is ready. */
  private store(): IMemoryStore | undefined {
    return this.memory.core.getVectorStore()
  }

  /**
   * Enumerate one scope's assets across L1/L2/L3.
   * @param scope - the scoping tab.
   * @param isolation - the coordinates for that tab.
   */
  async assets(scope: AssetScope, isolation: ScopeIsolation = {}): Promise<ScopeAssets> {
    const scopeKey = scopeKeyOf(scope, isolation)
    const store = this.store()
    const l1 = store !== undefined
      ? await this.l1Entries(store, isolation)
      : []
    const profiles = await listLocalProfiles(this.memory.hostAdapter.dataDirPath)
    const scoped = profiles.filter(p => matchesProfileScope(p, scopeKey))
    const l2 = scoped.filter(p => p.type === 'l2').map(p => profileEntry('L2', p))
    const l3 = scoped.filter(p => p.type === 'l3').map(p => profileEntry('L3', p))
    return {
      scope,
      isolation,
      l1: l1.sort(byUpdated),
      l2: l2.sort(byUpdated),
      l3: l3.sort(byUpdated),
    }
  }

  /**
   * Read one asset's full content.
   * @param ref - the stable asset reference from an entry.
   */
  async readAsset(ref: string): Promise<{ title: string; content: string } | undefined> {
    if (ref.startsWith('record:')) {
      const id = ref.slice('record:'.length)
      const store = this.store()
      if (store === undefined) return undefined
      const rows = await store.queryL1Records({ recordIds: [id] })
      const row = rows[0]
      if (row === undefined) return undefined
      return { title: row.scene_name || row.record_id, content: row.content }
    }
    const profile = await this.profileForRef(ref)
    if (profile === undefined) return undefined
    return { title: profile.filename, content: profile.content }
  }

  /**
   * Delete one asset, cleaning up any role bindings that referenced it.
   * @param ref - the stable asset reference.
   * @returns true when deleted, false when not found.
   */
  async deleteAsset(ref: string): Promise<boolean> {
    let deleted = false
    if (ref.startsWith('record:')) {
      const id = ref.slice('record:'.length)
      const store = this.store()
      if (store !== undefined) {
        await store.deleteL1(id)
        deleted = true
      }
    } else {
      const profile = await this.profileForRef(ref)
      if (profile !== undefined) {
        const { unlink } = await import('node:fs/promises')
        const path = join(this.memory.hostAdapter.dataDirPath, 'profiles', profile.filename)
        await unlink(path).catch(() => {})
        deleted = true
      }
    }
    if (deleted) {
      for (const roleId of await this.bindings.roles()) {
        await this.bindings.unbind(roleId, ref)
      }
    }
    return deleted
  }

  /** Bind one asset to a role (装配规则). */
  async bindRole(roleId: string, assetRef: string): Promise<void> {
    await this.bindings.bind(roleId, assetRef)
  }

  /** Remove one asset binding from a role. */
  async unbindRole(roleId: string, assetRef: string): Promise<void> {
    await this.bindings.unbind(roleId, assetRef)
  }

  /** The assets bound to one role. */
  async roleBindings(roleId: string): Promise<readonly string[]> {
    return this.bindings.assetsFor(roleId)
  }

  /** Pipeline status across layers for one scope. */
  async status(scope: AssetScope, isolation: ScopeIsolation = {}): Promise<ScopeStatus> {
    const store = this.store()
    const scopeKey = scopeKeyOf(scope, isolation)
    const l0Count = store !== undefined ? await store.countL0(filterFor(isolation)) : 0
    const l1Count = store !== undefined ? await store.countL1(filterFor(isolation)) : 0
    const profiles = await listLocalProfiles(this.memory.hostAdapter.dataDirPath)
    const scoped = profiles.filter(p => matchesProfileScope(p, scopeKey))
    const l2Count = scoped.filter(p => p.type === 'l2').length
    const l3Count = scoped.filter(p => p.type === 'l3').length
    const lastExtractedAtMs = scoped.reduce((max, p) => Math.max(max, p.updatedAtMs), 0)
    return {
      scope,
      isolation,
      l0Count,
      l1Count,
      l2Count,
      l3Count,
      lastExtractedAtMs,
    }
  }

  /** The live `memory:` settings for the config surface. */
  settings(): MemorySettings {
    return readMemorySettings()
  }

  /** Enumerate L1 records for the given isolation as asset entries. */
  private async l1Entries(store: IMemoryStore, isolation: ScopeIsolation): Promise<AssetEntry[]> {
    const rows = await store.queryL1Records({
      ...isolation.teamId !== undefined ? { teamId: isolation.teamId } : {},
      ...isolation.roleId !== undefined ? { agentId: isolation.roleId } : {},
    })
    return rows.map(row => ({
      ref: `record:${row.record_id}`,
      layer: 'L1' as const,
      title: row.scene_name || row.record_id,
      preview: row.content.length > 120 ? `${row.content.slice(0, 120)}…` : row.content,
      updatedAtMs: Date.parse(row.updated_time) || Date.parse(row.timestamp_str) || 0,
    }))
  }

  /** Resolve a `profile:` asset ref onto its profile record. */
  private async profileForRef(ref: string): Promise<ProfileRecord | undefined> {
    if (!ref.startsWith('profile:')) return undefined
    const rest = ref.slice('profile:'.length)
    // filename is `{scope}/{type}/{file}`; split the first two segments.
    const typeIndex = rest.indexOf('/')
    const fileIndex = rest.indexOf('/', typeIndex + 1)
    if (typeIndex < 0 || fileIndex < 0) return undefined
    const type = rest.slice(typeIndex + 1, fileIndex)
    const filename = rest.slice(1)
    if (type !== 'l2' && type !== 'l3') return undefined
    const profiles = await listLocalProfiles(this.memory.hostAdapter.dataDirPath)
    return profiles.find(p => p.type === type && p.filename === filename)
  }
}

/** The profile-scope key for one scope tab. */
function scopeKeyOf(scope: AssetScope, isolation: ScopeIsolation): string {
  switch (scope) {
    case 'project':
      return `project:${isolation.projectId ?? ''}`
    case 'teamRole':
      return `team:${isolation.teamId ?? ''}|agent:${isolation.roleId ?? ''}`
    default:
      return `team:${isolation.teamId ?? ''}`
  }
}

/** Whether a profile record lives under the given scope key. */
function matchesProfileScope(profile: ProfileRecord, scopeKey: string): boolean {
  return profile.filename.startsWith(`${scopeKey}/`)
}

/** A profile record as an asset entry. */
function profileEntry(layer: 'L2' | 'L3', profile: ProfileRecord): AssetEntry {
  return {
    ref: `profile:${profile.filename}`,
    layer,
    title: profile.filename.split('/').pop() ?? profile.filename,
    preview: profile.content.length > 120 ? `${profile.content.slice(0, 120)}…` : profile.content,
    updatedAtMs: profile.updatedAtMs || profile.createdAtMs || 0,
  }
}

/** Sort entries newest-first. */
function byUpdated(a: AssetEntry, b: AssetEntry): number {
  return b.updatedAtMs - a.updatedAtMs
}

/** The L0/L1 count filter from isolation coordinates. */
function filterFor(isolation: ScopeIsolation): { teamId?: string; agentId?: string } {
  return {
    ...isolation.teamId !== undefined ? { teamId: isolation.teamId } : {},
    ...isolation.roleId !== undefined ? { agentId: isolation.roleId } : {},
  }
}
