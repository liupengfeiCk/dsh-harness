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
 * whitespace value at any precedence level is skipped.
 * @param explicit - an explicitly configured root (optional).
 * @returns the absolute harness home path.
 */
export declare function dshHomePath(explicit?: string): string;
//# sourceMappingURL=home-path.d.ts.map