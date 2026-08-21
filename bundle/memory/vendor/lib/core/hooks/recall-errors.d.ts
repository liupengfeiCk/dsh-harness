/**
 * Recall error taxonomy (H-15).
 *
 * Design: keep fast-fail throw semantics at the lowest level (searchMemories etc.),
 * but classify errors into structured RecallError types so the top-level handler
 * (performAutoRecallInner) can translate them into RecallResult.error rather than
 * propagating as raw rejections. Gateway layer then returns HTTP 200 + envelope.code
 * to distinguish "no recall results" vs "recall failed".
 *
 * Numeric code space:
 *   1xxxx — config (non-retryable, usually requires ops action)
 *   2xxxx — dependency (retryable, transient)
 *   3xxxx — storage (retryable)
 *   9xxxx — internal (non-retryable, indicates a bug)
 *
 * The codes are stable wire contract; never reuse a number for a different meaning.
 */
export type RecallErrorCategory = "config" | "dependency" | "storage" | "internal";
export interface RecallError {
    /** Stable numeric business code; 0 = ok (success path never emits a RecallError). */
    code: number;
    category: RecallErrorCategory;
    /** Safe message — must not contain paths, stack traces, SQL fragments, or credentials. */
    message: string;
    /** Whether the client may retry the same request and reasonably expect a different outcome. */
    retryable: boolean;
}
/**
 * Thrown at the lowest level (e.g. searchMemories) and caught at the top-level
 * (performAutoRecallInner). Carries a RecallError plus an optional `cause` for logging.
 */
export declare class RecallFailure extends Error {
    readonly recallError: RecallError;
    readonly cause?: unknown;
    constructor(recallError: RecallError, cause?: unknown);
}
/**
 * Factory functions — centralizes the numeric code → message mapping so we never
 * accidentally emit two different `code` values for the same error category.
 */
export declare const RecallErrors: {
    configMissingEmbedding(strategy: string): RecallFailure;
    configInvalidStrategy(strategy: string): RecallFailure;
    dependencyTimeout(op: string): RecallFailure;
    dependencyUnavailable(op: string, cause?: unknown): RecallFailure;
    storageError(op: string, cause?: unknown): RecallFailure;
    internal(cause?: unknown): RecallFailure;
};
/**
 * Type guard / converter: turn any unknown thrown value into a RecallFailure.
 *
 * - RecallFailure → pass-through
 * - AbortError / TimeoutError → dependencyTimeout
 * - everything else → internal (wraps original as `cause`)
 */
export declare function toRecallFailure(err: unknown): RecallFailure;
