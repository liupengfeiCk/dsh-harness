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
export declare const COMPRESSION_ROUTE_FOLLOW = "follow";
export declare const COMPRESSION_ROUTE_PLAN = "plan";
/** A compression model route. */
export interface CompressionRoute {
    /**
     * `follow` — use the harness's current model selection; `plan` — use the
     * model plan named by {@link MemorySettings.compressionPlan}.
     */
    readonly mode: typeof COMPRESSION_ROUTE_FOLLOW | typeof COMPRESSION_ROUTE_PLAN;
    /** The model-plan id used when `mode` is `plan`. */
    readonly planId?: string;
}
/** Runtime schema for the `memory:` settings namespace. */
export declare const Config: z<MemorySettings>;
/**
 * The `memory:` settings namespace value. All fields are required after
 * validation (defaults materialize), but a freshly-resolved absent section is
 * not guaranteed every key, so consumers read through the helpers in
 * {@link ./index.ts} that default each field.
 */
export interface MemorySettings {
    /** Master switch; defaults true. */
    readonly enabled: boolean;
    /** Extraction model-plan id; empty means follow the current route. */
    readonly refinementPlan: string;
    /** Compression route. */
    readonly compression: CompressionRoute;
    /** Unified-injection cap, 0..1, default 0.2. */
    readonly injectionLimit: number;
    /** Original-text compression line, 0..1, default 0.8. */
    readonly compressionLine: number;
    /** Original-text retention line, 0..1, default 0.16. */
    readonly retainLine: number;
}
/** Settings keys this surface may mutate. */
export type MemorySettingsKey = keyof MemorySettings;
/** The settings namespace's canonical defaults (identical to the schema's). */
export declare const DEFAULT_MEMORY_SETTINGS: MemorySettings;
//# sourceMappingURL=schema.d.ts.map