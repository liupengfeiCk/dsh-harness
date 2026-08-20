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
 * The merge is a VERBATIM passthrough: every key in the plan's params bag (and
 * every session override) lands untouched on `LlmCallConfig.extra` — there is
 * no native-field routing and no key renamed. Whatever the user filled in the
 * bag is exactly what the request body carries (the adapter spreads `extra`
 * into the wire top level; a key colliding with a native wire field is a
 * misuse and the native field wins). "把填的字段，原样发给 LLM" — the bag is
 * the whole story, nothing is judged or reshaped here.
 *
 * `extra` is reached through the same typed-escape hatch the bundle uses for
 * `Session.append`'s `ignorable`: the PUBLISHED `@deepseek-ai/dsh-llm` types
 * carry `extra?: Record<string, JsonValue>` on both `LlmCallConfig` and
 * `GenerateOptions`, and the agent-loop's `buildRequest` spreads the header
 * config (including `extra`) into the adapter's `GenerateOptions`, so the bag
 * reaches the wire without this module touching the native route.
 *
 * The provider's adapter may or may not forward `extra`. This module NEVER
 * silently drops a key: whenever the merged bag is non-empty, it logs a
 * warning naming the keys, so a plan that expects an adapter to forward its
 * params does not fail quietly.
 *
 * Reference semantics: the interceptor re-resolves the bound plan on every
 * request, so editing a plan's `plan.yml` changes what a bound session uses on
 * its NEXT request without retrofitting the past.
 * @module dsh-harness-model-plan-bundle/merge
 */

import type { LlmCallConfig } from '@deepseek-ai/dsh-llm'
import type { JsonValue, PlanParams } from './types.ts'

/**
 * The widest type of the merged config: `LlmCallConfig` plus the passthrough
 * extra bag. `extra` is present only when the merged bag is non-empty.
 */
export interface MergedCallConfig extends LlmCallConfig {
  /** The verbatim plan/override params bag the adapter spreads into the wire body. */
  extra?: Record<string, JsonValue>
}

/**
 * The params bag is the whole story: every key lands on `extra` untouched,
 * so the request body carries exactly what the user filled in.
 */
function bagToExtra(bag: PlanParams): Record<string, JsonValue> {
  const extra: Record<string, JsonValue> = {}
  for (const [key, value] of Object.entries(bag)) {
    extra[key] = value as JsonValue
  }
  return extra
}

/**
 * Merge a resolved plan's route + params with a session's overrides onto an
 * already-official config. The plan's provider/model land on native fields so
 * the requestHeader recorded for this request (and therefore the display and
 * child-agent inheritance) agrees with what actually ran; every params-bag key
 * lands on `extra` verbatim.
 *
 * The plan taking over `provider`/`model` is an EXPLICIT selection, so the
 * inherited reasoning effort (whatever the official route's own model-selection
 * wrote into `base`, e.g. the seat's default "high") is discarded unless the
 * merged bag explicitly declares one. This aligns with the official
 * `installModelSelection` `withoutInheritedEffort` semantics: switching models
 * voids the inherited thinking band — otherwise a plan that moves to a provider
 * whose adapter does not accept `reasoningEffort` would inherit a stale band
 * and fail whether or not the user configured one. An effort the user DID fill
 * in travels through `extra` like any other bag key.
 * @param base - the config the official route resolved via `next()`.
 * @param plan - the resolved plan's route and params.
 * @param overrides - session-level temporary params riding above the plan's.
 * @returns the merged config with the verbatim extra bag.
 */
export function mergePlanConfig(
  base: LlmCallConfig,
  plan: { readonly provider: string; readonly model: string; readonly params: PlanParams },
  overrides: PlanParams,
): { config: MergedCallConfig; warnedExtra: readonly string[] } {
  const bag: PlanParams = { ...plan.params, ...overrides }
  const extra = bagToExtra(bag)
  // An explicit reasoningEffort in the merged bag wins; without one, the plan's
  // provider/model takeover voids any inherited effort (official
  // `withoutInheritedEffort` semantics), so base's own effort key is dropped.
  const hasEffort = 'reasoningEffort' in bag
  const { reasoningEffort: _inheritedEffort, ...withoutInheritedEffort } = base
  const config = {
    ...(hasEffort ? base : withoutInheritedEffort),
    provider: plan.provider,
    model: plan.model,
    ...Object.keys(extra).length > 0 ? { extra } : {},
  } as MergedCallConfig
  return { config, warnedExtra: Object.keys(extra) }
}

/** An agent-handle shape the interceptor reads events from (kept narrow so tests stub it cheaply). */
export interface MergeAgent {
  readonly session: { readonly events: readonly unknown[] }
}

/** The dependencies the interceptor resolves at request time. */
export interface ModelPlanMergeDeps {
  /** Read a session's folded plan selection state from its event log. */
  readonly selectionOf: (events: readonly unknown[]) => { readonly planId?: string; readonly overrides: PlanParams }
  /** Resolve the CURRENT file-backed contents of a plan (reference semantics). */
  readonly resolvePlan: (id: string) => Promise<{
    readonly provider: string
    readonly model: string
    readonly params: PlanParams
  } | undefined>
  /**
   * Resolve the deployment's DEFAULT plan, re-discovered on every call
   * (reference semantics). A session with no explicit binding falls back to
   * it, so "可设默认方案" is live. Optional for a deployment without a default.
   */
  readonly resolveDefaultPlan: () => Promise<{
    readonly provider: string
    readonly model: string
    readonly params: PlanParams
  } | undefined>
  /** Logger: a non-empty bag never silently drops. */
  readonly logger: { warn(message: string, ...args: unknown[]): void }
}

/**
 * Build the `agent/request` waterfall handler: merge a session's plan binding
 * over the official route, or hand the official config through untouched when
 * the session binds no plan (zero intervention on the default path).
 * @param deps - request-time dependencies.
 * @returns the handler to register on `agent/request`.
 */
export function createMergeHandler(
  deps: ModelPlanMergeDeps,
): (payload: { readonly agent: MergeAgent }, next: () => Promise<LlmCallConfig>) => Promise<LlmCallConfig> {
  return async (payload, next): Promise<LlmCallConfig> => {
    const selection = deps.selectionOf(payload.agent.session.events)
    // The plan that governs this request: the session's explicit binding when
    // it has one, else the deployment default (reference semantics — both are
    // re-resolved on every call). With neither, run zero-intervention.
    let plan: { readonly provider: string; readonly model: string; readonly params: PlanParams } | undefined
    let planId: string | undefined
    const overrides = selection.overrides
    if (selection.planId !== undefined) {
      plan = await deps.resolvePlan(selection.planId)
      planId = selection.planId
    } else {
      plan = await deps.resolveDefaultPlan()
    }
    if (plan === undefined) {
      // A bound plan that no longer resolves (deleted/moved), or no usable
      // default: the reference semantics mean this request cannot honor one.
      // Fall back to the official config, loudly for an explicit binding (a
      // default disappearing is a silent zero-intervention fallback).
      if (planId !== undefined) {
        deps.logger.warn(`model-plans: bound plan "${planId}" no longer resolves; running the official route`)
      }
      return next()
    }
    const { config, warnedExtra } = mergePlanConfig(await next(), plan, overrides)
    if (warnedExtra.length > 0) {
      deps.logger.warn(
        `model-plans: plan "${planId ?? 'default'}" carries params (${warnedExtra.join(', ')}) `
        + 'that land on LlmCallConfig.extra — the active provider adapter must forward them to the request body '
        + '(enable the extra-forwarding adapter for the provider route)',
      )
    }
    return config as LlmCallConfig
  }
}
