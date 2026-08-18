/**
 * UPSTREAM-SYNC NOTE: verbatim copy of @deepseek-ai/dsh-subagent/src/error.ts.
 * Official tarballs ship lib/ only, so deep src imports 404 on registry
 * installs; this copy makes the package self-contained. Keep in sync with the
 * upstream file when the vendored checkout advances.
 */
/**
 * Typed failures shared by subagent service and provider operations.
 *
 * @module @deepseek-ai/dsh-subagent
 */
import { HarnessError } from '@deepseek-ai/dsh-llm';
/** Typed failure for the subagent seam. */
export declare class SubagentError extends HarnessError {
    constructor(message: string, code: string, options?: ErrorOptions);
}
//# sourceMappingURL=error.d.ts.map