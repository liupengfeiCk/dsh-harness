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
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Service } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import { dshHomePath } from "../home-path.js";
import { discoverSubagents, USER_SUBAGENT_DIR } from "./discovery.js";
/**
 * Resolve this package's own root from the current module's URL, walking up
 * from the module's directory until a directory containing `package.json` is
 * found. This locates the package root regardless of how deep the module is
 * compiled: `src/preset/index.ts` (development) and `lib/types/preset/index.js`
 * (built install) sit at different depths, so no fixed `../..` count can serve
 * both. Falls back to the starting directory (whose `factory/` then does not
 * exist and scans as empty) when no `package.json` is found — a genuine
 * anomaly, so it is surfaced rather than silent.
 */
function resolvePackageRoot(moduleUrl) {
    let dir = dirname(fileURLToPath(moduleUrl));
    for (;;) {
        if (existsSync(join(dir, 'package.json')))
            return dir;
        const parent = dirname(dir);
        if (parent === dir)
            break;
        dir = parent;
    }
    console.warn('[dsh-harness-subagent-bundle] could not locate package.json above the factory-subagent module; factory/ root unresolved');
    return dirname(fileURLToPath(moduleUrl));
}
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
export const FACTORY_SUBAGENT_ROOT = join(resolvePackageRoot(import.meta.url), 'factory');
import { applyEdits, discoverToolPackages, readEditableFields, } from "../preset-edit/index.js";
import { SubagentExistsError, SubagentNotWritableError, createSubagent, deleteSubagent, readComposition, setEnabledField, updateSubagent, writeComposition, writeEnabledOverride, } from "./authoring.js";
import { mountSubagentOnChild } from "./mount.js";
import { UnknownSubagentError } from "./types.js";
import { registerSubagentPresetWire } from "./wire/index.js";
export { COMPOSITION_FILE, discoverSubagents, scanRoot, USER_SUBAGENT_DIR } from "./discovery.js";
export { METADATA_FILE, readSubagentMetadata, renderSubagentMetadata, } from "./metadata.js";
export { ENABLED_OVERRIDES_FILE, InvalidSubagentIdError, SubagentExistsError, SubagentNotWritableError, createSubagent, deleteSubagent, readComposition, readEnabledOverrides, setEnabledField, updateSubagent, writeComposition, writeEnabledOverride, writableRoot, } from "./authoring.js";
export { mountSubagentOnChild } from "./mount.js";
export { UnknownSubagentError, SUBAGENT_ID } from "./types.js";
/**
 * Registry over the deployment's user-defined helper subagents.
 *
 * Discovery is unmemoized: `list()` and `resolve()` re-read the roots on every
 * call so a subagent authored while the process runs is visible immediately,
 * and a subagent deleted underneath a picker disappears from the next read.
 */
export class SubagentPresets extends Service {
    config;
    static inject = ['loader'];
    /** Runtime schema for the subagent roster. */
    static Config = z.object({
        roots: z.array(z.object({
            path: z.string().required(),
            trust: z.union(['system', 'user']).default('user'),
            // The shipped factory root ships with this package; omit `roots` to scan
            // only the packaged `factory/` directory plus the harness-home user root.
        })).default([{ path: FACTORY_SUBAGENT_ROOT, trust: 'system' }]),
        includeUserRoot: z.boolean().default(true),
    });
    /**
     * The roots discovery and authoring actually scan: every configured root in
     * order, then the harness-home user root unless `includeUserRoot` is false.
     * Derived once, because a root set that changed between `list()` and the
     * `create()` acting on its answer would author into a directory the caller
     * never saw.
     */
    resolvedRoots;
    constructor(ctx, config) {
        super(ctx, 'subagentPresets');
        this.config = config;
        this.resolvedRoots = config.includeUserRoot
            ? [...config.roots, { path: dshHomePath(USER_SUBAGENT_DIR), trust: 'user' }]
            : [...config.roots];
        // The browser management surface rides the connection's dedicated RPC
        // channel; registering here keeps the wire layer co-located with the
        // registry without a separate cordis plugin row.
        registerSubagentPresetWire(ctx);
    }
    /**
     * Every subagent the configured roots currently supply.
     * @returns the subagents, first-root-wins per id.
     */
    async list() {
        return await discoverSubagents(this.resolvedRoots);
    }
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
    async resolve(id) {
        const subagents = await this.list();
        const found = subagents.find(subagent => subagent.id === id);
        if (found === undefined) {
            throw new UnknownSubagentError(id, subagents.map(subagent => subagent.id));
        }
        return found;
    }
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
    async resolveMountable(id) {
        const subagent = await this.resolve(id);
        if (subagent.broken !== undefined) {
            throw new Error(`subagent-presets: subagent "${id}" cannot be mounted: ${subagent.broken}`);
        }
        if (subagent.metadata.enabled === false) {
            throw new Error(`subagent-presets: subagent "${id}" is disabled; enable it in the subagents settings to delegate to it`);
        }
        return subagent;
    }
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
    async mountOnChild(childCtx, id) {
        const subagent = await this.resolveMountable(id);
        await mountSubagentOnChild(childCtx, subagent);
        return subagent;
    }
    /**
     * The roots this roster scans, which is not `config.roots`: it is every
     * configured root in order, then the harness-home user root unless
     * `includeUserRoot` is false.
     */
    get roots() {
        return this.resolvedRoots;
    }
    /** Whether this deployment has a root locally authored subagents go to. */
    get authorable() {
        return this.resolvedRoots.some(root => root.trust === 'user');
    }
    /**
     * Read one subagent's composition text.
     * @param id - the subagent id.
     * @returns the composition exactly as stored.
     * @throws when no configured root supplies that id.
     */
    async read(id) {
        return await readComposition(await this.resolve(id));
    }
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
    async create(from, id) {
        const source = await this.resolve(from);
        if ((await this.list()).some(subagent => subagent.id === id)) {
            throw new SubagentExistsError(id);
        }
        await createSubagent(this.resolvedRoots, source, id);
    }
    /**
     * Delete a locally authored subagent.
     * @param id - the subagent id.
     * @throws when the subagent is unknown or ships with the deployment.
     */
    async remove(id) {
        await deleteSubagent(this.resolvedRoots, await this.resolve(id));
    }
    /**
     * Rewrite one locally authored subagent's metadata as a whole, including its
     * enabled switch. Absent keys are cleared.
     * @param id - the subagent id.
     * @param metadata - the complete metadata to store.
     * @throws when the subagent is unknown or ships with the deployment.
     */
    async update(id, metadata) {
        await updateSubagent(this.resolvedRoots, await this.resolve(id), metadata);
    }
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
    async readEditable(id) {
        const subagent = await this.resolve(id);
        const fields = readEditableFields(await readComposition(subagent), discoverToolPackages());
        return {
            ...fields.persona === undefined ? {} : { persona: fields.persona },
            tools: fields.tools,
            catalog: fields.catalog,
            // The metadata rides through whole, so a new metadata field needs no
            // per-field assembly here.
            metadata: subagent.metadata,
        };
    }
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
    async updateComposition(id, edits, metadata) {
        const subagent = await this.resolve(id);
        if (subagent.trust === 'system') {
            throw new SubagentNotWritableError(id, 'it ships with the deployment');
        }
        const next = applyEdits(await readComposition(subagent), edits, id);
        await writeComposition(subagent, next);
        if (metadata !== undefined) {
            await updateSubagent(this.resolvedRoots, subagent, metadata);
        }
    }
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
    async setEnabled(id, enabled) {
        const subagent = await this.resolve(id);
        if (subagent.trust === 'system') {
            await writeEnabledOverride(id, enabled);
            return;
        }
        await setEnabledField(this.resolvedRoots, subagent, enabled);
    }
}
export default SubagentPresets;
//# sourceMappingURL=index.js.map