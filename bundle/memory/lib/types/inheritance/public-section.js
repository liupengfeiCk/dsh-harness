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
/** The public-section name as registered on each child's system prompt. */
export const INHERITED_MAIN_SECTION = 'memory:inherited-main';
/**
 * Prompt order of the inherited-main section. It must sit after the harness
 * identity (-100) and deployment persona (0), before the role/delegation
 * sections and the tool guidance band (100–199). 20 keeps it in the stable
 * "team/project → public → role" region of the composed system prompt.
 */
export const INHERITED_MAIN_ORDER = 20;
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
export function assemblePublicSection(layers) {
    const rendered = layers
        // Coarse-to-fine: top level (largest) first.
        .slice()
        .sort((a, b) => b.level - a.level)
        .map(layer => layer.text.trim())
        .filter(text => text.length > 0);
    if (rendered.length === 0)
        return '';
    // The layers are already distilled prose; a short frame clarifies the role.
    return [
        '[主对话公共记忆] 以下是主对话进展的分层摘要（粗→细），供本次子任务对齐全局上下文。',
        ...rendered,
    ].join('\n\n');
}
//# sourceMappingURL=public-section.js.map