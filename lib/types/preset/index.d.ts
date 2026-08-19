/**
 * User-defined helper subagents: a registry over independently stored,
 * user-authored agent profiles that a main agent can dispatch by name.
 *
 * Each subagent is one directory holding an `agent.cordis.yml` composition
 * (the same plugin tree an agent preset is) plus optional `subagent.yml`
 * metadata (name, description, system prompt, model, enabled).
 * Subagents live in their OWN roots — the harness-home `~/.dsh/subagents/`
 * for locally authored ones and a deployment-supplied factory root — fully
 * separate from the agent-preset roster, so a subagent NEVER appears in the
 * main agent-preset list.
 *
 * This package owns the subagent vocabulary, filesystem discovery, and the
 * guarded mounting of a subagent's plugin tree onto a child agent's scope. It
 * does not decide when a child is created; the child factory's setup calls
 * {@link SubagentPresets.mountOnChild}.
 * @module dsh-harness-subagent-bundle/preset
 */
import { Service } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import type { Context } from '@deepseek-ai/cordis';
/**
 * The shipped factory-subagent root, resolved from this package's own install.
 *
 * A subagent's composition directory ships beside the package source and its
 * compiled `lib/` as a sibling `factory/` directory at the package root. This
 * is resolved by walking up from the current module to the package root (see
 * {@link resolvePackageRoot}), so both the `src/preset/index.ts` and
 * `lib/types/preset/index.js` layouts land on the package's `factory/`. The
 * directory is published through this package's `files` list, so the shipped
 * `code-reviewer` subagent rides with the package wherever it is installed —
 * "code ships with the package", no launcher-side root injection required.
 */
export declare const FACTORY_SUBAGENT_ROOT: string;
import { type CatalogTool, type PresetCompositionEdits, type ToolRow } from '../preset-edit/index.ts';
import type { SubagentMetadata } from './metadata.ts';
import { type Config, type SubagentPreset, type SubagentRoot } from './types.ts';
export { COMPOSITION_FILE, discoverSubagents, scanRoot, USER_SUBAGENT_DIR } from './discovery.ts';
export { METADATA_FILE, readSubagentMetadata, renderSubagentMetadata, type SubagentMetadata, type SubagentModel, } from './metadata.ts';
export { ENABLED_OVERRIDES_FILE, InvalidSubagentIdError, SubagentExistsError, SubagentNotWritableError, createSubagent, deleteSubagent, readComposition, readEnabledOverrides, setEnabledField, updateSubagent, writeComposition, writeEnabledOverride, writableRoot, } from './authoring.ts';
export { mountSubagentOnChild } from './mount.ts';
export { UnknownSubagentError, SUBAGENT_ID } from './types.ts';
export type { Config, SubagentPreset, SubagentRoot, SubagentTrust } from './types.ts';
declare module '@deepseek-ai/cordis' {
    interface Context {
        subagentPresets: SubagentPresets;
    }
}
/**
 * Registry over the deployment's user-defined helper subagents.
 *
 * Discovery is unmemoized: `list()` and `resolve()` re-read the roots on every
 * call so a subagent authored while the process runs is visible immediately,
 * and a subagent deleted underneath a picker disappears from the next read.
 */
export declare class SubagentPresets extends Service {
    config: Config;
    static inject: string[];
    /** Runtime schema for the subagent roster. */
    static Config: z<Config>;
    /**
     * The roots discovery and authoring actually scan: every configured root in
     * order, then the harness-home user root unless `includeUserRoot` is false.
     * Derived once, because a root set that changed between `list()` and the
     * `create()` acting on its answer would author into a directory the caller
     * never saw.
     */
    private readonly resolvedRoots;
    constructor(ctx: Context, config: Config);
    /**
     * Every subagent the configured roots currently supply.
     * @returns the subagents, first-root-wins per id.
     */
    list(): Promise<SubagentPreset[]>;
    /**
     * Resolve one subagent by id.
     *
     * A broken subagent resolves — deleting one, reading one, and reporting one
     * all need the row — and the mounting paths refuse it AFTER resolution
     * through {@link resolveMountable}.
     * @param id - the subagent id.
     * @returns the resolved subagent.
     * @throws when no configured root supplies that id.
     */
    resolve(id: string): Promise<SubagentPreset>;
    /**
     * Resolve one subagent that is about to compose a child, refusing a broken
     * or disabled one. Failing here rather than inside the loader keeps the
     * answer the same for every unloadable shape and spends no mount attempt on
     * a composition discovery already read as unusable. A disabled subagent is
     * refused exactly like a broken one: a user who turned a helper off does not
     * expect a delegation to silently re-enable it.
     * @param id - the subagent id.
     * @returns the resolved, mountable subagent.
     * @throws when the subagent is unknown, broken, or disabled.
     */
    private resolveMountable;
    /**
     * Mount one subagent's plugin tree onto a child agent's own scope.
     *
     * This is how a delegation tool applies a named subagent at dispatch: the
     * child's creation window calls this after inheriting its parent's
     * composition, so the two coexist. The subagent is resolved by id from this
     * registry and its composition is mounted onto the child via the shared
     * plugin-tree mechanism.
     * @param childCtx - the child agent's scoped creation context.
     * @param id - the subagent id to mount onto the child.
     * @returns the resolved, mountable subagent, so the caller (the child's
     * creation window) can read its metadata — the model override it carries —
     * after the tree is mounted.
     * @throws when the subagent is unknown, broken, or disabled.
     */
    mountOnChild(childCtx: Context, id: string): Promise<SubagentPreset>;
    /**
     * The roots this roster scans, which is not `config.roots`: it is every
     * configured root in order, then the harness-home user root unless
     * `includeUserRoot` is false.
     */
    get roots(): readonly SubagentRoot[];
    /** Whether this deployment has a root locally authored subagents go to. */
    get authorable(): boolean;
    /**
     * Read one subagent's composition text.
     * @param id - the subagent id.
     * @returns the composition exactly as stored.
     * @throws when no configured root supplies that id.
     */
    read(id: string): Promise<string>;
    /**
     * Create a locally authored subagent by copying an existing one whole.
     *
     * Copy is the only creation write. Composition text never crosses this seam:
     * the source is named by id and its directory is copied as it stands, so the
     * copy is exactly as loadable as its source.
     * @param from - the subagent the copy starts from; shipped factory subagents
     * are the primary source, so any trust is accepted.
     * @param id - the new subagent's id, which becomes its directory name.
     * @throws when the source is unknown, the id is unusable or already taken,
     * or the deployment configures no writable root.
     */
    create(from: string, id: string): Promise<void>;
    /**
     * Delete a locally authored subagent.
     * @param id - the subagent id.
     * @throws when the subagent is unknown or ships with the deployment.
     */
    remove(id: string): Promise<void>;
    /**
     * Rewrite one locally authored subagent's metadata as a whole, including its
     * enabled switch. Absent keys are cleared.
     * @param id - the subagent id.
     * @param metadata - the complete metadata to store.
     * @throws when the subagent is unknown or ships with the deployment.
     */
    update(id: string, metadata: SubagentMetadata): Promise<void>;
    /**
     * Read the fields one locally authored subagent's edit form may edit, for a
     * surface to seed a form and clip its controls to the keys the composition
     * actually carries. Mirrors the agent-preset edit surface minus delegation,
     * which is a dispatch-time property and never part of a subagent's own
     * composition.
     * @param id - the subagent id.
     * @returns the persona text (when the composition carries a persona row),
     * every tool row's enabled state, the installable-tool catalog, and the
     * display metadata.
     * @throws when no configured root supplies that id.
     */
    readEditable(id: string): Promise<{
        persona?: {
            text: string;
        };
        tools: readonly ToolRow[];
        catalog: readonly CatalogTool[];
        metadata: SubagentMetadata;
    }>;
    /**
     * Rewrite one locally authored subagent's composition fields and display
     * metadata.
     *
     * The request carries only structured field values — no composition text and
     * no path — so the Host resolves, locates, and rewrites the subagent itself.
     * Only fields the edit names change; everything else in the files (other
     * plugin rows, comments, ordering, `!!js` expressions) is preserved, and the
     * edited composition is validated with the loader's own schema before it is
     * written. A shipped subagent is refused.
     * @param id - the subagent id.
     * @param edits - the composition edits to apply.
     * @param metadata - the complete metadata to store, when the caller staged
     * any; absent keys are cleared.
     * @throws when the subagent is unknown or ships with the deployment, or the
     * edited composition fails the loader's schema.
     */
    updateComposition(id: string, edits: PresetCompositionEdits, metadata?: SubagentMetadata): Promise<void>;
    /**
     * Toggle one subagent's enabled switch, persisting whether the main agent
     * may delegate to it.
     *
     * A locally authored subagent's switch writes to its own `subagent.yml`. A
     * shipped one cannot rewrite its install, so its switch writes a
     * harness-home override that discovery merges on the next read — the row
     * therefore honors it exactly like a locally authored field.
     * @param id - the subagent id.
     * @param enabled - whether the subagent is usable for delegation.
     * @throws when the subagent is unknown.
     */
    setEnabled(id: string, enabled: boolean): Promise<void>;
}
export default SubagentPresets;
//# sourceMappingURL=index.d.ts.map