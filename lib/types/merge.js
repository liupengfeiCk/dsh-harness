/**
 * The model-plan merge interceptor.
 *
 * This module produces the effective `LlmCallConfig` for one request by
 * layering a session's plan binding over the official route. It mounts as an
 * `agent/request` waterfall, exactly where the official model-selection layer
 * sits, and merges with the official precedence:
 *
 *   session overrides  >  plan params  >  model-profile defaults / deployment
 *                                        defaults (the official route already
 *                                        produced these via `next()`)
 *
 * A session with NO explicit binding (never selected a plan) falls back to the
 * deployment's DEFAULT plan, so "可设默认方案" is live: editing the default
 * plan changes what every unbound session uses on its next request (reference
 * semantics). Only when a session binds no plan AND no default exists does the
 * interceptor run zero-intervention on the official route.
 *
 * The merge then seals two channels:
 * - known keys (`temperature`, `reasoningEffort`, `maxTokens`, `stop`) land on
 *   native `LlmCallConfig` fields — they flow into the session ledger, the
 *   display, and child-agent inheritance automatically;
 * - every other key lands on `LlmCallConfig.extra` — an upstream-optional
 *   contract (`extra?: Record<string, JsonValue>`) that the model-selection
 *   workstream is landing on `LlmCallConfig`. Because the PUBLISHED
 *   `@deepseek-ai/dsh-llm` types do not yet carry `extra`, this module reaches
 *   the field through the same typed-escape hatch the bundle uses for
 *   `Session.append`'s `ignorable` — it is written against the contract, and
 *   the integration that lands the field consumes it unchanged.
 *
 * The provider's adapter may or may not forward `extra` (pi-ai, in particular,
 * is known not to forward unknown options). This module NEVER silently drops a
 * non-known key: whenever the merged bag carries one, it logs a warning naming
 * the risk, so a plan that expects an adapter to forward its extra params does
 * not fail quietly.
 *
 * Reference semantics: the interceptor re-resolves the bound plan on every
 * request, so editing a plan's `plan.yml` changes what a bound session uses on
 * its NEXT request without retrofitting the past.
 * @module dsh-harness-model-plan-bundle/merge
 */
/**
 * The keys a plan's params bag maps onto NATIVE `LlmCallConfig` fields. Any
 * other key maps onto `LlmCallConfig.extra` (see the module doc).
 */
export const KNOWN_KEYS = ['temperature', 'reasoningEffort', 'maxTokens', 'stop'];
/** Split a bag into the native fields it sets and the extra keys it does not. */
function splitBag(bag) {
    const native = {};
    const extra = {};
    for (const [key, value] of Object.entries(bag)) {
        if (KNOWN_KEYS.includes(key)) {
            native[key] = value;
        }
        else {
            extra[key] = value;
        }
    }
    return { native, extra };
}
/**
 * Merge a resolved plan's route + params with a session's overrides onto an
 * already-official config. The plan's provider/model/reasoningEffort land on
 * native fields so the requestHeader recorded for this request (and therefore
 * the display and child-agent inheritance) agrees with what actually ran.
 * @param base - the config the official route resolved via `next()`.
 * @param plan - the resolved plan's route and params.
 * @param overrides - session-level temporary params riding above the plan's.
 * @returns the merged config with the two sealed channels.
 */
export function mergePlanConfig(base, plan, overrides) {
    const bag = { ...plan.params, ...overrides };
    const { native, extra } = splitBag(bag);
    const config = {
        ...base,
        provider: plan.provider,
        model: plan.model,
        ...native,
        ...Object.keys(extra).length > 0 ? { extra } : {},
    };
    return { config, warnedExtra: Object.keys(extra) };
}
/**
 * Build the `agent/request` waterfall handler: merge a session's plan binding
 * over the official route, or hand the official config through untouched when
 * the session binds no plan (zero intervention on the default path).
 * @param deps - request-time dependencies.
 * @returns the handler to register on `agent/request`.
 */
export function createMergeHandler(deps) {
    return async (payload, next) => {
        const selection = deps.selectionOf(payload.agent.session.events);
        // The plan that governs this request: the session's explicit binding when
        // it has one, else the deployment default (reference semantics — both are
        // re-resolved on every call). With neither, run zero-intervention.
        let plan;
        let planId;
        const overrides = selection.overrides;
        if (selection.planId !== undefined) {
            plan = await deps.resolvePlan(selection.planId);
            planId = selection.planId;
        }
        else {
            plan = await deps.resolveDefaultPlan();
        }
        if (plan === undefined) {
            // A bound plan that no longer resolves (deleted/moved), or no usable
            // default: the reference semantics mean this request cannot honor one.
            // Fall back to the official config, loudly for an explicit binding (a
            // default disappearing is a silent zero-intervention fallback).
            if (planId !== undefined) {
                deps.logger.warn(`model-plans: bound plan "${planId}" no longer resolves; running the official route`);
            }
            return next();
        }
        const { config, warnedExtra } = mergePlanConfig(await next(), plan, overrides);
        if (warnedExtra.length > 0) {
            deps.logger.warn(`model-plans: plan "${planId ?? 'default'}" carries non-native params (${warnedExtra.join(', ')}) `
                + 'that land on LlmCallConfig.extra — the active provider adapter may not forward them (pi-ai does not)');
        }
        return config;
    };
}
//# sourceMappingURL=merge.js.map