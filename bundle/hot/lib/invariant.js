//#region lib/types/invariant.js
/**
* Package-owned invariant companion for `dsh-harness-hot-bundle`.
* @module dsh-harness-hot-bundle/invariant
*/
const PACKAGE_NAME = "dsh-harness-hot-bundle";
/** Cordis companion plugin name. */
const name = "harness-hot-bundle-invariant";
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
