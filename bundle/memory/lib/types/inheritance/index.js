/**
 * T12 child-session inheritance — public surface.
 *
 * The inherited-main public section that a main conversation's hierarchical
 * summary injects into every live subagent child (§4.4 inheritance mode), plus
 * the non-inheritance switch honored per role.
 *
 * @module dsh-harness-memory-bundle/inheritance
 */
export { installInheritance, } from "./inject.js";
export { assemblePublicSection, INHERITED_MAIN_ORDER, INHERITED_MAIN_SECTION, } from "./public-section.js";
export { PublicSectionCache } from "./cache.js";
//# sourceMappingURL=index.js.map