/**
 * Self-contained harness-home path helpers.
 *
 * The model-plan user root is authored under the harness home
 * (`$DSH_HOME/.dsh/model-plans`, or the default `~/.dsh/model-plans`). The
 * official package exporting these helpers, `@deepseek-ai/dsh-home-paths`, is
 * only an optional peer dependency and is NOT present in the hot-mount (cordis
 * loader) environment — so, exactly as the subagent bundle does, this module
 * re-implements the two helpers the bundle needs (`dshHomePath` and
 * `expandHomePath`) with byte-for-byte identical behaviour, using only Node's
 * own `node:os`/`node:path` modules. Nothing here imports from outside this
 * package, so the compiled entries resolve on any environment where this
 * bundle itself resolves.
 *
 * @module dsh-harness-model-plan-bundle/home-path
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
 * whitespace-only `$DSH_HOME` is treated as unset, so a blank override never
 * resolves the home to the current working directory.
 * @param configured - explicit harness-home override, which has highest precedence.
 * @param env - environment mapping used to read `DSH_HOME`.
 * @returns the normalized absolute harness home path.
 */
export function resolveDshHome(configured?: string, env: Record<string, string | undefined> = process.env): string {
  const fromEnv = env[DSH_HOME_ENV]
  const selected = configured ?? (fromEnv !== undefined && fromEnv.trim().length > 0 ? fromEnv : defaultDshHome())
  return resolve(expandHomePath(selected))
}

/**
 * Join path segments onto the resolved DeepSeek Harness home.
 * @param segments - path segments appended to the Harness home; an empty list returns the home itself.
 * @returns the normalized absolute joined path.
 */
export function dshHomePath(...segments: string[]): string {
  return join(resolveDshHome(), ...segments)
}
