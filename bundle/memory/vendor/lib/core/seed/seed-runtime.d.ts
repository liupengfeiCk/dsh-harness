/**
 * Seed runtime: L0→L1→L2→L3 orchestration for the `seed` command.
 *
 * Uses the shared pipeline-factory for VectorStore/EmbeddingService init,
 * L1 runner, L2 runner, L3 runner, and persister wiring — keeping this
 * module focused on seed-specific concerns:
 * - Synchronous per-round L0 capture with progress reporting
 * - waitForL1Idle polling (L1 only — see FIXME below)
 * - Ctrl+C graceful shutdown
 *
 * FIXME: Currently we only wait for L1 to become idle before destroying the
 * pipeline.  L2 (scene extraction) and L3 (persona generation) may still be
 * in-flight when `pipeline.destroy()` is called.  This is intentional for now
 * to avoid excessively long seed runs, but means seed output may not include
 * the latest L2/L3 artifacts.  Re-evaluate adding a full L1+L2+L3 idle wait
 * once pipeline-manager exposes reliable L2/L3 idle signals.
 */
import type { PipelineLogger } from "../../utils/pipeline-factory.js";
import type { NormalizedInput, SeedProgress, SeedSummary } from "./types.js";
export interface SeedRuntimeOptions {
    /** Directory to store all seed output (L0, checkpoint, vectors.db). */
    outputDir: string;
    /** OpenClaw config object (needed for LLM calls in L1). */
    openclawConfig: unknown;
    /** Raw plugin config (same shape as api.pluginConfig). */
    pluginConfig?: Record<string, unknown>;
    /** Original input file path (for manifest traceability). */
    inputFile?: string;
    /** Logger instance. */
    logger: PipelineLogger;
    /** Progress callback (called after each round). */
    onProgress?: (progress: SeedProgress) => void;
}
/**
 * Execute the seed pipeline: feed normalized input through L0 → L1.
 *
 * L2/L3 runners are wired but their completion is **not** awaited — see the
 * module-level FIXME.  The pipeline is destroyed after L1 idle, so L2/L3 may
 * be interrupted mid-run.
 *
 * This is the core runtime called by `src/cli/commands/seed.ts` after
 * all input validation and user confirmation are complete.
 */
export declare function executeSeed(input: NormalizedInput, opts: SeedRuntimeOptions): Promise<SeedSummary>;
