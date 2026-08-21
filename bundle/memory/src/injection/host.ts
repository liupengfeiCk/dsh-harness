/**
 * Host wiring for T9 unified injection: install the `agent/pre-step` handler
 * on the root context using the memory service's recall + the T8 compaction
 * coordinator. Scope-filtered dispatch delivers agent-scoped pre-step events
 * to this root listener for every live agent.
 *
 * @module dsh-harness-memory-bundle/injection/host
 */

import type { Context } from '@deepseek-ai/cordis'
import { createCompressionCoordinator } from './compaction.ts'
import { createPreStepHandler } from './pre-step.ts'
import { StageLedger } from './stage.ts'
import type { CompactionConfig } from '../compaction/types.ts'

/** A minimal recall provider (satisfied by the `Memory` service). */
export interface RecallProvider {
  recall(userText: string, sessionKey: string): Promise<{
    readonly prependContext?: string
    readonly appendSystemContext?: string
  }>
}

/** Options for installing the T9 injection wiring. */
export interface InstallInjectionOptions {
  /** Compression config (ratios, max level). Defaults to the T8 defaults. */
  readonly compactionConfig?: Partial<CompactionConfig>
  /** Summary-storage base directory (defaults to `~/.dsh/memory/summaries`). */
  readonly storageBase?: string
  /** Override the context window used for budget resolution (tests). */
  readonly windowOverride?: number
  /** Set false to disable automatic compression at the compression point. */
  readonly autoCompress?: boolean
}

/**
 * Install the pre-step injection handler on `ctx`. Returns the disposer.
 * The handler reads the per-session stage ledger and, on each step:
 *   - runs hierarchical compaction when the raw history crosses the line,
 *   - injects the snapshot (L3/L2) and/or L1 recall per the stage,
 *   - prefixes the step's messages with the injected content.
 */
export function installInjection(
  ctx: Context,
  recall: RecallProvider,
  options: InstallInjectionOptions = {},
): () => void {
  const ledger = new StageLedger()
  const compression = createCompressionCoordinator({
    ...(options.compactionConfig === undefined ? {} : { config: options.compactionConfig }),
    ...(options.storageBase === undefined ? {} : { storageBase: options.storageBase }),
    ...(options.windowOverride === undefined ? {} : { windowOverride: options.windowOverride }),
  })
  const handler = createPreStepHandler({
    recall: (text, key) => recall.recall(text, key),
    compression,
    ledger,
    autoCompress: options.autoCompress ?? true,
    log: (level, message) => {
      if (level === 'warn') ctx.logger.warn(message)
      else ctx.logger.info(message)
    },
  })

  ctx.on('agent/pre-step', handler as never)
  return () => {
    // The ledger holds per-session state; nothing to dispose beyond the
    // listener, which cordis removes with the ctx. Keep the disposer explicit
    // for symmetry with the effect lifecycle.
  }
}
