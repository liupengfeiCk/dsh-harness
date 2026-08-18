/**
 * Package-owned invariant companion for `dsh-harness-subagent-bundle/preset`.
 *
 * Subagent mounts are per-child and unwind with the child, so there are no
 * standing compositions to re-audit the way agent presets do. The one
 * assertion this companion owns is that a subagent mount never leaks a
 * process-global service into the root realm — which `mountPreset` already
 * proves once at mount, and which is re-checked here on every service
 * registration so a row that publishes later (from a timer or an async
 * continuation) cannot escape that one-shot audit.
 * @module dsh-harness-subagent-bundle/preset/invariant
 */
import type { Context } from '@deepseek-ai/cordis';
/** Cordis companion plugin name. */
export declare const name = "subagent-presets-invariant";
/** Service required before the companion can reserve package ownership. */
export declare const inject: string[];
/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export declare const apply: (ctx: Context) => Promise<() => void>;
//# sourceMappingURL=invariant.d.ts.map