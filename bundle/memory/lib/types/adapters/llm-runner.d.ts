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
import type { Context } from '@deepseek-ai/cordis';
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm';
import type { LLMRunner, LLMRunnerFactory, LLMRunnerCreateOptions, LLMRunParams } from '@tencentdb-agent-memory/memory-core-vendor/core/types';
import type { MemoryEngineConfig } from './config.ts';
/** The model-plan registry surface the runner needs (structural, not imported). */
export interface ModelPlansLike {
    resolve(id: string): Promise<{
        provider: string;
        model: string;
    }>;
}
/** The agent-default-model surface the runner needs (structural, not imported). */
export interface AgentDefaultModelLike {
    currentSelection(): {
        provider: string;
        model: string;
    };
}
/**
 * Resolve the provider/model route for one call.
 * @returns the route, or `null` when no route is resolvable.
 */
export type RouteResolver = (options: {
    readonly modelRef?: string;
    readonly planId?: string;
}) => Promise<{
    provider: string;
    model: string;
} | null>;
/**
 * Split a `"provider/model"` ref into its parts, or null when malformed.
 */
export declare function parseModelRef(ref: string): {
    provider: string;
    model: string;
} | null;
/**
 * Default route resolver: modelRef → modelPlanId (via the registry) → config
 * default provider/model. Returns `null` when nothing resolves.
 */
export declare function createDefaultRouteResolver(ctx: Context, config: MemoryEngineConfig): RouteResolver;
/** Options for constructing a DSH LLMRunnerFactory. */
export interface DshLLMRunnerFactoryOptions {
    /** The harness context (provides `ctx.llm.stream`). */
    readonly ctx: Context;
    /** Host-facing engine config (route + extraction settings). */
    readonly config: MemoryEngineConfig;
    /** Optional route resolver; defaults to {@link createDefaultRouteResolver}. */
    readonly resolveRoute?: RouteResolver;
}
/** The `ctx.llm` surface the runner consumes (narrow, for testability). */
export interface LlmStreamSurface {
    stream(options: GenerateOptions): AsyncIterable<StreamChunk>;
}
/**
 * A DSH-backed `LLMRunner`: collects the streamed text output for one call.
 */
export declare class DshLLMRunner implements LLMRunner {
    private readonly llm;
    private readonly routePromise;
    constructor(llm: LlmStreamSurface, route: Promise<{
        provider: string;
        model: string;
    }>);
    run(params: LLMRunParams): Promise<string>;
}
/**
 * Factory for DSH-backed `LLMRunner`s. Resolves the route once per runner
 * (a runner is created per extractor with a fixed model ref/plan), so each
 * extraction pipeline shares one route promise.
 */
export declare class DshLLMRunnerFactory implements LLMRunnerFactory {
    private readonly ctx;
    private readonly config;
    private readonly resolveRoute;
    constructor(options: DshLLMRunnerFactoryOptions);
    createRunner(opts?: LLMRunnerCreateOptions): LLMRunner;
}
//# sourceMappingURL=llm-runner.d.ts.map