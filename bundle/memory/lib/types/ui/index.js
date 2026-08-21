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
import { MemorySectionController } from "./section-store.js";
import { MemorySection } from "./MemorySection.js";
import { createMemoryWire } from "./wire-client.js";
import { en, zh } from "./locales.js";
export { SCOPE_TABS, MemorySectionController } from "./section-store.js";
/** Required services (cordis fiber inject). */
export const inject = ['slots', 'locale', 'connection', 'remote'];
/**
 * Mount the memory settings section.
 * @param ctx - the browser plugin context.
 */
export function apply(ctx) {
    const { rpc } = ctx.get('connection');
    const wire = createMemoryWire(rpc);
    const section = new MemorySectionController(wire);
    ctx.effect(() => ctx.locale.register('settings.memory', { zh, en }), 'ui-memory: settings section dictionary');
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
    }, 'ui-memory: section refresh');
    const sectionInjected = () => ({
        hooks: { memorySection: section.store },
        load: () => section.load(),
        setActive: (scope) => section.setActive(scope),
        viewAsset: (ref) => section.viewAsset(ref),
        closeDetail: () => { section.closeDetail(); },
        confirmDelete: (ref) => { section.confirmDelete(ref); },
        remove: () => section.remove(),
        setBindRoleId: (roleId) => { section.setBindRoleId(roleId); },
        loadRoleBindings: (roleId) => section.loadRoleBindings(roleId),
        bindAsset: (ref) => section.bindAsset(ref),
        unbindAsset: (ref) => section.unbindAsset(ref),
    });
    // Register the independent "记忆" section beside the "团队" and "模型方案"
    // sections (order 24, one after model-plans' 23).
    ctx.slots.inject('settings.section', () => ctx.slots.register({
        name: 'settings.section',
        id: 'memory',
        order: 24,
        label: () => ctx.locale.bind('settings.memory')('nav'),
        locale: 'settings.memory',
        inject: sectionInjected,
    }, MemorySection));
}
//# sourceMappingURL=index.js.map