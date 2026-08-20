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
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client';
/**
 * The model-plan management channel, served by the model-plan bundle's Host
 * half. The subagent surface reads only its `list` endpoint (to feed the edit
 * dialog's plan picker) and never imports the model-plan bundle's own wire, so
 * this constant mirrors the one that bundle publishes.
 */
export declare const MODEL_PLAN_CHANNEL = "/model-plan";
export type { CreateDraft, EditDraft, PlanListWire, PlanWireEntry, SubagentRow, SubagentSectionState, } from './section-store.ts';
export { createBlocker, plansListEntries, SubagentSectionController } from './section-store.ts';
export type { SubagentSettingsKey } from './locales.ts';
/** Required services (cordis fiber inject). */
export declare const inject: string[];
/**
 * Mount the independent "子代理" settings section.
 * @param ctx - the browser plugin context.
 */
export declare function apply(ctx: ClientContext): void;
//# sourceMappingURL=index.d.ts.map