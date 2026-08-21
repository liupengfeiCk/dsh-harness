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

import type { Context } from '@deepseek-ai/cordis'
import { join } from 'node:path'
import { dshHomePath } from '../home-path.ts'
import { DshLLMRunnerFactory } from './llm-runner.ts'
import type { MemoryEngineConfig } from './config.ts'
import type {
  HostAdapter,
  LLMRunnerFactory,
  Logger,
  RuntimeContext,
} from '@tencentdb-agent-memory/memory-core-vendor/core/types'

/** The vendor `Logger` surface forwarded to a cordis logger. */
export type LoggerLike = {
  debug?(message: string): void
  info(message: string): void
  warn(message: string): void
  error(message: string): void
}

/** Adapt a cordis logger to the vendor `Logger` contract. */
export function adaptLogger(logger: {
  debug?: (message: string, ...args: unknown[]) => void
  info: (message: string, ...args: unknown[]) => void
  warn: (message: string, ...args: unknown[]) => void
  error: (message: string, ...args: unknown[]) => void
}): Logger {
  const base: LoggerLike = {
    info: (message) => logger.info(message),
    warn: (message) => logger.warn(message),
    error: (message) => logger.error(message),
  }
  if (typeof logger.debug === 'function') {
    base.debug = (message) => logger.debug?.(message)
  }
  return base
}

/** Options for constructing a {@link MemoryHostAdapter}. */
export interface MemoryHostAdapterOptions {
  /** The harness context (provides `ctx.logger`, `ctx.llm`). */
  readonly ctx: Context
  /** Host-facing engine config. */
  readonly config: MemoryEngineConfig
}

/**
 * The harness-bound memory engine host adapter.
 */
export class MemoryHostAdapter implements HostAdapter {
  readonly hostType = 'standalone' as const

  private readonly logger: Logger
  private readonly dataDir: string
  private readonly runnerFactory: DshLLMRunnerFactory

  /** The resolved data directory (public for the management surface). */
  get dataDirPath(): string {
    return this.dataDir
  }

  constructor(options: MemoryHostAdapterOptions) {
    const config: MemoryEngineConfig = options.config ?? {}
    this.logger = adaptLogger(options.ctx.logger)
    this.dataDir = config.dataDir !== undefined && config.dataDir.length > 0
      ? config.dataDir
      : join(dshHomePath(), 'memory')
    this.runnerFactory = new DshLLMRunnerFactory({
      ctx: options.ctx,
      config,
    })
  }

  getRuntimeContext(): RuntimeContext {
    return {
      userId: 'default_user',
      sessionId: '',
      sessionKey: '',
      platform: 'hermes',
      workspaceDir: this.dataDir,
      dataDir: this.dataDir,
    }
  }

  getLogger(): Logger {
    return this.logger
  }

  getLLMRunnerFactory(): LLMRunnerFactory {
    return this.runnerFactory
  }
}
