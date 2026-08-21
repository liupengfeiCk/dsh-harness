/**
 * MemoryHostAdapter — the memory engine's host-neutral adapter bound to the
 * harness context.
 *
 * Satisfies the vendor `HostAdapter` contract (the seam the memory engine uses
 * to answer "who is the current session", "how do I call an LLM", and "where do
 * I log"):
 *   - data dir: `~/.dsh/memory` (configurable via `memory.dataDir`).
 *   - logger: forwarded to the harness `ctx.logger`.
 *   - LLM runner factory: the DSH-backed factory over `ctx.llm.stream`.
 *
 * This adapter is the single host-side entry the memory engine talks through;
 * the vendor's own `StandaloneHostAdapter` remains the reference for the
 * contract shape but is not used directly (the harness has no Gateway config).
 *
 * @module dsh-harness-memory-bundle/adapters/host-adapter
 */
import type { Context } from '@deepseek-ai/cordis';
import type { MemoryEngineConfig } from './config.ts';
import type { HostAdapter, LLMRunnerFactory, Logger, RuntimeContext } from '@tencentdb-agent-memory/memory-core-vendor/core/types';
/** The vendor `Logger` surface forwarded to a cordis logger. */
export type LoggerLike = {
    debug?(message: string): void;
    info(message: string): void;
    warn(message: string): void;
    error(message: string): void;
};
/** Adapt a cordis logger to the vendor `Logger` contract. */
export declare function adaptLogger(logger: {
    debug?: (message: string, ...args: unknown[]) => void;
    info: (message: string, ...args: unknown[]) => void;
    warn: (message: string, ...args: unknown[]) => void;
    error: (message: string, ...args: unknown[]) => void;
}): Logger;
/** Options for constructing a {@link MemoryHostAdapter}. */
export interface MemoryHostAdapterOptions {
    /** The harness context (provides `ctx.logger`, `ctx.llm`). */
    readonly ctx: Context;
    /** Host-facing engine config. */
    readonly config: MemoryEngineConfig;
}
/**
 * The harness-bound memory engine host adapter.
 */
export declare class MemoryHostAdapter implements HostAdapter {
    readonly hostType: "standalone";
    private readonly logger;
    private readonly dataDir;
    private readonly runnerFactory;
    /** The resolved data directory (public for the management surface). */
    get dataDirPath(): string;
    constructor(options: MemoryHostAdapterOptions);
    getRuntimeContext(): RuntimeContext;
    getLogger(): Logger;
    getLLMRunnerFactory(): LLMRunnerFactory;
}
//# sourceMappingURL=host-adapter.d.ts.map