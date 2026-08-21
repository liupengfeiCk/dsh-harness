/**
 * Summary tagging: marks compaction-produced content as "not a memory
 * distillation source".
 *
 * Per §4.3/§5, compressed summaries are the current session's context-management
 * artifact, NOT long-term memory material. If an async distillation pipeline
 * later scans the session it must skip summary layers — otherwise it would
 * re-distill "a summary of a summary" (the exact double-distillation the design
 * retires). This module centralizes the marker so the compaction engine stamps
 * its products and any consumer can recognize them.
 *
 * @module dsh-harness-memory-bundle/compaction/tag
 */
/**
 * Stable marker carried on every summary layer to forbid re-distillation.
 * Mirrors the session-log "ignorable" semantics: a reader that understands it
 * skips the content; a reader that does not treats it as ordinary content and
 * changes nothing about other events.
 */
export declare const NON_DISTILLABLE_SOURCE: "compaction-summary";
/** Alias exposed for consumers that read the marker from storage/metadata. */
export declare const SUMMARY_SOURCE_TAG: "compaction-summary";
/**
 * Build the metadata bag stamped onto a summary layer to identify it as a
 * non-distillable compaction product.
 * @param level - the summary layer's depth (0 is raw, never stamped).
 * @returns a frozen metadata record, or `undefined` for raw (level 0) content.
 */
export declare function summarySourceMetadata(level: number): Readonly<{
    source: typeof NON_DISTILLABLE_SOURCE;
    level: number;
}> | undefined;
/**
 * Whether a content/metadata bag identifies a non-distillable compaction
 * product. Consumers (e.g. an async distillation pipeline) use this to skip
 * summary layers.
 * @param metadata - the content's metadata, or `undefined` for raw content.
 */
export declare function isNonDistillable(metadata: unknown): boolean;
//# sourceMappingURL=tag.d.ts.map