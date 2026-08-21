/**
 * T12 child-session inheritance — public surface.
 *
 * The inherited-main public section that a main conversation's hierarchical
 * summary injects into every live subagent child (§4.4 inheritance mode), plus
 * the non-inheritance switch honored per role.
 *
 * @module dsh-harness-memory-bundle/inheritance
 */
export { installInheritance, type InheritanceDeps, } from './inject.ts';
export { assemblePublicSection, INHERITED_MAIN_ORDER, INHERITED_MAIN_SECTION, } from './public-section.ts';
export { PublicSectionCache } from './cache.ts';
//# sourceMappingURL=index.d.ts.map