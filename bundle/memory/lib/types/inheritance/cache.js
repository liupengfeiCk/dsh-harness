/**
 * Process-local public-section cache for T12 child-session inheritance.
 *
 * The inherited-main system section uses a synchronous text provider (the
 * `SystemPrompt` API evaluates section text synchronously per assembly), while
 * reading the main session's summary layers from disk is asynchronous. This
 * cache bridges the two: memory writes the assembled public section here (on
 * child creation and after a main-session compression), and each child's text
 * provider reads the cached string synchronously.
 *
 * Keyed by the main session id so all children of the same main session share
 * one byte-identical section (prefix sharing). Refreshing the cache for a main
 * session immediately changes what every live child renders on its next
 * assembly — the compression-refresh mechanism with zero per-assembly cost.
 *
 * @module dsh-harness-memory-bundle/inheritance/cache
 */
/** Per-main-session public-section cache. */
export class PublicSectionCache {
    cache = new Map();
    /** Store the assembled public section for one main session. */
    set(mainSessionId, section) {
        this.cache.set(mainSessionId, section);
    }
    /** Read the cached section synchronously; `''` when absent. */
    get(mainSessionId) {
        return this.cache.get(mainSessionId) ?? '';
    }
    /** Drop one main session's entry (e.g. when its children are gone). */
    delete(mainSessionId) {
        this.cache.delete(mainSessionId);
    }
    /** Whether a main session has a cached section. */
    has(mainSessionId) {
        return this.cache.has(mainSessionId);
    }
}
//# sourceMappingURL=cache.js.map