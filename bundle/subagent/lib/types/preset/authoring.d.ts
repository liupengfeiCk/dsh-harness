/**
 * Reading, creating, editing, deleting, and toggling locally authored
 * subagents.
 *
 * Authoring is confined to a `user` root: the shipped `.system` set is part of
 * the deployment, and letting a browser rewrite it would turn "reset to a
 * known subagent" into something the same caller could have broken first.
 *
 * A subagent is its directory: a composition plus optional metadata. The only
 * creation write is a whole-directory copy of an existing subagent (a shipped
 * factory one is the primary source). Metadata edits and the enabled toggle
 * are structured writes against `subagent.yml`; the composition text itself is
 * never supplied across a seam — it is the author's to edit in the files.
 * @module dsh-harness-subagent-bundle/preset/authoring
 */
import { type SubagentMetadata } from './metadata.ts';
import { type SubagentPreset, type SubagentRoot } from './types.ts';
/** A subagent id that cannot be used as a directory name under a root. */
export declare class InvalidSubagentIdError extends Error {
    /** The rejected id. */
    readonly subagentId: string;
    constructor(
    /** The rejected id. */
    subagentId: string);
}
/** A create target that is already occupied — a create never overwrites. */
export declare class SubagentExistsError extends Error {
    /** The id that is already taken. */
    readonly subagentId: string;
    constructor(
    /** The id that is already taken. */
    subagentId: string);
}
/** Authoring was attempted where the deployment allows none. */
export declare class SubagentNotWritableError extends Error {
    /** What the caller tried to change, for the diagnostic. */
    readonly subagentId: string;
    constructor(
    /** What the caller tried to change, for the diagnostic. */
    subagentId: string, reason: string);
}
/**
 * Harness-home file holding a person's enabled-state overrides for SHIPPED
 * subagents. A shipped subagent's `subagent.yml` is part of the deployment and
 * stays untouched; the override lives beside the user's own subagents so it
 * survives upgrades and is readable by every deployment.
 */
export declare const ENABLED_OVERRIDES_FILE = "subagents-enabled.json";
/**
 * Read the harness-home enabled overrides for shipped subagents.
 * @returns a map of subagent id to overridden enabled state.
 */
export declare function readEnabledOverrides(): Promise<Readonly<Record<string, boolean>>>;
/**
 * Write one enabled override for a shipped subagent, preserving the rest.
 * @param id - the shipped subagent id.
 * @param enabled - the overridden enabled state.
 */
export declare function writeEnabledOverride(id: string, enabled: boolean): Promise<void>;
/**
 * The root locally authored subagents are written to.
 * @param roots - the configured roots in precedence order.
 * @returns the absolute path of the first `user` root.
 * @throws when the deployment configured no writable root.
 */
export declare function writableRoot(roots: readonly SubagentRoot[]): string;
/**
 * Read one subagent's composition text.
 * @param subagent - the resolved subagent.
 * @returns the file's contents.
 */
export declare function readComposition(subagent: SubagentPreset): Promise<string>;
/**
 * Write one subagent's composition text atomically.
 *
 * The write is confined to a locally authored subagent by the caller (the
 * shipped set is not writable); the file keeps its existing mode and is never
 * made world-readable, since a composition can carry `!!js` expressions that
 * run at load.
 * @param subagent - the resolved subagent.
 * @param content - the new contents.
 */
export declare function writeComposition(subagent: SubagentPreset, content: string): Promise<void>;
/**
 * Create a subagent by copying an existing one's whole directory.
 *
 * The copy carries everything the source directory holds — composition,
 * metadata, skill directories, assets — because a subagent is its directory,
 * not one file. Symlinks are dereferenced so the copy is self-contained.
 * The copied metadata is then rewritten: the source's fields are kept as
 * they stand (the copy is an exact duplicate of the source's metadata).
 * @param roots - the configured roots; the first `user` one receives the copy.
 * @param source - the resolved subagent the copy starts from.
 * @param id - the new subagent's id, which becomes its directory name.
 * @returns the absolute path of the new subagent directory.
 * @throws when the id is unusable or already occupied on disk, or the
 * deployment configures no writable root.
 */
export declare function createSubagent(roots: readonly SubagentRoot[], source: SubagentPreset, id: string): Promise<string>;
/**
 * Delete a locally authored subagent.
 *
 * A shipped subagent is refused: it belongs to the deployment. A subagent a
 * live child mounted is NOT refused — the composition was read at creation and
 * is never re-read, so that child keeps running exactly as it was.
 * @param roots - the configured roots.
 * @param subagent - the resolved subagent to remove.
 * @throws when the subagent ships with the deployment or lies outside the
 * writable root.
 */
export declare function deleteSubagent(roots: readonly SubagentRoot[], subagent: SubagentPreset): Promise<void>;
/** The editable fields one update writes to a subagent's metadata. */
/**
 * Rewrite a locally authored subagent's metadata as a WHOLE.
 *
 * The metadata object the caller passes is the complete intended metadata: a
 * key that appears is written with that value, a key that is absent is
 * cleared. This is deliberate — an edit form submits every field it owns, so
 * clearing a description (an empty string) or resetting the model (an empty
 * pick, "inherit the parent") genuinely removes the stored value rather than
 * silently keeping the old one. The enabled switch rides this channel too
 * when a form submits the full surface. A shipped subagent is refused, exactly
 * like delete — its install is not the user's to manage.
 * @param roots - the configured roots.
 * @param subagent - the resolved subagent to edit.
 * @param metadata - the complete metadata to store; absent keys are cleared.
 * @throws when the subagent ships with the deployment or lies outside the
 * writable root.
 */
export declare function updateSubagent(roots: readonly SubagentRoot[], subagent: SubagentPreset, metadata: SubagentMetadata): Promise<void>;
/**
 * Flip one locally authored subagent's enabled switch, leaving its other
 * metadata fields alone.
 *
 * This is the row-level toggle's write path: unlike {@link updateSubagent}'s
 * whole-metadata replace, it touches only the enabled key so a shipped or
 * locally authored row's description and model survive a toggle. A shipped
 * subagent is refused here — its override is written by the caller through
 * {@link writeEnabledOverride}.
 * @param roots - the configured roots.
 * @param subagent - the resolved subagent to edit.
 * @param enabled - the new enabled state.
 * @throws when the subagent ships with the deployment or lies outside the
 * writable root.
 */
export declare function setEnabledField(roots: readonly SubagentRoot[], subagent: SubagentPreset, enabled: boolean): Promise<void>;
//# sourceMappingURL=authoring.d.ts.map