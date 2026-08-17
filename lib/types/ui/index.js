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
import { SubagentSectionController } from "./section-store.js";
import { SubagentPresetSection } from "./SubagentPresetSection.js";
import { createSubagentPresetWire } from "./wire-client.js";
import { en, zh } from "./locales.js";
export { createBlocker, SubagentSectionController } from "./section-store.js";
/** Required services (cordis fiber inject). */
export const inject = ['slots', 'locale', 'connection', 'remote'];
/**
 * Mount the independent "子代理" settings section.
 * @param ctx - the browser plugin context.
 */
export function apply(ctx) {
    const { api, rpc } = ctx.get('connection');
    const section = new SubagentSectionController({
        ...api,
        subagentPresets: createSubagentPresetWire(rpc),
    });
    ctx.effect(() => ctx.locale.register('settings.subagentPreset', { zh, en }), 'ui-subagent-preset: settings section dictionary');
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
    }, 'ui-subagent-preset: roster refresh');
    const sectionInjected = () => ({
        hooks: { subagentSection: section.store },
        load: () => section.load(),
        beginCreate: (from) => { section.beginCreate(from); },
        cancelCreate: () => { section.cancelCreate(); },
        setCreateId: (id) => { section.setCreateId(id); },
        confirmCreate: () => section.confirmCreate(),
        toggle: (id, enabled) => { void section.toggle(id, enabled); },
        beginView: (id) => section.beginView(id),
        closeView: () => { section.closeView(); },
        beginEdit: (id) => section.beginEdit(id),
        cancelEdit: () => { section.cancelEdit(); },
        setEditField: (scope, field, value) => { section.setEditField(scope, field, value); },
        confirmEdit: () => section.confirmEdit(),
        openLocation: (id) => section.openLocation(id),
        confirmDelete: (id) => { section.confirmDelete(id); },
        remove: () => section.remove(),
    });
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
    }, SubagentPresetSection));
}
//# sourceMappingURL=index.js.map