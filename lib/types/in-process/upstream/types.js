/**
 * UPSTREAM-SYNC NOTE: verbatim copy of @deepseek-ai/dsh-subagent/src/types.ts.
 * Official tarballs ship lib/ only, so deep src imports 404 on registry
 * installs; this copy makes the package self-contained. Keep in sync with the
 * upstream file when the vendored checkout advances.
 */
/**
 * The seam's consumer-facing contracts: request, result, and capability types
 * for {@link SubagentProvider}, plus the `subagent/start` and `subagent/end`
 * payloads that plugins and hosts observe. Internal control interfaces belong
 * with their implementation — the lifecycle observer in `./lifecycle.ts`, the
 * continuation host in `./continuation.ts` — so this module stays the published
 * surface rather than a bag of everything type-shaped.
 *
 * @module @deepseek-ai/dsh-subagent/types
 */
/**
 * Brand a string as a {@link SubagentRunId}.
 * @param id - the raw run id.
 * @returns the same string, branded.
 */
export function SubagentRunId(id) {
    return id;
}
//# sourceMappingURL=types.js.map