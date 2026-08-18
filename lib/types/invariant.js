/**
 * Package-owned invariant companion for `dsh-harness-hot-bundle`.
 * @module dsh-harness-hot-bundle/invariant
 */
const PACKAGE_NAME = 'dsh-harness-hot-bundle';
/** Cordis companion plugin name. */
export const name = 'harness-hot-bundle-invariant';
/** Service required before the companion can register. */
export const inject = ['invariants'];
// No runtime invariant: the package is a host surface (a service + an RPC
// channel) whose correctness is covered by the suite and the live
// end-to-end check; it owns no durable relation to assert at boot.
const install = () => { };
/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx) => Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install));
//# sourceMappingURL=invariant.js.map