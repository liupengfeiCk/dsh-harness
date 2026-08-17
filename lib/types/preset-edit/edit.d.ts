/**
 * Structured, line-scoped edits to a preset composition.
 *
 * A preset composition is a text file the loader owns (it carries `!!js`
 * expressions and hand-authored comments), so editing it must not round-trip
 * it through a YAML dump: a dump would discard every comment and re-emit the
 * rows in whatever order the loader's tree happened to hold. This module
 * instead locates the editable rows by indentation and rewrites only the
 * target key lines, leaving everything else byte-for-byte intact.
 *
 * The editable surface is deliberately small and stable:
 * - the top-level `persona` row's `config.text` (the agent's system prompt),
 * - the `delegation` group's `tool-subagent` rows — EVERY instance in the
 *   group, one per row, keyed by its instance id (`tool-subagent`,
 *   `tool-subagent-fork`, `tool-subagent-codex`, `tool-subagent-claude-code`),
 *   offering every config key that instance's provider capabilities support
 *   (spawn/fork can enforce `maxDepth` and run `continuable`, so they expose
 *   `backgroundMode` and `maxDepth`; codex/claude-code declare no such
 *   capability, so those keys are withheld). A field the file omits returns
 *   the loader's default, so the form shows the full capability surface rather
 *   than being clipped to the keys the row happens to write,
 * - the tool rows (top-level and nested, `name` of the form
 *   `@deepseek-ai/dsh-tool-*`) and whether each is enabled, for a tool
 *   inventory toggle.
 *
 * The delegation rows' `provider` is read-only identity (never offered for
 * editing) and `toolName` is read but not exposed either: it is what the model
 * calls, and editing it is out of scope for this surface.
 *
 * Tool descriptions and the installable catalog are sourced from the
 * RUNTIME package tree (see {@link discoverToolPackages}): a package a
 * preset row can reference is a package installed beside this one. A
 * deployment reading no packages still lists every tool row by id and
 * disabled state, just without prose and with an empty catalog.
 *
 * Every shape check goes through the loader's own dialect (`entryListSchema`,
 * the one carrying `!!js`), so an edit can never be judged loadable that the
 * loader would reject.
 * @module dsh-harness-subagent-bundle/preset-edit
 */
/** The delegation row's config keys the surface may edit. */
export type DelegationKey = 'provider' | 'backgroundMode' | 'enableRunInBackground' | 'maxDepth' | 'toolName';
/** One `tool-subagent` instance's current config, clipped to present keys. */
export type DelegationConfig = Partial<Record<DelegationKey, unknown>>;
/** How a tool row's disabled state reads: a literal, or a loader `!!js` expression. */
export type ToolDisabledState = boolean | 'expr';
/**
 * One delegation instance the form may edit. The keys published are decided by
 * the instance's provider capabilities, not by which keys the row happens to
 * write: every capability-supported field is present, carrying the row's own
 * value when it writes one and the loader default otherwise. `provider` is
 * read-only identity and `toolName` is present for the host's uniqueness check,
 * but neither is offered for editing.
 */
export interface DelegationInstance {
    /** The instance id within the delegation group (`tool-subagent`, …). */
    readonly id: string;
    /** Whether the instance is disabled, when the row carries a literal value. */
    readonly disabled?: boolean;
    /** The delegation provider (read-only identity). */
    readonly provider?: string;
    /** The background mode; always present (loader default `one-shot`). */
    readonly backgroundMode?: string;
    /** Whether the background-mode choice is locked to `one-shot` because the
     *  provider cannot run continuable work (codex/claude-code). The form renders
     *  the field for every instance so the layout stays uniform, but disables it
     *  when locked. */
    readonly backgroundModeLocked: boolean;
    /** Whether the instance allows background runs (provider-independent). */
    readonly enableRunInBackground?: boolean;
    /** The max-depth policy; present only when the provider can enforce a cap. */
    readonly maxDepth?: unknown;
    /** The tool name the model calls; read for uniqueness, never edited here. */
    readonly toolName?: string;
}
/** One tool row in the inventory: its id, package, enabled state, and prose. */
export interface ToolRow {
    /** The row's `- id:` (e.g. `tool-bash`). */
    readonly id: string;
    /** The row's `name` (e.g. `@deepseek-ai/dsh-tool-bash`). */
    readonly name: string;
    /**
     * Whether the row is enabled. A literal `true`/`false` is toggleable; a
     * loader `!!js` expression is not the user's to flip (it is a build-time
     * condition), so it reads as `'expr'` and a toggle request is refused.
     */
    readonly disabled: ToolDisabledState;
    /** One-sentence tool description, when `docs/tool-catalog.md` is readable. */
    readonly description?: string;
}
/**
 * One installable tool package in the "available tools" directory, as
 * discovered at runtime. `installed` is whether the preset already carries a
 * row naming this package, so a form can offer the not-yet-installed ones
 * and hide (or disable) the rest.
 */
export interface CatalogTool {
    /** The plugin package name (e.g. `@deepseek-ai/dsh-tool-fs`). */
    readonly name: string;
    /**
     * The model-visible tool names the package registers. Not enumerated at
     * runtime (the wire shape keeps the field, always empty here): the form
     * renders the package, not its members.
     */
    readonly toolNames: readonly string[];
    /** One-sentence description, when the package's own manifest publishes one. */
    readonly description?: string;
    /** Whether the preset already carries a row naming this package. */
    readonly installed: boolean;
}
/**
 * The editable fields a preset currently publishes, for the form to seed from.
 *
 * `delegation` lists every `tool-subagent` instance in the delegation group,
 * each carrying the fields its provider capabilities support (with loader
 * defaults for omitted keys). `tools` lists every tool row (top-level and
 * nested) with its enabled state.
 */
export interface EditableFields {
    /** The `persona` row's prompt text, when the row and its `config.text` exist. */
    readonly persona?: {
        readonly text: string;
    };
    /** Every delegation instance, in file order, by provider capability. */
    readonly delegation: readonly DelegationInstance[];
    /** Every tool row, in file order, with its enabled state. */
    readonly tools: readonly ToolRow[];
    /**
     * Every installable tool package discovered at runtime, each marked with
     * whether the preset already carries it. The form offers the
     * `installed: false` ones for adding without hand-editing the yaml.
     */
    readonly catalog: readonly CatalogTool[];
}
/** Why an edit set cannot be applied, naming the row and the failing field. */
export declare class InvalidPresetEditsError extends Error {
    /** The preset the edit targeted. */
    readonly presetId: string;
    /** One human-readable reason, naming the row and field. */
    readonly reason: string;
    constructor(
    /** The preset the edit targeted. */
    presetId: string, 
    /** One human-readable reason, naming the row and field. */
    reason: string);
}
/**
 * One tool package discoverable at runtime: an installable unit the catalog
 * offers. The source of truth is the installed package tree — never a
 * repository-side document, which a packaged deployment does not carry.
 */
export interface AvailableToolPackage {
    /** The plugin package name (e.g. `@deepseek-ai/dsh-tool-fs`). */
    readonly name: string;
    /** The package's own description, when its package.json publishes one. */
    readonly description?: string;
}
/**
 * Enumerate the `@deepseek-ai/dsh-tool-*` packages resolvable from this
 * package's install location, walking every `node_modules/@deepseek-ai`
 * scope directory from here up to the filesystem root.
 *
 * This is the runtime truth the available-tools catalog is built from: a
 * package a preset row can reference is a package the loader could resolve,
 * which is exactly a package installed beside this one. The scan is
 * deliberately UNcached — `dsh plugin add` lands a new package while the
 * process runs, and the catalog must offer it on the next read.
 *
 * A package whose manifest cannot be read (half-installed, unparsed) is
 * skipped rather than failing the whole enumeration; one without a
 * description still lists by name.
 * @param startDir - the directory the upward scan starts from (defaults to
 * this module's own install location; injectable for tests).
 * @returns every discoverable tool package, first-hit-wins per name.
 */
export declare function discoverToolPackages(startDir?: string): readonly AvailableToolPackage[];
/**
 * The editable fields one composition currently publishes.
 *
 * Which delegation keys exist is decided by the provider's capabilities (the
 * form offers the full capability surface, with the loader default filling any
 * omitted key); the VALUES are read through the loader's own schema, which
 * folds block scalars and resolves scalars exactly as the loader would. A
 * persona row or tool row that is absent is simply not reported.
 * @param content - the composition text.
 * @param available - the installable tool packages discovered at runtime
 * (see {@link discoverToolPackages}); the catalog and the tool rows' prose
 * are built from it, so a caller that passes none gets an empty catalog.
 * @returns the fields the form may seed from.
 */
export declare function readEditableFields(content: string, available?: readonly AvailableToolPackage[]): EditableFields;
/** The edits the surface may write to a composition. */
export interface PresetCompositionEdits {
    /** Replace the `persona` row's `config.text`; omitted leaves it alone. */
    readonly persona?: {
        readonly text?: string;
    };
    /** Write one delegation instance's config keys, keyed by its instance id. */
    readonly delegation?: Readonly<Record<string, Partial<Record<DelegationKey, unknown>>>>;
    /** Toggle one tool row's `disabled`, keyed by its row id. */
    readonly tools?: Readonly<Record<string, {
        readonly disabled: boolean;
    }>>;
    /**
     * Install tool packages by name (`@deepseek-ai/dsh-tool-*`), minting a row
     * for each that the preset does not already carry. A name already present
     * (or whose derived id collides with an existing row) is refused.
     */
    readonly installTools?: readonly string[];
    /**
     * Remove tool rows by id, deleting the whole row block (its config included).
     * A row disabled by a loader `!!js` expression is not removable — it is not
     * the user's to flip.
     */
    readonly removeTools?: readonly string[];
}
/**
 * Apply structured edits to a composition, returning the new text.
 *
 * Only the named fields change. Comments, sibling rows, other plugin rows, and
 * the file's ordering are preserved byte-for-byte. The result is verified with
 * the loader's own schema before it is returned.
 * @param content - the current composition text.
 * @param edits - the fields to change.
 * @param presetId - the preset id, for refusal diagnostics.
 * @returns the edited composition, guaranteed loadable by `entryListSchema`.
 * @throws when a targeted row or key is absent, a tool's `disabled` is a loader
 * expression (not user-toggleable), a delegation edit would leave two
 * instances sharing a `toolName`, or the edited composition is not valid YAML
 * under the loader's dialect.
 */
export declare function applyEdits(content: string, edits: PresetCompositionEdits, presetId: string): string;
//# sourceMappingURL=edit.d.ts.map