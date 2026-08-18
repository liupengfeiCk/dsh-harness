/**
 * Bundle-patch parsing for the harness hot mount surface.
 *
 * The hot mounter must know, of an installed plugin's `cordis.patch.yml`, which
 * rows it can pull into the running composition. We parse with the SAME
 * js-yaml dialect the include plugin itself mounts (`entryListSchema`, the
 * `!!js` expression-aware schema from `@deepseek-ai/cordis-plugin-include`), so
 * a parsed patch never drifts from what a boot would load — unlike the market's
 * hand-written line regex.
 *
 * Only two row shapes are hot-mountable:
 *   - `insert` rows: `{ id, name, config? }` with a STATIC key-value `config`.
 *     A `!!js` expression anywhere inside a row's `config` (or `disabled`)
 *     evaluates against a loader context that only exists at boot — it cannot
 *     be re-evaluated here, so such a patch is refused with "restart required".
 *   - `disabled` override rows: `{ id, disabled: <boolean> }`. These target an
 *     already-mounted row by id (never restating `name`, matching the loader's
 *     patch semantics), so they are hot-applied as-is.
 *
 * Anything else — nested groups, `inject`/`isolate`/`intercept` keys, non-boolean
 * `disabled`, or expressions — is refused rather than half-applied. The caller
 * then falls back to restart activation.
 * @module dsh-harness-hot-bundle/patch
 */
/** One hot-mountable `insert` row of a bundle patch. */
export interface HotInsertRow {
    kind: 'insert';
    /** The row's id; the hot mounter prefixes it before mounting. */
    id: string;
    /** The module specifier the row mounts (a package export or a builtin). */
    name: string;
    /** Static key-value config, when the patch declares one. */
    config?: Record<string, unknown>;
}
/** One hot-mountable `disabled` override row of a bundle patch. */
export interface HotDisableRow {
    kind: 'disable';
    /** The id of the row to disable; applied as-is (no prefix). */
    id: string;
}
/** A hot-mountable row of a bundle patch. */
export type HotRow = HotInsertRow | HotDisableRow;
/** Parse failure: the patch contains a shape that can only activate on restart. */
export declare class RestartRequiredError extends Error {
    constructor(reason: string);
}
/**
 * Parse a bundle's `cordis.patch.yml` text into hot-mountable rows.
 *
 * Uses the include plugin's own `entryListSchema`, so the accepted dialect is
 * exactly what a boot loads. Rows that cannot hot-mount (expressions, nested
 * groups, non-key-value config, structural keys) throw {@link RestartRequiredError}.
 * @param patchText - the raw bundle patch text.
 * @returns the hot-mountable rows, in patch order.
 */
export declare function parsePatch(patchText: string): HotRow[];
//# sourceMappingURL=patch.d.ts.map