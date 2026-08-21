/**
 * Text sanitization for memory pipeline (capture & recall).
 * Removes injected tags, gateway metadata, media noise, etc.
 */
/**
 * Clean text for the memory pipeline: remove injected tags, metadata,
 * timestamps, media markers and base64 image data.
 *
 * Used by both capture (L0 recording) and recall (query cleaning) paths.
 */
export declare function sanitizeText(text: string): string;
/**
 * Strip fenced code blocks from assistant replies before L0 capture.
 *
 * AI responses often contain large code snippets (```...```) that dilute
 * the semantic signal for embedding and memory extraction. This function
 * removes only the code block content while preserving surrounding
 * natural-language explanations.
 *
 * Only applied to `role=assistant` messages in the L0 capture path —
 * user messages and recall queries are NOT affected.
 */
export declare function stripCodeBlocks(text: string): string;
/**
 * L0 capture filter — intentionally **permissive**.
 *
 * L0 is the raw conversation archive. We want to preserve as much user input
 * as possible so that downstream stages (L1 extraction, search, analytics)
 * have the full picture. Only messages that are *structurally* useless are
 * dropped here:
 *   - Empty / whitespace-only text
 *   - Framework-internal noise (bootstrap, session reset, NO_REPLY, …)
 *   - Slash commands (/new, /reset, …)
 *
 * Content-quality filters (length, symbols, prompt injection) are deferred
 * to {@link shouldExtractL1}.
 */
export declare function shouldCaptureL0(text: string): boolean;
/**
 * L1 extraction filter — **strict** quality gate.
 *
 * Applied when L0 messages are fed into the LLM extraction pipeline.
 * Filters out content that is too short, too long, purely symbolic,
 * or looks like a prompt-injection attack — none of which should
 * become structured memories.
 *
 * This function is a superset of {@link shouldCaptureL0}: anything
 * rejected by L0 is also rejected here, plus additional quality checks.
 */
export declare function shouldExtractL1(text: string): boolean;
/**
 * @deprecated Use {@link shouldExtractL1} (strict) or {@link shouldCaptureL0} (permissive) instead.
 *
 * Kept as an alias of `shouldExtractL1` for backward compatibility.
 */
export declare const shouldCapture: typeof shouldExtractL1;
/**
 * Detect likely prompt-injection / jailbreak attempts.
 *
 * Normalises whitespace before matching to defeat trivial obfuscation
 * (e.g. extra spaces / newlines between keywords).
 */
export declare function looksLikePromptInjection(text: string): boolean;
/**
 * Pick up to `max` recent unique texts.
 */
export declare function pickRecentUnique(texts: string[], max: number): string[];
/**
 * Escape XML-like tags in text to prevent tag injection attacks.
 *
 * When memory content or persona text is injected into XML-delimited sections
 * (e.g. `<user-persona>...</user-persona>`), a malicious user could craft content
 * containing `</user-persona>` to break out of the section boundary.
 *
 * This function escapes `<` and `>` in known dangerous patterns (closing tags
 * that match our injection boundaries) so the content cannot prematurely close
 * the XML section.
 */
export declare function escapeXmlTags(text: string): string;
/**
 * Sanitize a raw JSON string from LLM output so that `JSON.parse` won't throw
 * "Bad control character in string literal".
 *
 * Per RFC 8259 §7, U+0000–U+001F MUST be escaped inside JSON string literals.
 * LLMs sometimes produce unescaped control characters (raw newlines, tabs, etc.)
 * inside string values.
 *
 * Strategy (two-phase):
 *  1. **Precise pass** — walk through JSON string literals (delimited by `"`)
 *     and escape any unescaped U+0000–U+001F inside them to `\uXXXX` form,
 *     while leaving structural whitespace (between values) untouched.
 *  2. **Fallback** — if the precise pass still fails `JSON.parse`, fall back to
 *     a simple global strip of rare control chars (\x00–\x08, \x0b, \x0c,
 *     \x0e–\x1f) which are almost never meaningful in natural-language content.
 */
export declare function sanitizeJsonForParse(raw: string): string;
