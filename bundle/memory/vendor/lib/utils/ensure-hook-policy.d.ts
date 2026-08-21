/**
 * ensure-hook-policy.ts
 *
 * Auto-patches openclaw.json to add `hooks.allowConversationAccess: true`
 * for our plugin. Without it, the gateway silently blocks agent_end hooks
 * for non-bundled plugins (v2026.4.23+, PR #70786).
 */
/**
 * Minimum host version at which `hooks.allowConversationAccess` is both
 * recognised by the schema and enforced. See header comment.
 */
export declare const HOOK_POLICY_MIN_VERSION: readonly [number, number, number];
/**
 * Parse the leading `x.y.z` numeric prefix from a version string.
 *
 * Accepts:
 *   "2026.4.24"          -> [2026, 4, 24]
 *   "2026.4.24-beta.1"   -> [2026, 4, 24]
 *   "2026.5.3-1"         -> [2026, 5,  3]
 *   "2026.4.24.4"        -> [2026, 4, 24]   (extra segments ignored)
 *
 * Rejects (returns null):
 *   - Non-string values  (undefined / null / number / etc.)
 *   - "unknown" / ""     (no clean numeric prefix)
 *   - "2026.4"           (must have all three segments)
 *   - "v2026.4.24"       (no leading non-digit allowed — keep strict)
 */
export declare function parseVersionXYZ(v: unknown): [number, number, number] | null;
/**
 * Compare two `[x, y, z]` tuples. Returns negative / 0 / positive like a
 * standard comparator (a - b).
 */
export declare function compareVersionXYZ(a: readonly [number, number, number], b: readonly [number, number, number]): number;
/**
 * Structured outcome of the hook-policy version gate.
 *
 * Exposed so callers (e.g. index.ts) can log exactly what was compared
 * (`original` raw input, parsed `x.y.z`, and the `min` threshold) without
 * having to re-implement the parse step themselves.
 */
export interface HookPolicyDecision {
    /** Whether the auto-patch should be applied. */
    apply: boolean;
    /** The raw value passed in (useful for logging verbatim). */
    rawVersion: unknown;
    /** Parsed `[x, y, z]`, or `null` if the input was unparsable. */
    parsedXYZ: [number, number, number] | null;
    /** The minimum version threshold the decision was made against. */
    minXYZ: readonly [number, number, number];
}
/**
 * Decide whether we should apply the `allowConversationAccess` auto-patch
 * for the given host version, returning a structured result that callers
 * can log verbatim.
 *
 * Policy:
 *   - Extract the leading `x.y.z` prefix from `rawVersion` (ignoring any
 *     pre-release suffix like `-beta.N`, `-1`, `-alpha.N`, etc.).
 *   - If the prefix is >= {@link HOOK_POLICY_MIN_VERSION}, `apply = true`.
 *   - If the prefix cannot be parsed (unknown / empty / non-string /
 *     undefined — typical on hosts that don't expose `api.runtime.version`),
 *     `apply = false`.  This is the safe default: old hosts don't have the
 *     gate and don't need patching.
 *
 * NOTE: Very early pre-releases of the MIN version itself (e.g.
 * `2026.4.24-beta.1`) will satisfy the predicate. This is intentional —
 * the field was already recognised in those builds and the usage base is
 * negligible.
 */
export declare function decideHookPolicy(rawVersion: unknown): HookPolicyDecision;
/**
 * Thin boolean wrapper around {@link decideHookPolicy} for callers that
 * only need the yes/no answer.
 */
export declare function shouldApplyHookPolicy(rawVersion: unknown): boolean;
interface Logger {
    info: (msg: string) => void;
    warn: (msg: string) => void;
    debug?: (msg: string) => void;
}
/**
 * Call early in register(). Patches config if missing, triggers restart.
 *
 * Strategy:
 * 1. Try SDK mutateConfigFile (handles path resolution, $include, atomic write,
 *    and triggers gateway restart via afterWrite).
 * 2. Fallback to manual file write if SDK is unavailable or fails.
 */
export declare function ensurePluginHookPolicy(params: {
    rootConfig?: unknown;
    runtimeConfig?: {
        mutateConfigFile?: (p: any) => Promise<any>;
    };
    logger: Logger;
}): void;
export {};
