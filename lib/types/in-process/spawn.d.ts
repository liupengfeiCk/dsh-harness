/**
 * The harness-owned in-process SPAWN subagent backend: registers a
 * {@link SubagentProvider} on `ctx.subagents` that runs each child as a fresh
 * child {@link Agent} on the same cordis context (its own session, own system
 * prompt, zero parent context), composed by OUR engine so the inheritance
 * switch and subagent model override apply. This replaces the official
 * `@deepseek-ai/dsh-subagent-spawn-in-process` in the shipped composition.
 * @module dsh-harness-subagent-bundle/in-process/spawn
 */
import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
export declare const name = "subagent-in-process-spawn";
export declare const inject: string[];
/** Config: the registry name to register the provider under. */
export interface Config {
    /** Provider name on `ctx.subagents` (default `spawn`). */
    providerName: string;
}
export declare const Config: z<Config>;
export declare function apply(ctx: Context, config: Config): void;
//# sourceMappingURL=spawn.d.ts.map