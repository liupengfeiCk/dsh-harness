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
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client';
export type { CreateDraft, DetailDraft, RoleDraft, TeamRow, TeamSectionState, } from './section-store.ts';
export { createBlocker, detailBlocker, TeamSectionController } from './section-store.ts';
export type { TeamSettingsKey } from './locales.ts';
/** Required services (cordis fiber inject), shared with the subagent section. */
export declare const inject: string[];
/**
 * Mount the independent "团队" settings section.
 * @param ctx - the browser plugin context.
 */
export declare function apply(ctx: ClientContext): void;
//# sourceMappingURL=index.d.ts.map