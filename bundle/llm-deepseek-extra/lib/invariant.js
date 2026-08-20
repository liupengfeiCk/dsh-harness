import invariant from "@deepseek-ai/dsh-invariants";
//#region lib/types/invariant.js
/**
* A tiny dev-only assertion used across the adapter to catch programming
* errors and to guard map-usage arithmetic. It throws only in test/build
* (import 'node:assert' is erased by the bundler via the shim), and compiles
* to a no-op in production. Kept as a standalone module so the official
* `dsh-invariants` peer supplies it at runtime.
* @module dsh-llm-deepseek-extra/invariant
*/
var invariant_default = invariant;
//#endregion
export { invariant_default as default };
