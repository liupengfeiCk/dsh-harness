/**
 * DSH-backed LLMRunner.
 *
 * Implements the vendor `LLMRunner`/`LLMRunnerFactory` contract (the memory
 * engine's host-neutral LLM seam) on top of the harness `ctx.llm` streaming
 * service. `run()` assembles a `GenerateOptions` request and collects the
 * streamed `text-delta` chunks into the full text the engine consumes.
 *
 * Route resolution (design §T3 "提炼模型方案 id 从配置读，默认跟随当前路由"):
 *   1. An explicit `modelRef` ("provider/model") passed to `createRunner`.
 *   2. A configured `modelPlanId` resolved through the model-plan registry
 *      (`ctx.get('modelPlans')`, structural type — the memory bundle does not
 *      value-import the model-plan bundle).
 *   3. The configured default `provider`/`model`.
 *   4. Otherwise, the route is delegated to the injected route resolver (the
 *      T4 host wiring supplies the "current route" for un-pinned sessions).
 *
 * @module dsh-harness-memory-bundle/adapters/llm-runner
 */

import type { Context } from '@deepseek-ai/cordis'
import {
  createMessage,
  createUserMessage,
} from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import type {
  LLMRunner,
  LLMRunnerFactory,
  LLMRunnerCreateOptions,
  LLMRunParams,
} from '@tencentdb-agent-memory/memory-core-vendor/core/types'
import type { MemoryEngineConfig } from './config.ts'

/** The model-plan registry surface the runner needs (structural, not imported). */
export interface ModelPlansLike {
  resolve(id: string): Promise<{ provider: string; model: string }>
}

/**
 * Resolve the provider/model route for one call.
 * @returns the route, or `null` when no route is resolvable.
 */
export type RouteResolver = (options: {
  readonly modelRef?: string
  readonly planId?: string
}) => Promise<{ provider: string; model: string } | null>

/**
 * Split a `"provider/model"` ref into its parts, or null when malformed.
 */
export function parseModelRef(ref: string): { provider: string; model: string } | null {
  const idx = ref.indexOf('/')
  if (idx <= 0 || idx === ref.length - 1) return null
  const provider = ref.slice(0, idx)
  const model = ref.slice(idx + 1)
  if (provider.length === 0 || model.length === 0) return null
  return { provider, model }
}

/**
 * Default route resolver: modelRef → modelPlanId (via the registry) → config
 * default provider/model. Returns `null` when nothing resolves.
 */
export function createDefaultRouteResolver(
  ctx: Context,
  config: MemoryEngineConfig,
): RouteResolver {
  return async ({ modelRef, planId }) => {
    if (modelRef !== undefined && modelRef.length > 0) {
      const parsed = parseModelRef(modelRef)
      if (parsed !== null) return parsed
    }
    if (planId !== undefined && planId.length > 0) {
      const plans = (ctx as unknown as { get(name: string): ModelPlansLike | undefined })
        .get('modelPlans')
      if (plans !== undefined) {
        const plan = await plans.resolve(planId).catch(() => undefined)
        if (plan !== undefined && plan.provider.length > 0 && plan.model.length > 0) {
          return { provider: plan.provider, model: plan.model }
        }
      }
    }
    if (config.llm?.provider !== undefined && config.llm?.provider.length > 0
      && config.llm?.model !== undefined && config.llm?.model.length > 0) {
      return { provider: config.llm.provider, model: config.llm.model }
    }
    return null
  }
}

/** Options for constructing a DSH LLMRunnerFactory. */
export interface DshLLMRunnerFactoryOptions {
  /** The harness context (provides `ctx.llm.stream`). */
  readonly ctx: Context
  /** Host-facing engine config (route + extraction settings). */
  readonly config: MemoryEngineConfig
  /** Optional route resolver; defaults to {@link createDefaultRouteResolver}. */
  readonly resolveRoute?: RouteResolver
}

/** Assemble one `GenerateOptions` from a vendor `LLMRunParams`. */
function buildRequest(
  params: LLMRunParams,
  route: { provider: string; model: string },
  signal?: AbortSignal,
  purpose?: GenerateOptions['purpose'],
): GenerateOptions {
  const messages: GenerateOptions['messages'] = []
  if (params.systemPrompt !== undefined && params.systemPrompt.length > 0) {
    messages.push(createMessage({
      role: 'system',
      content: [{ type: 'text', text: params.systemPrompt }],
      source: { kind: 'plugin', plugin: 'memory' },
    }))
  }
  messages.push(createUserMessage({
    content: [{ type: 'text', text: params.prompt }],
    source: { kind: 'plugin', plugin: 'memory' },
  }))
  const options: GenerateOptions = {
    provider: route.provider,
    model: route.model,
    messages,
  }
  if (params.maxTokens !== undefined) {
    options.maxTokens = params.maxTokens
  }
  if (signal !== undefined) {
    options.signal = signal
  }
  if (params.sessionId !== undefined && params.sessionId.length > 0) {
    options.sessionId = params.sessionId as never
  }
  if (purpose !== undefined) options.purpose = purpose
  return options
}

/** The `ctx.llm` surface the runner consumes (narrow, for testability). */
export interface LlmStreamSurface {
  stream(options: GenerateOptions): AsyncIterable<StreamChunk>
}

/**
 * A DSH-backed `LLMRunner`: collects the streamed text output for one call.
 */
export class DshLLMRunner implements LLMRunner {
  private readonly routePromise: Promise<{ provider: string; model: string }>

  constructor(
    private readonly llm: LlmStreamSurface,
    route: Promise<{ provider: string; model: string }>,
  ) {
    this.routePromise = route
  }

  async run(params: LLMRunParams): Promise<string> {
    const route = await this.routePromise
    const request = buildRequest(params, route, params.abortSignal)
    let text = ''
    for await (const chunk of this.llm.stream(request)) {
      if (chunk.type === 'text-delta') {
        text += chunk.text
      }
    }
    return text.trim()
  }
}

/**
 * Factory for DSH-backed `LLMRunner`s. Resolves the route once per runner
 * (a runner is created per extractor with a fixed model ref/plan), so each
 * extraction pipeline shares one route promise.
 */
export class DshLLMRunnerFactory implements LLMRunnerFactory {
  private readonly ctx: Context
  private readonly config: MemoryEngineConfig
  private readonly resolveRoute: RouteResolver

  constructor(options: DshLLMRunnerFactoryOptions) {
    this.ctx = options.ctx
    this.config = options.config
    this.resolveRoute = options.resolveRoute
      ?? createDefaultRouteResolver(options.ctx, options.config)
  }

  createRunner(opts?: LLMRunnerCreateOptions): LLMRunner {
    const routePromise = this.resolveRoute({
      ...(opts?.modelRef !== undefined ? { modelRef: opts.modelRef } : {}),
      ...(this.config.modelPlanId !== undefined ? { planId: this.config.modelPlanId } : {}),
    }).then((route) => {
      if (route === null) {
        throw new Error(
          'memory: no LLM route resolvable — set memory.llm.provider/model, ' +
          'memory.modelPlanId, or provide a route resolver in host wiring',
        )
      }
      return route
    })
    return new DshLLMRunner(this.ctx.llm, routePromise)
  }
}
