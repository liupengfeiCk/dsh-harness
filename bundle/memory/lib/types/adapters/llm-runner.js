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
import { createMessage, createUserMessage, } from '@deepseek-ai/dsh-llm';
/**
 * Split a `"provider/model"` ref into its parts, or null when malformed.
 */
export function parseModelRef(ref) {
    const idx = ref.indexOf('/');
    if (idx <= 0 || idx === ref.length - 1)
        return null;
    const provider = ref.slice(0, idx);
    const model = ref.slice(idx + 1);
    if (provider.length === 0 || model.length === 0)
        return null;
    return { provider, model };
}
/**
 * Default route resolver: modelRef → modelPlanId (via the registry) → config
 * default provider/model. Returns `null` when nothing resolves.
 */
export function createDefaultRouteResolver(ctx, config) {
    return async ({ modelRef, planId }) => {
        if (modelRef !== undefined && modelRef.length > 0) {
            const parsed = parseModelRef(modelRef);
            if (parsed !== null)
                return parsed;
        }
        if (planId !== undefined && planId.length > 0) {
            const plans = ctx
                .get('modelPlans');
            if (plans !== undefined) {
                const plan = await plans.resolve(planId).catch(() => undefined);
                if (plan !== undefined && plan.provider.length > 0 && plan.model.length > 0) {
                    return { provider: plan.provider, model: plan.model };
                }
            }
        }
        if (config.llm?.provider !== undefined && config.llm?.provider.length > 0
            && config.llm?.model !== undefined && config.llm?.model.length > 0) {
            return { provider: config.llm.provider, model: config.llm.model };
        }
        // Fall through to the harness's current default model selection (T7:
        // "跟随当前路由" = ctx.agentDefaultModel.currentSelection()) so extraction
        // follows the route the main agent is already using when nothing is pinned.
        const agentDefaultModel = ctx
            .get('agentDefaultModel');
        if (agentDefaultModel !== undefined) {
            const selection = agentDefaultModel.currentSelection();
            if (selection !== undefined && selection.provider.length > 0 && selection.model.length > 0) {
                return { provider: selection.provider, model: selection.model };
            }
        }
        return null;
    };
}
/** Assemble one `GenerateOptions` from a vendor `LLMRunParams`. */
function buildRequest(params, route, signal, purpose) {
    const messages = [];
    if (params.systemPrompt !== undefined && params.systemPrompt.length > 0) {
        messages.push(createMessage({
            role: 'system',
            content: [{ type: 'text', text: params.systemPrompt }],
            source: { kind: 'plugin', plugin: 'memory' },
        }));
    }
    messages.push(createUserMessage({
        content: [{ type: 'text', text: params.prompt }],
        source: { kind: 'plugin', plugin: 'memory' },
    }));
    const options = {
        provider: route.provider,
        model: route.model,
        messages,
    };
    if (params.maxTokens !== undefined) {
        options.maxTokens = params.maxTokens;
    }
    if (signal !== undefined) {
        options.signal = signal;
    }
    if (params.sessionId !== undefined && params.sessionId.length > 0) {
        options.sessionId = params.sessionId;
    }
    if (purpose !== undefined)
        options.purpose = purpose;
    return options;
}
/**
 * A DSH-backed `LLMRunner`: collects the streamed text output for one call.
 */
export class DshLLMRunner {
    llm;
    routePromise;
    constructor(llm, route) {
        this.llm = llm;
        this.routePromise = route;
    }
    async run(params) {
        const route = await this.routePromise;
        const request = buildRequest(params, route, params.abortSignal);
        let text = '';
        for await (const chunk of this.llm.stream(request)) {
            if (chunk.type === 'text-delta') {
                text += chunk.text;
            }
        }
        return text.trim();
    }
}
/**
 * Factory for DSH-backed `LLMRunner`s. Resolves the route once per runner
 * (a runner is created per extractor with a fixed model ref/plan), so each
 * extraction pipeline shares one route promise.
 */
export class DshLLMRunnerFactory {
    ctx;
    config;
    resolveRoute;
    constructor(options) {
        this.ctx = options.ctx;
        this.config = options.config;
        this.resolveRoute = options.resolveRoute
            ?? createDefaultRouteResolver(options.ctx, options.config);
    }
    createRunner(opts) {
        const routePromise = this.resolveRoute({
            ...(opts?.modelRef !== undefined ? { modelRef: opts.modelRef } : {}),
            ...(this.config.modelPlanId !== undefined ? { planId: this.config.modelPlanId } : {}),
        }).then((route) => {
            if (route === null) {
                throw new Error('memory: no LLM route resolvable — set memory.llm.provider/model, ' +
                    'memory.modelPlanId, or provide a route resolver in host wiring');
            }
            return route;
        });
        return new DshLLMRunner(this.ctx.llm, routePromise);
    }
}
//# sourceMappingURL=llm-runner.js.map