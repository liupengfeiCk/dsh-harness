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
/**
 * Thrown at the lowest level (e.g. searchMemories) and caught at the top-level
 * (performAutoRecallInner). Carries a RecallError plus an optional `cause` for logging.
 */
export class RecallFailure extends Error {
    recallError;
    cause;
    constructor(recallError, cause) {
        super(recallError.message);
        this.recallError = recallError;
        this.cause = cause;
        this.name = "RecallFailure";
    }
}
/**
 * Factory functions — centralizes the numeric code → message mapping so we never
 * accidentally emit two different `code` values for the same error category.
 */
export const RecallErrors = {
    configMissingEmbedding(strategy) {
        return new RecallFailure({
            code: 10001,
            category: "config",
            message: `Recall strategy "${strategy}" requires EmbeddingService but it is not available.`,
            retryable: false,
        });
    },
    configInvalidStrategy(strategy) {
        return new RecallFailure({
            code: 10002,
            category: "config",
            message: `Unknown recall strategy "${strategy}".`,
            retryable: false,
        });
    },
    dependencyTimeout(op) {
        return new RecallFailure({
            code: 20001,
            category: "dependency",
            message: `Recall ${op} timed out`,
            retryable: true,
        });
    },
    dependencyUnavailable(op, cause) {
        return new RecallFailure({
            code: 20002,
            category: "dependency",
            message: `Recall ${op} service unavailable`,
            retryable: true,
        }, cause);
    },
    storageError(op, cause) {
        return new RecallFailure({
            code: 30001,
            category: "storage",
            message: `Recall storage operation failed: ${op}`,
            retryable: true,
        }, cause);
    },
    internal(cause) {
        return new RecallFailure({
            code: 90001,
            category: "internal",
            message: "Internal recall error",
            retryable: false,
        }, cause);
    },
};
/**
 * Type guard / converter: turn any unknown thrown value into a RecallFailure.
 *
 * - RecallFailure → pass-through
 * - AbortError / TimeoutError → dependencyTimeout
 * - everything else → internal (wraps original as `cause`)
 */
export function toRecallFailure(err) {
    if (err instanceof RecallFailure)
        return err;
    if (err instanceof Error) {
        if (err.name === "AbortError" || err.name === "TimeoutError") {
            return RecallErrors.dependencyTimeout("recall");
        }
    }
    return RecallErrors.internal(err);
}
