/**
 * Memory settings namespace schema (host half, T15).
 *
 * The `memory:` settings namespace carries every config item the memory system
 * surfaces to the operator — a master on/off switch, the extraction model plan,
 * the compression route, and the three independent sizing ratios with their
 * thresholds. This module declares the schemastery schema the settings service
 * validates and renders, plus the `MemorySettings` type the rest of the host
 * reads.
 *
 * Three independent ratios are deliberately distinct knobs:
 *   - `injectionLimit`  — the unified injection cap (default 20%): how much of
 *     the assembled prompt budget memory recall may consume.
 *   - `compressionLine` — the original-text compression line (default 80%):
 *     above this fraction of the budget the pipeline starts compressing
 *     recalled originals.
 *   - `retainLine`      — the original-text retention line (default 16%): how
 *     much original text is kept after compression.
 *
 * Each is an independent percentage stored as a 0..1 fraction on the wire and
 * in settings, and rendered as a percentage by the settings section.
 *
 * @module dsh-harness-memory-bundle/config/schema
 */
import z from '@deepseek-ai/schemastery';
/**
 * The compression route: either "follow the current route" (the harness's
 * active model selection) or a pinned model-plan id.
 */
export const COMPRESSION_ROUTE_FOLLOW = 'follow';
export const COMPRESSION_ROUTE_PLAN = 'plan';
/** Runtime schema for the `memory:` settings namespace. */
export const Config = z.object({
    /**
     * Master switch. When false the memory engine still captures and stores
     * turns (storage is always on), but recall/injection is disabled.
     */
    enabled: z.boolean().default(true),
    /**
     * The extraction model-plan id. When set, extraction resolves its LLM route
     * from that model plan; when unset it follows the current route.
     */
    refinementPlan: z.string().default(''),
    /** The compression route: follow the current route or a pinned plan. */
    compression: z.object({
        mode: z.union([z.const('follow'), z.const('plan')]).default('follow'),
        planId: z.string().default(''),
    }),
    /**
     * The unified-injection cap as a 0..1 fraction (default 20%). Memory recall
     * may fill at most this share of the assembled prompt budget.
     */
    injectionLimit: z.number().min(0).max(1).step(0.001).default(0.2),
    /**
     * The original-text compression line as a 0..1 fraction (default 80%). Above
     * this share of the budget, recalled originals begin compressing.
     */
    compressionLine: z.number().min(0).max(1).step(0.001).default(0.8),
    /**
     * The original-text retention line as a 0..1 fraction (default 16%). How much
     * original text stays after compression.
     */
    retainLine: z.number().min(0).max(1).step(0.001).default(0.16),
});
/** The settings namespace's canonical defaults (identical to the schema's). */
export const DEFAULT_MEMORY_SETTINGS = {
    enabled: true,
    refinementPlan: '',
    compression: { mode: 'follow', planId: '' },
    injectionLimit: 0.2,
    compressionLine: 0.8,
    retainLine: 0.16,
};
//# sourceMappingURL=schema.js.map