/**
 * Public-section assembly for T12 child-session inheritance.
 *
 * The main conversation's hierarchical summary is injected into every live
 * child as a shared "public memory". This module turns the main session's
 * persisted summary layers (`LayerSummary[]`, ordered by level ascending) into
 * the byte-stable public section text that all children of the same main
 * session share.
 *
 * Byte stability is the contract: given the same layers, assembly always yields
 * the exact same string, so a main session's children see an identical public
 * prefix (prefix sharing). The section text is derived purely from the layers'
 * `text` fields plus stable framing — no timestamps, no session id, no volatile
 * metadata.
 *
 * @module dsh-harness-memory-bundle/inheritance/public-section
 */
import type { LayerSummary } from '../compaction/types.ts';
/** The public-section name as registered on each child's system prompt. */
export declare const INHERITED_MAIN_SECTION = "memory:inherited-main";
/**
 * Prompt order of the inherited-main section. It must sit after the harness
 * identity (-100) and deployment persona (0), before the role/delegation
 * sections and the tool guidance band (100–199). 20 keeps it in the stable
 * "team/project → public → role" region of the composed system prompt.
 */
export declare const INHERITED_MAIN_ORDER = 20;
/**
 * Assemble the public section text from a main session's persisted layers.
 *
 * Layers arrive ordered by level ascending (L1 → L2 → L3); the public memory
 * renders coarse-to-fine so the global overview (top level) comes first and
 * finer detail follows. Empty text is dropped; an empty layer set yields an
 * empty string (the caller then registers nothing).
 *
 * @param layers - the main session's summary layers.
 * @returns the byte-stable public section body, or `''` when nothing to inject.
 */
export declare function assemblePublicSection(layers: readonly LayerSummary[]): string;
//# sourceMappingURL=public-section.d.ts.map