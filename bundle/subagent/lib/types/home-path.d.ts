/**
 * Self-contained harness-home path helpers.
 *
 * The team and subagent user roots are authored under the harness home
 * (`$DSH_HOME/.dsh/teams`, `$DSH_HOME/.dsh/subagents`, or the default
 * `~/.dsh/...`). The official package exporting these helpers,
 * `@deepseek-ai/dsh-home-paths`, is only an optional peer dependency of this
 * bundle and is NOT present in the hot-mount (cordis loader) environment —
 * the running profile's `node_modules` does not carry it, and a hot-upgraded
 * `team`/`preset` entry import that reaches for it fails to resolve and aborts
 * the whole loader entries apply.
 *
 * Rather than depend on that package at import time, this module re-implements
 * the two helpers the bundle needs (`dshHomePath` and `expandHomePath`) with
 * byte-for-byte identical behaviour, using only Node's own `node:os`/`node:path`
 * modules. Nothing here imports from outside this package, so the compiled
 * `team` and `preset` entries resolve on any environment where this bundle
 * itself resolves.
 *
 * @module dsh-harness-subagent-bundle/home-path
 */
/** Directory name for the default DeepSeek Harness home under the OS home. */
export declare const DSH_HOME_DIR_NAME = ".dsh";
/** Environment variable that overrides the default DeepSeek Harness home. */
export declare const DSH_HOME_ENV = "DSH_HOME";
/**
 * Resolve the default DeepSeek Harness home using Node's platform path rules.
 * @returns the absolute default harness home path.
 */
export declare function defaultDshHome(): string;
/**
 * Expand supported tilde prefixes against the operating-system home.
 * @param path - configured path that may begin with `~`, `~/`, or `~\`.
 * @returns the expanded path, or the original value when no supported prefix is present.
 */
export declare function expandHomePath(path: string): string;
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
export declare function resolveDshHome(configured?: string, env?: Record<string, string | undefined>): string;
/**
 * Join path segments onto the resolved DeepSeek Harness home.
 * @param segments - path segments appended to the Harness home; an empty list returns the home itself.
 * @returns the normalized absolute joined path.
 */
export declare function dshHomePath(...segments: string[]): string;
//# sourceMappingURL=home-path.d.ts.map