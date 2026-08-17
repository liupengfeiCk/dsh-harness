/**
 * Package-owned invariant companion for `dsh-harness-subagent-bundle`.
 * @module dsh-harness-subagent-bundle/invariant
 */
const PACKAGE_NAME = 'dsh-harness-subagent-bundle';
/** Cordis companion plugin name. */
export const name = 'subagent-bundle-invariant';
/** Service required before the companion can register. */
export const inject = ['invariants'];
// No runtime invariant: the package is a static patch-list carrier (a YAML
// document of loader rows owned by other packages); it mounts no service,
// emits no events, and owns no mutable relation to check. Each inserted row's
// own package carries that row's invariants.
const install = () => { };
/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx) => Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install));
//# sourceMappingURL=invariant.js.map