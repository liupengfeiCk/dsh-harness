/**
 * The `ctx.harnessHot` capability seam: a cordis Service exposing the harness
 * hot mount/unmount/upgrade/list surface, backed by a {@link HotManager}.
 *
 * The service derives the active profile directory from the loader's `baseUrl`
 * (which `bootApp` pins to the profile directory); a caller may override it
 * per call when the deployment owns the profile location (e.g. an explicit
 * `profileDir`), matching how the market's hosts do.
 *
 * The manager wipes its hot-input directory when the service starts, so a
 * crash can never leave a file that collides with the bundle layer at the next
 * boot.
 * @module dsh-harness-hot-bundle/service
 */
import { fileURLToPath } from 'node:url';
import { Service, getTraceable } from '@deepseek-ai/cordis';
import { z } from 'zod';
import { HotManager } from "./hot.js";
/** Zod schema validating the row config at the plugin boundary. */
export const harnessHotConfigSchema = z.object({
    autoMount: z.array(z.string().min(1)).optional(),
});
/**
 * Resolve the active profile directory. The loader's `baseUrl` is pinned to
 * the profile directory by `bootApp`; when that is unavailable (no loader, or
 * a baseUrl outside the expected shape) return null so the caller must pass an
 * explicit `profileDir`.
 */
export function deriveProfileDir(ctx) {
    const baseUrl = ctx.baseUrl;
    if (typeof baseUrl !== 'string' || baseUrl === '')
        return null;
    try {
        const path = fileURLToPath(baseUrl);
        // fileURLToPath of a directory URL may carry a trailing separator.
        return path.endsWith('/') || path.endsWith('\\') ? path.slice(0, -1) : path;
    }
    catch {
        return null;
    }
}
/**
 * The harness hot surface (`ctx.harnessHot`).
 */
export class HarnessHot extends Service {
    static inject = ['loader'];
    defaultProfileDir;
    manager;
    autoMount;
    constructor(ctx, config) {
        super(ctx, 'harnessHot');
        this.defaultProfileDir = deriveProfileDir(ctx);
        this.manager = new HotManager(this.defaultProfileDir ?? process.cwd());
        this.autoMount = Object.freeze([...(config?.autoMount ?? [])]);
        // Boot-time wipe: leftover hot inputs must never collide with the bundle
        // layer on the next boot.
        this.manager.cleanHotDir();
    }
    /**
     * Mount every configured package as the service activates. Runs as the
     * class-plugin init hook (the fiber awaits it), so this row settles only
     * once the whole list has been attempted; one package's failure is logged
     * and skipped rather than failing the tree.
     */
    async [Service.init]() {
        for (const packageName of this.autoMount) {
            try {
                await this.mount({ package: packageName });
            }
            catch (error) {
                this.logger()?.warn?.(`[dsh-harness-hot] auto-mount of ${packageName} failed: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
    }
    /** The deployment's logger service, when one is composed. */
    logger() {
        return this.ctx.get('logger');
    }
    /** The profile directory this service derives, or null when unavailable. */
    get profileDir() {
        return this.defaultProfileDir;
    }
    resolveManager(profileDir) {
        if (profileDir === undefined) {
            if (this.defaultProfileDir === null) {
                throw new Error('harness-hot: no profile directory available — pass an explicit profileDir');
            }
            return this.manager;
        }
        if (profileDir === this.defaultProfileDir)
            return this.manager;
        // An explicit override re-bases the manager onto that profile.
        return new HotManager(profileDir);
    }
    /**
     * Hot-mount a package into the running composition.
     * @param target - the package to mount and an optional profile override.
     * @returns the mount record.
     * @throws a `RestartRequiredError` when the patch cannot hot-mount, or an
     * activation/timeout error when the subtree fails to settle.
     */
    async mount(target) {
        return await this.resolveManager(target.profileDir).mount(this.withStaticRows(this.hostCtx()), target.package);
    }
    /**
     * Hot-unmount a package, removing it from the running composition.
     * @param packageName - the package to unmount.
     * @returns the disposed record, or null when nothing was mounted.
     */
    async unmount(packageName) {
        return await this.manager.unmount(packageName, this.withStaticRows(this.hostCtx()));
    }
    /**
     * Hot-upgrade a same-name package by evicting its module cache and re-mounting.
     * @param target - the package to upgrade and an optional profile override.
     * @returns the new mount record.
     * @throws when the deployment does not expose module-loader internals.
     */
    async upgrade(target) {
        const ctx = this.hostCtx();
        return await this.resolveManager(target.profileDir).upgrade(this.withStaticRows(ctx), ctx.loader, target.package);
    }
    /**
     * The host context WITHOUT the cordis shadow the wire's traceable call
     * wraps this service instance in.
     *
     * The `/harness-hot` channel calls `service.mount()` through a traceable
     * wrapper, whose method invocation swaps `this` onto a shadow context (a
     * `ctx.extend({ [shadow]: origin })` child). That shadow propagates through
     * every `ctx.extend()` the Include subtree performs, so a live re-mount's
     * entry fibers resolve their context against the `harnessHot` service fiber
     * instead of their own — and a provider row (`spawn`/`fork`/`tool`) that
     * injects `subagents` then fails with "cannot get property \"subagents\"
     * without inject" (the shadow fiber never declares that inject). Boot does
     * not hit this because `autoMount` runs inside `[Service.init]` where the
     * service context carries no shadow. Stripping the shadow restores the
     * plain service context, making a hot re-mount identical to the boot mount.
     */
    hostCtx() {
        return getTraceable(this.ctx, this.ctx);
    }
    /**
     * The root (boot) tree's entry group holding the static rows. The bootstrap
     * include is mounted under the fixed id `'include'` (see app-boot's
     * `mountRootInclude`), so its `subgroup` is the root entry group whose
     * `data` lists every static row.
     */
    staticRootGroup(ctx) {
        const loader = ctx.get('loader');
        if (loader === undefined)
            return undefined;
        const root = loader.store?.['include'];
        return root?.subgroup;
    }
    /**
     * Build the static-row adapter for a host context: runtime-disable/restore
     * a static root-tree row in memory only — the loader's `Entry.update` disposes
     * the fiber without persisting, and we mirror the disabled flag onto the root
     * group's `data` array so a later recomposition does not resurrect the static
     * copy while the hot row owns its registration.
     */
    staticRowsAdapter(ctx) {
        const loader = ctx.get('loader');
        const rootGroup = this.staticRootGroup(ctx);
        const findRow = (id) => rootGroup?.data.find(row => row.id === id);
        const findEntry = (id) => {
            if (loader === undefined)
                return undefined;
            try {
                return loader.resolve(id);
            }
            catch {
                return undefined; // no such entry in the tree
            }
        };
        return {
            has: (id) => findRow(id) !== undefined,
            disable: async (id) => {
                const row = findRow(id);
                if (row === undefined)
                    return;
                // Mirror the flag onto the persisted `data` object first so a later
                // full recomposition sees the row as disabled; then stop the running
                // fiber. A row that never started has no fiber and is a no-op.
                row.disabled = true;
                const entry = findEntry(id);
                if (entry?.fiber)
                    await entry.update({ disabled: true });
            },
            restore: async (id) => {
                const row = findRow(id);
                if (row === undefined)
                    return;
                row.disabled = false;
                const entry = findEntry(id);
                if (entry)
                    await entry.update({ disabled: false });
            },
        };
    }
    /** The host context carrying the static-row adapter the hot core needs. */
    withStaticRows(ctx) {
        return Object.assign(ctx, { staticRows: this.staticRowsAdapter(ctx) });
    }
    /** The current hot-mount list, in mount order. */
    list() {
        return this.manager.list();
    }
}
//# sourceMappingURL=service.js.map