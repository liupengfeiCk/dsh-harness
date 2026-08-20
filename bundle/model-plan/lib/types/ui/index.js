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
import { ModelPlanSectionController } from "./section-store.js";
import { ModelPlanSection } from "./ModelPlanSection.js";
import { ModelCatalogController } from "./directory.js";
import { ModelPlanChipController } from "./mode-store.js";
import { ModelPlanChip } from "./ModelPlanChip.js";
import { createModelPlanWire } from "./wire-client.js";
import { en, zh } from "./locales.js";
export { isJsonValue, planBlocker, KNOWN_KEYS, ModelPlanSectionController } from "./section-store.js";
export { ModelCatalogController } from "./directory.js";
export { ModelPlanChipController } from "./mode-store.js";
/** Required services (cordis fiber inject). */
export const inject = ['slots', 'locale', 'connection', 'remote'];
/**
 * Mount the model-plan settings section and the composer model-seat selector.
 * @param ctx - the browser plugin context.
 */
export function apply(ctx) {
    const { api, rpc } = ctx.get('connection');
    const plans = createModelPlanWire(rpc);
    const section = new ModelPlanSectionController(plans);
    const catalog = new ModelCatalogController(api.llm);
    ctx.effect(() => ctx.locale.register('settings.modelPlan', { zh, en }), 'ui-model-plan: settings section dictionary');
    ctx.effect(() => {
        const refresh = () => {
            if (section.store.getSnapshot().status !== 'idle')
                void section.load();
        };
        const disposers = [
            ctx.on('connection/reset', () => { refresh(); }),
        ];
        return () => { for (const dispose of disposers)
            dispose(); };
    }, 'ui-model-plan: roster refresh');
    const sectionInjected = () => ({
        hooks: { modelPlanSection: section.store, modelCatalog: catalog.store },
        load: () => section.load(),
        loadCatalog: () => catalog.load(),
        beginCreate: () => { section.beginCreate(); },
        beginEdit: (id) => section.beginEdit(id),
        closeDialog: () => { section.closeDialog(); },
        setDialogId: (id) => { section.setDialogId(id); },
        setDialogProvider: (provider) => { section.setDialogProvider(provider); },
        setDialogModel: (model) => { section.setDialogModel(model); },
        setParamKey: (index, key) => { section.setParamKey(index, key); },
        setParamValue: (index, value) => { section.setParamValue(index, value); },
        addParam: () => { section.addParam(); },
        removeParam: (index) => { section.removeParam(index); },
        confirmCreate: () => section.confirmCreate(),
        confirmEdit: () => section.confirmEdit(),
        setDefault: (id) => { void section.setDefault(id); },
        confirmDelete: (id) => { section.confirmDelete(id); },
        remove: () => section.remove(),
    });
    // Register the independent "模型方案" section beside the "团队" section
    // (order 23, one after 22).
    ctx.slots.inject('settings.section', () => ctx.slots.register({
        name: 'settings.section',
        id: 'model-plans',
        order: 23,
        label: () => ctx.locale.bind('settings.modelPlan')('nav'),
        locale: 'settings.modelPlan',
        inject: sectionInjected,
    }, ModelPlanSection));
    // Register the composer model-seat selector. Single-occupant: taking
    // `conversation.input.model` replaces the official model selector. Each
    // session gets its own controller (the binding is a per-session dimension),
    // created on the slot's session-scoped inject.
    // Shadow the shipped model selector at a distinct, LOWER priority: the
    // single cell rejects two registrations at the same priority, and the lowest
    // priority renders — so registering below the shipped entry (priority 0)
    // is what makes OUR chip the one that renders.
    ctx.slots.inject('conversation.input.model', () => ctx.slots.register({
        name: 'conversation.input.model',
        priority: -1,
        locale: 'settings.modelPlan',
        inject: (sessionId) => {
            const chip = new ModelPlanChipController(plans, sessionId);
            return {
                hooks: { modelPlanChip: chip.store },
                load: () => chip.load(),
                select: (planId, overrides) => chip.select(planId, overrides),
            };
        },
    }, ModelPlanChip));
}
//# sourceMappingURL=index.js.map