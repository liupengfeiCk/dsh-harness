/**
 * Package-owned invariant companion for `dsh-harness-subagent-bundle/in-process`.
 * @module dsh-harness-subagent-bundle/in-process/invariant
 */
const PACKAGE_NAME = 'dsh-harness-subagent-bundle/in-process';
/** Cordis companion plugin name. */
export const name = 'subagent-in-process-invariant';
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants'];
/**
 * No runtime invariant: this package composes children through the subagent
 * capability seam, which owns the lifecycle edges, so there is no independent
 * stream or mutable data relation to verify here.
 */
const install = () => { };
/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx) => Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install));
/* jscpd:ignore-end */
//# sourceMappingURL=invariant.js.map