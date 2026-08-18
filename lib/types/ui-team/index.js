/**
 * User-defined team surface plugin, browser half — an independent settings
 * section ("团队"/"编制表") parallel to the subagent section, over its OWN
 * roster (the team registry), fully separate from both the agent-preset list
 * and the subagent list.
 *
 * The section lists every user-defined team with its name, description, role
 * count, and an enable/disable switch on the row, and drives create, edit
 * (over the full role roster), delete, and open-directory through the host.
 *
 * The section's apply is called from the package's single browser client
 * entry (`src/ui/index.ts`) so both settings sections ship in one client
 * bundle; the `settings.subagentTeam` locale namespace keeps its copy apart
 * from the subagent section's `settings.subagentPreset`.
 */
import { TeamSectionController } from "./section-store.js";
import { TeamSection } from "./TeamSection.js";
import { createTeamPresetWire } from "./wire-client.js";
import { en, zh } from "./locales.js";
export { createBlocker, detailBlocker, TeamSectionController } from "./section-store.js";
/** Required services (cordis fiber inject), shared with the subagent section. */
export const inject = ['slots', 'locale', 'connection', 'remote'];
/**
 * Mount the independent "团队" settings section.
 * @param ctx - the browser plugin context.
 */
export function apply(ctx) {
    const { api, rpc } = ctx.get('connection');
    const section = new TeamSectionController({
        ...api,
        teamPresets: createTeamPresetWire(rpc),
    });
    ctx.effect(() => ctx.locale.register('settings.subagentTeam', { zh, en }), 'ui-teams: settings section dictionary');
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
    }, 'ui-teams: roster refresh');
    const sectionInjected = () => ({
        hooks: { teamSection: section.store },
        load: () => section.load(),
        beginCreate: () => { section.beginCreate(); },
        cancelCreate: () => { section.cancelCreate(); },
        setCreateId: (id) => { section.setCreateId(id); },
        setCreateName: (name) => { section.setCreateName(name); },
        setCreateRoleField: (index, field, value) => { section.setCreateRoleField(index, field, value); },
        addCreateRole: () => { section.addCreateRole(); },
        removeCreateRole: (index) => { section.removeCreateRole(index); },
        confirmCreate: () => section.confirmCreate(),
        toggle: (id, enabled) => { void section.toggle(id, enabled); },
        beginDetail: (id) => section.beginDetail(id),
        closeDetail: () => { section.closeDetail(); },
        setDetailName: (name) => { section.setDetailName(name); },
        setDetailDescription: (description) => { section.setDetailDescription(description); },
        setDetailRoleField: (index, field, value) => { section.setDetailRoleField(index, field, value); },
        addDetailRole: () => { section.addDetailRole(); },
        removeDetailRole: (index) => { section.removeDetailRole(index); },
        confirmDetail: () => section.confirmDetail(),
        openLocation: (id) => section.openLocation(id),
        confirmDelete: (id) => { section.confirmDelete(id); },
        remove: () => section.remove(),
    });
    // Register the independent "团队" section beside the "子代理" section (order
    // 22, one after 21). Parallel to the subagent section but reading the team
    // registry, so the rosters never mix.
    ctx.slots.inject('settings.section', () => ctx.slots.register({
        name: 'settings.section',
        id: 'teams',
        order: 22,
        label: () => ctx.locale.bind('settings.subagentTeam')('nav'),
        locale: 'settings.subagentTeam',
        inject: sectionInjected,
    }, TeamSection));
}
//# sourceMappingURL=index.js.map