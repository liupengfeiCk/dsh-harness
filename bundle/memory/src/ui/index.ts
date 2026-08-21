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

import type { ConnectionHandle } from '@deepseek-ai/dsh-api-remotes/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls the settings shell's SlotMap merge (the 'settings.section' entry).
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import { MemorySectionController } from './section-store.ts'
import type { MemorySectionInjected } from './MemorySection.tsx'
import { MemorySection } from './MemorySection.tsx'
import { createMemoryWire } from './wire-client.ts'
import { en, zh } from './locales.ts'

export type {
  MemorySectionState, AssetRow, ScopeTab, StatusSummary, ConfigState, AssetDetail,
} from './section-store.ts'
export { SCOPE_TABS, MemorySectionController } from './section-store.ts'
export type { MemoryKey } from './locales.ts'
export type { MemoryWire, WireAssetScope, WireIsolation, WireAssetEntry, WireScopeAssets, WireScopeStatus, WireMemorySettings } from './wire-client.ts'

/** Required services (cordis fiber inject). */
export const inject = ['slots', 'locale', 'connection', 'remote']

/**
 * Mount the memory settings section.
 * @param ctx - the browser plugin context.
 */
export function apply(ctx: ClientContext): void {
  const { rpc } = ctx.get('connection') as ConnectionHandle
  const wire = createMemoryWire(rpc)
  const section = new MemorySectionController(wire)

  ctx.effect(() => ctx.locale.register('settings.memory', { zh, en }), 'ui-memory: settings section dictionary')

  ctx.effect(() => {
    const refresh = (): void => {
      if (section.store.getSnapshot().status !== 'idle') void section.load()
    }
    const disposers = [
      ctx.on('connection/reset', () => { refresh() }),
    ]
    return () => { for (const dispose of disposers) dispose() }
  }, 'ui-memory: section refresh')

  const sectionInjected = (): MemorySectionInjected => ({
    hooks: { memorySection: section.store },
    load: () => section.load(),
    setActive: (scope) => section.setActive(scope),
    viewAsset: (ref) => section.viewAsset(ref),
    closeDetail: () => { section.closeDetail() },
    confirmDelete: (ref) => { section.confirmDelete(ref) },
    remove: () => section.remove(),
    setBindRoleId: (roleId) => { section.setBindRoleId(roleId) },
    loadRoleBindings: (roleId) => section.loadRoleBindings(roleId),
    bindAsset: (ref) => section.bindAsset(ref),
    unbindAsset: (ref) => section.unbindAsset(ref),
  })

  // Register the independent "记忆" section beside the "团队" and "模型方案"
  // sections (order 24, one after model-plans' 23).
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'memory',
    order: 24,
    label: () => ctx.locale.bind('settings.memory')('nav'),
    locale: 'settings.memory',
    inject: sectionInjected,
  }, MemorySection))
}
