/**
 * User-defined subagent surface plugin, browser half — an independent
 * settings section ("子代理") parallel to the agent-preset section, over its
 * OWN roster (the subagent registry), fully separate from the agent-preset
 * list.
 *
 * The section lists every user-defined subagent with its mode, Auto Run,
 * description, and an enable/disable switch on the row, and drives create,
 * edit, delete, and open-directory through the host.
 */

import type { ConnectionHandle, RpcResult } from '@deepseek-ai/dsh-api-remotes/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls the settings shell's SlotMap merge (the 'settings.section' entry).
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import { SubagentSectionController, type PlanWireEntry } from './section-store.ts'
import type { SubagentSectionInjected } from './SubagentPresetSection.tsx'
import { SubagentPresetSection } from './SubagentPresetSection.tsx'
import { createSubagentPresetWire } from './wire-client.ts'
import type { PlanListWire } from './section-store.ts'
import { en, zh } from './locales.ts'

/**
 * The model-plan management channel, served by the model-plan bundle's Host
 * half. The subagent surface reads only its `list` endpoint (to feed the edit
 * dialog's plan picker) and never imports the model-plan bundle's own wire, so
 * this constant mirrors the one that bundle publishes.
 */
export const MODEL_PLAN_CHANNEL = '/model-plan'
// The independent "团队" (编制表) settings section rides the same single
// browser client entry, so both sections ship in one client bundle.
import { apply as applyTeamSection } from '../ui-team/index.ts'

export type {
  CreateDraft, EditDraft, PlanListWire, PlanWireEntry, SubagentRow, SubagentSectionState,
} from './section-store.ts'
export { createBlocker, plansListEntries, SubagentSectionController } from './section-store.ts'
export type { SubagentSettingsKey } from './locales.ts'

/** Required services (cordis fiber inject). */
export const inject = ['slots', 'locale', 'connection', 'remote']

/**
 * Mount the independent "子代理" settings section.
 * @param ctx - the browser plugin context.
 */
export function apply(ctx: ClientContext): void {
  const { api, rpc } = ctx.get('connection') as ConnectionHandle
  // The model-plan roster, for the edit dialog's plan picker. Read structurally
  // over the `/model-plan` channel — the only seam to the model-plan bundle —
  // so a plan a subagent may bind never drifts from what the deployment serves.
  const plans: PlanListWire = {
    list: (payload) => rpc.call(
      MODEL_PLAN_CHANNEL, 'list', payload,
    ) as Promise<RpcResult<{ plans: readonly PlanWireEntry[]; authorable: boolean }>>,
  }
  const section = new SubagentSectionController({
    ...api,
    subagentPresets: createSubagentPresetWire(rpc),
  }, plans)

  ctx.effect(() => ctx.locale.register('settings.subagentPreset', { zh, en }), 'ui-subagent-preset: settings section dictionary')

  ctx.effect(() => {
    const refresh = (): void => {
      if (section.store.getSnapshot().status !== 'idle') void section.load()
    }
    const disposers = [
      ctx.on('connection/reset', () => { refresh() }),
    ]
    return () => { for (const dispose of disposers) dispose() }
  }, 'ui-subagent-preset: roster refresh')

  const sectionInjected = (): SubagentSectionInjected => ({
    hooks: { subagentSection: section.store },
    load: () => section.load(),
    beginCreate: (from: string) => { section.beginCreate(from) },
    cancelCreate: () => { section.cancelCreate() },
    setCreateId: (id: string) => { section.setCreateId(id) },
    confirmCreate: () => section.confirmCreate(),
    toggle: (id: string, enabled: boolean) => { void section.toggle(id, enabled) },
    beginView: (id: string) => section.beginView(id),
    closeView: () => { section.closeView() },
    beginEdit: (id: string) => section.beginEdit(id),
    cancelEdit: () => { section.cancelEdit() },
    setEditField: (scope: string, field: string, value: string | boolean) => { section.setEditField(scope, field, value) },
    confirmEdit: () => section.confirmEdit(),
    openLocation: (id: string) => section.openLocation(id),
    confirmDelete: (id: string | null) => { section.confirmDelete(id) },
    remove: () => section.remove(),
  })

  // Register the independent "子代理" section beside "Agent 预设". Parallel to
  // the agent-preset section but reading the subagent registry, so the two
  // surfaces never mix.
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'subagent-presets',
    order: 21,
    label: () => ctx.locale.bind('settings.subagentPreset')('nav'),
    locale: 'settings.subagentPreset',
    inject: sectionInjected,
  }, SubagentPresetSection))

  // The team settings section ("团队"/"编制表") shares this client bundle's
  // entry and services, so it is mounted here beside the subagent section.
  applyTeamSection(ctx)
}
