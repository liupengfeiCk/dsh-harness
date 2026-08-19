/**
 * Model-plan surface plugin, browser half — an independent settings section
 * ("模型方案") plus the composer model-seat selector, both over the `/model-plan`
 * wire channel.
 *
 * The settings section lists every user-defined plan with its name, model,
 * param summary, default marker, and broken flag, and drives create/edit (over
 * a staged draft with a provider-grouped model pick and a params bag),
 * set-default, and delete. The composer model seat replaces the official model
 * selector with a plan-bound picker.
 *
 * The section's apply is called from the package's single browser client entry
 * so both surfaces ship in one client bundle; the `settings.modelPlan` locale
 * namespace keeps the copy apart from the subagent/team sections'.
 */

import type { ConnectionHandle } from '@deepseek-ai/dsh-api-remotes/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls the settings shell's SlotMap merge (the 'settings.section' entry).
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
// Type-only: pulls the ui-conversation SlotMap merge (`conversation.input.model`).
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import { ModelPlanSectionController } from './section-store.ts'
import type { ModelPlanSectionInjected } from './ModelPlanSection.tsx'
import { ModelPlanSection } from './ModelPlanSection.tsx'
import { ModelCatalogController } from './directory.ts'
import { ModelPlanChipController } from './mode-store.ts'
import type { ModelPlanChipInjected } from './ModelPlanChip.tsx'
import { ModelPlanChip } from './ModelPlanChip.tsx'
import { createModelPlanWire } from './wire-client.ts'
import { en, zh } from './locales.ts'

export type {
  ParamDraft, PlanDraft, PlanRow, ModelPlanSectionState,
} from './section-store.ts'
export { isJsonValue, planBlocker, KNOWN_KEYS, ModelPlanSectionController } from './section-store.ts'
export type { ModelCatalogState } from './directory.ts'
export { ModelCatalogController } from './directory.ts'
export type { ChipOption, ModelPlanChipState } from './mode-store.ts'
export { ModelPlanChipController } from './mode-store.ts'
export type { ModelPlanKey } from './locales.ts'
export type { ModelPlanWire, WirePlanEntry, WireParams } from './wire-client.ts'

/** Required services (cordis fiber inject). */
export const inject = ['slots', 'locale', 'connection', 'remote']

/**
 * Mount the model-plan settings section and the composer model-seat selector.
 * @param ctx - the browser plugin context.
 */
export function apply(ctx: ClientContext): void {
  const { api, rpc } = ctx.get('connection') as ConnectionHandle
  const plans = createModelPlanWire(rpc)
  const section = new ModelPlanSectionController(plans)
  const catalog = new ModelCatalogController(api.llm)

  ctx.effect(() => ctx.locale.register('settings.modelPlan', { zh, en }), 'ui-model-plan: settings section dictionary')

  ctx.effect(() => {
    const refresh = (): void => {
      if (section.store.getSnapshot().status !== 'idle') void section.load()
    }
    const disposers = [
      ctx.on('connection/reset', () => { refresh() }),
    ]
    return () => { for (const dispose of disposers) dispose() }
  }, 'ui-model-plan: roster refresh')

  const sectionInjected = (): ModelPlanSectionInjected => ({
    hooks: { modelPlanSection: section.store, modelCatalog: catalog.store },
    load: () => section.load(),
    loadCatalog: () => catalog.load(),
    beginCreate: () => { section.beginCreate() },
    beginEdit: (id) => section.beginEdit(id),
    closeDialog: () => { section.closeDialog() },
    setDialogId: (id) => { section.setDialogId(id) },
    setDialogName: (name) => { section.setDialogName(name) },
    setDialogProvider: (provider) => { section.setDialogProvider(provider) },
    setDialogModel: (model) => { section.setDialogModel(model) },
    setParamKey: (index, key) => { section.setParamKey(index, key) },
    setParamValue: (index, value) => { section.setParamValue(index, value) },
    addParam: () => { section.addParam() },
    removeParam: (index) => { section.removeParam(index) },
    setReasoningEffort: (effort) => { section.setReasoningEffort(effort) },
    confirmCreate: () => section.confirmCreate(),
    confirmEdit: () => section.confirmEdit(),
    setDefault: (id) => { void section.setDefault(id) },
    confirmDelete: (id) => { section.confirmDelete(id) },
    remove: () => section.remove(),
  })

  // Register the independent "模型方案" section beside the "团队" section
  // (order 23, one after 22).
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'model-plans',
    order: 23,
    label: () => ctx.locale.bind('settings.modelPlan')('nav'),
    locale: 'settings.modelPlan',
    inject: sectionInjected,
  }, ModelPlanSection))

  // Register the composer model-seat selector. Single-occupant: taking
  // `conversation.input.model` replaces the official model selector. Each
  // session gets its own controller (the binding is a per-session dimension),
  // created on the slot's session-scoped inject.
  // No `priority`: the browser-half facade assigns a facade-low priority
  // automatically (LOWER than every shipped entry), which is what makes this
  // single cell render OUR chip instead of the shipped model selector.
  ctx.slots.inject('conversation.input.model', () => ctx.slots.register({
    name: 'conversation.input.model',
    locale: 'settings.modelPlan',
    inject: (sessionId: string): ModelPlanChipInjected => {
      const chip = new ModelPlanChipController(plans, sessionId)
      return {
        hooks: { modelPlanChip: chip.store },
        load: () => chip.load(),
        select: (planId, overrides) => chip.select(planId, overrides),
      }
    },
  }, ModelPlanChip))
}
