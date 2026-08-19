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

import type { LlmCallConfig } from '@deepseek-ai/dsh-llm'
import type { JsonValue, PlanParams } from './types.ts'

/**
 * The keys a plan's params bag maps onto NATIVE `LlmCallConfig` fields. Any
 * other key maps onto `LlmCallConfig.extra` (see the module doc).
 */
export const KNOWN_KEYS = ['temperature', 'reasoningEffort', 'maxTokens', 'stop'] as const

/** The widest type of the merged config: `LlmCallConfig` plus the optional extra bag. */
export interface MergedCallConfig extends LlmCallConfig {
  /** Non-known plan/override keys the provider may or may not forward. */
  extra?: Record<string, JsonValue>
}

/** Split a bag into the native fields it sets and the extra keys it does not. */
function splitBag(bag: PlanParams): {
  native: Partial<Pick<LlmCallConfig, 'temperature' | 'reasoningEffort' | 'maxTokens' | 'stop'>>
  extra: Record<string, JsonValue>
} {
  const native: Partial<Pick<LlmCallConfig, 'temperature' | 'reasoningEffort' | 'maxTokens' | 'stop'>> = {}
  const extra: Record<string, JsonValue> = {}
  for (const [key, value] of Object.entries(bag)) {
    if (KNOWN_KEYS.includes(key as (typeof KNOWN_KEYS)[number])) {
      native[key as keyof typeof native] = value as never
    } else {
      extra[key] = value as JsonValue
    }
  }
  return { native, extra }
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
export function mergePlanConfig(
  base: LlmCallConfig,
  plan: { readonly provider: string; readonly model: string; readonly params: PlanParams },
  overrides: PlanParams,
): { config: MergedCallConfig; warnedExtra: readonly string[] } {
  const bag: PlanParams = { ...plan.params, ...overrides }
  const { native, extra } = splitBag(bag)
  const config = {
    ...base,
    provider: plan.provider,
    model: plan.model,
    ...native,
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
  /** Logger: a non-known key never silently drops. */
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
    if (selection.planId === undefined) return next()
    const plan = await deps.resolvePlan(selection.planId)
    if (plan === undefined) {
      // The bound plan's file no longer resolves (deleted or moved): the
      // reference semantics mean this request cannot honor it. Fall back to
      // the official config, loudly.
      deps.logger.warn(`model-plans: bound plan "${selection.planId}" no longer resolves; running the official route`)
      return next()
    }
    const { config, warnedExtra } = mergePlanConfig(await next(), plan, selection.overrides)
    if (warnedExtra.length > 0) {
      deps.logger.warn(
        `model-plans: plan "${selection.planId}" carries non-native params (${warnedExtra.join(', ')}) `
        + 'that land on LlmCallConfig.extra — the active provider adapter may not forward them (pi-ai does not)',
      )
    }
    return config as LlmCallConfig
  }
}
