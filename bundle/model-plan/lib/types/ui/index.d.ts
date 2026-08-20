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
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client';
export type { ParamDraft, PlanDraft, PlanRow, ModelPlanSectionState, } from './section-store.ts';
export { isJsonValue, planBlocker, KNOWN_KEYS, ModelPlanSectionController } from './section-store.ts';
export type { ModelCatalogState } from './directory.ts';
export { ModelCatalogController } from './directory.ts';
export type { ChipOption, ModelPlanChipState } from './mode-store.ts';
export { ModelPlanChipController } from './mode-store.ts';
export type { ModelPlanKey } from './locales.ts';
export type { ModelPlanWire, WirePlanEntry, WireParams } from './wire-client.ts';
/** Required services (cordis fiber inject). */
export declare const inject: string[];
/**
 * Mount the model-plan settings section and the composer model-seat selector.
 * @param ctx - the browser plugin context.
 */
export declare function apply(ctx: ClientContext): void;
//# sourceMappingURL=index.d.ts.map