/**
 * The harness-owned in-process FORK subagent backend: registers a
 * {@link SubagentProvider} on `ctx.subagents` that runs each child as a child
 * {@link Agent} SEEDED with the parent's CONVERSATION SURFACE — so the child
 * inherits the parent's conversation context instead of starting fresh — and
 * composes it through OUR engine (inheritance switch + subagent model override).
 * This replaces the official `@deepseek-ai/dsh-subagent-fork-in-process` in the
 * shipped composition.
 *
 * UPSTREAM-SYNC NOTE: the official `subagent-fork-in-process` seeds the child
 * with a PREFIX OF THE PARENT'S RAW SESSION LOG (everything up to the last
 * `turn/end`). We DELIBERATELY DIVERGE and seed from the parent's LIVE SURFACE
 * (`Session.deriveMessages`) instead, re-materialized as a fresh append-only
 * event sequence. Reason: compaction REPLACES the surface (a summary shadows
 * the old history) while the append-only log never shrinks — a raw-log prefix
 * therefore hands a forked child the FULL pre-compaction history, diverging
 * from the main agent, which at that moment reasons over the summary + its new
 * progress. Seeding from the surface makes the fork inherit exactly the context
 * the parent currently sees, before and after compaction alike.
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