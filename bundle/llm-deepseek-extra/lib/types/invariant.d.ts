/**
 * A tiny dev-only assertion used across the adapter to catch programming
 * errors and to guard map-usage arithmetic. It throws only in test/build
 * (import 'node:assert' is erased by the bundler via the shim), and compiles
 * to a no-op in production. Kept as a standalone module so the official
 * `dsh-invariants` peer supplies it at runtime.
 * @module dsh-llm-deepseek-extra/invariant
 */
import invariant from '@deepseek-ai/dsh-invariants';
export default invariant;
//# sourceMappingURL=invariant.d.ts.map