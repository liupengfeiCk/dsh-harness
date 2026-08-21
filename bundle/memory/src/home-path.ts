/**
 * Self-contained harness-home path helpers.
 *
 * The memory engine's data root lives under the harness home
 * (`$DSH_HOME/.dsh/memory`, or the default `~/.dsh/memory`). The official
 * package exporting these helpers, `@deepseek-ai/dsh-home-paths`, is only an
 * optional peer dependency and is NOT present in the hot-mount (cordis loader)
 * environment — so, exactly as the model-plan and task bundles do, this module
 * re-implements the two helpers the bundle needs (`dshHomePath` and
 * `expandHomePath`) with byte-for-byte identical behaviour, using only Node's
 * own `node:os`/`node:path` modules. Nothing here imports from outside this
 * package, so the compiled entries resolve on any environment where this
 * bundle itself resolves.
 *
 * @module dsh-harness-memory-bundle/home-path
 */

import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

/** Directory name for the default DeepSeek Harness home under the OS home. */
export const DSH_HOME_DIR_NAME = '.dsh'

/** Environment variable that overrides the default DeepSeek Harness home. */
export const DSH_HOME_ENV = 'DSH_HOME'

/**
 * Resolve the default DeepSeek Harness home using Node's platform path rules.
 * @returns the absolute default harness home path.
 */
export function defaultDshHome(): string {
  return join(homedir(), DSH_HOME_DIR_NAME)
}

/**
 * Expand supported tilde prefixes against the operating-system home.
 * @param path - configured path that may begin with `~`, `~/`, or `~\`.
 * @returns the expanded path, or the original value when no supported prefix is present.
 */
export function expandHomePath(path: string): string {
  if (path === '~') return homedir()
  if (path.startsWith('~/') || path.startsWith('~\\')) return join(homedir(), path.slice(2))
  return path
}

/**
 * Resolve the single-root DeepSeek Harness home.
 *
 * Precedence, highest first: an explicit configured path, `$DSH_HOME`, then
 * `~/.dsh`. The harness keeps all user data under one root. An empty or
 * whitespace value at any precedence level is skipped.
 * @param explicit - an explicitly configured root (optional).
 * @returns the absolute harness home path.
 */
export function dshHomePath(explicit?: string): string {
  if (explicit !== undefined && explicit.trim().length > 0) return resolve(expandHomePath(explicit))
  const env = process.env[DSH_HOME_ENV]
  if (env !== undefined && env.trim().length > 0) return resolve(expandHomePath(env))
  return resolve(defaultDshHome())
}
