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
import { join } from 'node:path';
import { dshHomePath } from "../home-path.js";
import { DshLLMRunnerFactory } from "./llm-runner.js";
/** Adapt a cordis logger to the vendor `Logger` contract. */
export function adaptLogger(logger) {
    const base = {
        info: (message) => logger.info(message),
        warn: (message) => logger.warn(message),
        error: (message) => logger.error(message),
    };
    if (typeof logger.debug === 'function') {
        base.debug = (message) => logger.debug?.(message);
    }
    return base;
}
/**
 * The harness-bound memory engine host adapter.
 */
export class MemoryHostAdapter {
    hostType = 'standalone';
    logger;
    dataDir;
    runnerFactory;
    constructor(options) {
        const config = options.config ?? {};
        this.logger = adaptLogger(options.ctx.logger);
        this.dataDir = config.dataDir !== undefined && config.dataDir.length > 0
            ? config.dataDir
            : join(dshHomePath(), 'memory');
        this.runnerFactory = new DshLLMRunnerFactory({
            ctx: options.ctx,
            config,
        });
    }
    getRuntimeContext() {
        return {
            userId: 'default_user',
            sessionId: '',
            sessionKey: '',
            platform: 'hermes',
            workspaceDir: this.dataDir,
            dataDir: this.dataDir,
        };
    }
    getLogger() {
        return this.logger;
    }
    getLLMRunnerFactory() {
        return this.runnerFactory;
    }
}
//# sourceMappingURL=host-adapter.js.map