/**
 * A subagent's display metadata: the description, enabled switch, and model.
 *
 * It lives in its own file (`subagent.yml`) because the composition is a
 * top-level list of plugin rows — YAML cannot carry sibling keys beside it,
 * and faking a metadata row would hand the Loader something to load. Keeping
 * it separate also keeps the composition exactly what its name says: a Cordis
 * file the loader owns.
 *
 * The file carries display text plus the enabled switch. `id` is the directory
 * name and `trust` comes from the root a subagent was discovered under, so
 * neither is writable here — otherwise a locally authored subagent could
 * claim to be a shipped one. The subagent's persona and tool surface live in
 * its composition, exactly as an agent preset's do.
 *
 * Every read failure degrades to empty metadata: a subagent whose metadata is
 * missing, malformed, or unreadable still mounts its composition (presentation
 * is not a capability). Only the composition's loadability decides `broken`.
 * @module dsh-harness-subagent-bundle/preset/metadata
 */
/** The optional metadata file beside a subagent's composition. */
export declare const METADATA_FILE = "subagent.yml";
/**
 * A subagent's model override, now a MODEL-PLAN id (a "模型方案") rather than a
 * bare `{ provider, model }` pair. The plan is a fixed asset the deployment
 * owns; the subagent binds it by id, and at delegation the child session is
 * pointed at that plan so the model-plan merge interceptor routes the child's
 * requests to the plan's provider/model/params (reference semantics — editing
 * the plan changes what a bound subagent uses on its NEXT delegation).
 *
 * `reasoningEffort` is intentionally not carried here: it lives in the plan's
 * params bag, not on the subagent.
 */
export type SubagentModel = string;
/** Display metadata a subagent may publish about itself. */
export interface SubagentMetadata {
    /** One sentence on what this subagent is for. */
    readonly description?: string;
    /** Whether the subagent is enabled for delegation. */
    readonly enabled?: boolean;
    /**
     * Model-plan id the dispatched child binds. Absent leaves the child on the
     * parent's model, which is the default and the right answer for most
     * helpers — a heavy review task may bind a deeper plan than the parent's
     * default, and the binding is where that decision lives. The value is a plan
     * id (a "模型方案"), never a bare `{ provider, model }`.
     */
    readonly model?: SubagentModel;
    /**
     * Whether the delegated child also inherits the main agent's current preset
     * before the subagent's own tree is mounted on top.
     *
     * Absent (or `false`) means the subagent is self-contained: the child runs
     * ONLY on the subagent's own tree, so its tool/persona surface is exactly
     * what the subagent's composition carries. `true` means the child first
     * inherits the parent's full preset composition and then overlays the
     * subagent's own tree, with the subagent winning on name conflicts.
     *
     * The stored file carries the key ONLY when it is `true`; `false`/absent is
     * rendered as no key at all, keeping the file clean. Parsing therefore reads
     * the field as `true | undefined`, where `undefined` means "no inheritance".
     */
    readonly inheritParent?: boolean;
}
/**
 * Read one subagent directory's metadata.
 *
 * Absent, unparsable, and wrongly-shaped files are all the same answer —
 * empty metadata — because the caller renders a picker or a roster row, not a
 * diagnostic. A subagent with no metadata still mounts its composition; it
 * just shows its id and defaults.
 * @param directory - the subagent directory.
 * @returns the metadata the subagent published, possibly empty.
 */
export declare function readSubagentMetadata(directory: string): Promise<SubagentMetadata>;
/**
 * Render metadata as the file's contents.
 *
 * Absent fields are omitted rather than written empty, so a subagent with no
 * description does not ship a key that reads as an intentional blank.
 * @param metadata - the display and product metadata to store.
 * @returns the YAML document, or undefined when there is nothing to store.
 */
export declare function renderSubagentMetadata(metadata: SubagentMetadata): string | undefined;
//# sourceMappingURL=metadata.d.ts.map