/**
 * Shared text utility functions for the memory-tdai plugin.
 */
/**
 * Extract meaningful words from text (supports CJK and Latin).
 *
 * Used by both auto-recall (keyword search) and l1-dedup (keyword candidate recall).
 * Extracted to a shared module to prevent implementation drift.
 */
export declare function extractWords(text: string): Set<string>;
