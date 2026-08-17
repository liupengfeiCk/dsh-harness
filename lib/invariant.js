//#region lib/types/invariant.js
/**
* Package-owned invariant companion for `dsh-harness-subagent-bundle`.
* @module dsh-harness-subagent-bundle/invariant
*/
const PACKAGE_NAME = "dsh-harness-subagent-bundle";
/** Cordis companion plugin name. */
const name = "subagent-bundle-invariant";
/** Service required before the companion can register. */
const inject = ["invariants"];
const install = () => {};
/**
* Register this package's invariant companion.
* @param ctx - Cordis context carrying the invariant service.
* @returns the installed registration's disposer after setup succeeds.
*/
const apply = (ctx) => Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install));
//#endregion
export { apply, inject, name };
