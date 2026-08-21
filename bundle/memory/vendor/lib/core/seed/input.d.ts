/**
 * Input loading, validation, normalization, and timestamp handling for the `seed` command.
 *
 * Responsibilities:
 * 1. Load raw JSON from file
 * 2. Detect Format A (`{ sessions: [...] }`) vs Format B (`[...]`)
 * 3. Six-layer validation (file → top-level → session → round → message → timestamp consistency)
 * 4. Normalize into NormalizedInput with auto-generated sessionIds
 * 5. Timestamp all-or-none check + fill strategy
 */
import type { ValidationError, NormalizedInput, SeedCommandOptions } from "./types.js";
export interface LoadAndValidateResult {
    /** Normalized input ready for pipeline consumption. */
    input: NormalizedInput;
    /** Whether the user needs to confirm timestamp auto-fill. */
    needsTimestampConfirmation: boolean;
}
/**
 * Load, validate, and normalize seed input from a file.
 *
 * Throws on fatal validation errors with a human-readable message
 * that includes all collected errors.
 */
export declare function loadAndValidateInput(opts: Pick<SeedCommandOptions, "input" | "sessionKey" | "strictRoundRole">): LoadAndValidateResult;
/**
 * Validate and normalize seed input from an already-parsed JSON object.
 *
 * This is the gateway-friendly variant of `loadAndValidateInput` — it skips
 * the file-system layer (Layer 1) and accepts the raw parsed body directly.
 * Timestamps missing from all messages are auto-filled (no interactive
 * confirmation needed in HTTP context).
 *
 * Throws `SeedValidationError` on validation failures.
 */
export declare function validateAndNormalizeRaw(raw: unknown, opts?: {
    sessionKey?: string;
    strictRoundRole?: boolean;
    autoFillTimestamps?: boolean;
}): NormalizedInput;
/**
 * Fill timestamps for all messages when the input has no timestamps.
 *
 * Uses a single monotonically increasing counter across ALL sessions
 * to guarantee global timestamp ordering. This is critical when multiple
 * sessions share the same sessionKey — the L0 capture cursor (advanced
 * per-session) would filter out later sessions whose timestamps fall
 * below the cursor if ordering were not globally monotonic.
 */
export declare function fillTimestamps(input: NormalizedInput): void;
export declare class SeedValidationError extends Error {
    readonly errors: ValidationError[];
    constructor(errors: ValidationError[]);
}
