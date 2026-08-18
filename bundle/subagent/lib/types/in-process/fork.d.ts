/**
 * The harness-owned in-process FORK subagent backend: registers a
 * {@link SubagentProvider} on `ctx.subagents` that runs each child as a child
 * {@link Agent} SEEDED with a prefix of the parent's session log — so the child
 * inherits the parent's conversation context instead of starting fresh — and
 * composes it through OUR engine (inheritance switch + subagent model override).
 * This replaces the official `@deepseek-ai/dsh-subagent-fork-in-process` in the
 * shipped composition.
 * @module dsh-harness-subagent-bundle/in-process/fork
 */
import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
export declare const name = "subagent-in-process-fork";
export declare const inject: string[];
/** Config: the registry name to register the provider under. */
export interface Config {
    /** Provider name on `ctx.subagents` (default `fork`). */
    providerName: string;
}
export declare const Config: z<Config>;
export declare function apply(ctx: Context, config: Config): void;
//# sourceMappingURL=fork.d.ts.map