/**
 * The harness hot mount/upgrade core.
 *
 * Mounts a freshly installed (or re-installed) plugin into the RUNNING
 * composition through a bundle-owned Include subtree, and — the reason this
 * bundle exists — hot-UPGRADES a same-name same-path plugin by evicting the
 * Node module cache and re-mounting.
 *
 * Background (all verified against the vendored loader/include/hmr sources):
 *   - `dsh plugin add/remove` is pure file I/O; the live process only
 *     re-composes on `cordis.patch.yml` changes.
 *   - A first install hot-mounts: a brand-new URL has no Node `loadCache`
 *     entry, so the first `import` reads the on-disk code.
 *   - A same-name upgrade does NOT: the same URL hits the `loadCache` stale
 *     ModuleJob, and the resolve caches (realpath/package.json) are frozen at
 *     the process level too.
 *   - The only way to swap code inside a live process is: dispose the old
 *     fiber → evict that package's `loadCache` records → re-import. This is
 *     exactly the official HMR's move (`vendor/hmr/src/index.ts`), which the
 *     official HMR confines to user code behind a watch-only web profile.
 *
 * Fiber-escape caveat (documented, not solved): `upgrade`'s dispose only
 * reclaims the registration structure. Service objects a live session already
 * holds keep pointing at the OLD module's instances until that session drops
 * them. This is the same risk official HMR carries; we state it in the README
 * rather than pretend otherwise.
 *
 * The Include subclass suppresses `write()` — the loader otherwise persists
 * tree changes back to the hot file it read, which would let a hot mount
 * mutate the very rows that live only for this process.
 * @module dsh-harness-hot-bundle/hot
 */
var __rewriteRelativeImportExtension = (this && this.__rewriteRelativeImportExtension) || function (path, preserveJsx) {
    if (typeof path === "string" && /^\.\.?\//.test(path)) {
        return path.replace(/\.(tsx)$|((?:\.d)?)((?:\.[^./]+?)?)\.([cm]?)ts$/i, function (m, tsx, d, ext, cm) {
            return tsx ? preserveJsx ? ".jsx" : ".js" : d && (!ext || !cm) ? m : (d + ext + "." + cm.toLowerCase() + "js");
        });
    }
    return path;
};
import { createRequire } from 'node:module';
import { mkdirSync, readdirSync, readFileSync, rmSync, realpathSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parsePatch } from "./patch.js";
/** The hot-input directory, relative to the profile directory. */
export const HOT_DIR = '.harness-hot';
/** Ceiling for one hot-mount activation; env-overridable like the market's. */
export const HOT_MOUNT_TIMEOUT_MS = Number(process.env.DSH_HARNESS_HOT_MOUNT_TIMEOUT_MS) || 10000;
/** The id prefix applied to hot-mounted `insert` rows so they never collide. */
export const HOT_ROW_PREFIX = 'harness-';
/** Activation did not settle within the hot-mount ceiling. */
export class ActivationTimeout extends Error {
    constructor(ms) {
        super(`hot-mount activation did not settle within ${ms / 1000}s — the plugin may wait on a service nothing provides`);
        this.name = 'ActivationTimeout';
    }
}
let hotTreeClass;
/**
 * The Include subclass, built once per process; null when the loader's include
 * plugin is not importable — callers then report that hot mounting is
 * unsupported.
 */
async function loadHotTreeClass() {
    if (hotTreeClass !== undefined)
        return hotTreeClass;
    try {
        // Computed specifier: the include plugin ships with the harness
        // (vendored, unpublished), so it resolves at runtime through the profile
        // fallback but is not a typechecked dependency of this host bundle.
        const specifier = '@deepseek-ai/cordis-plugin-include';
        const mod = (await import(__rewriteRelativeImportExtension(specifier)));
        const Include = mod.Include;
        if (Include === undefined)
            throw new Error('no Include export');
        class HarnessHotTree extends Include {
            /** Runtime-only mount list; the bundle layer owns persistence. */
            write() { }
        }
        hotTreeClass = HarnessHotTree;
    }
    catch {
        hotTreeClass = null;
    }
    return hotTreeClass;
}
/**
 * Race an activation awaitable against the hot-mount ceiling. The handlers
 * stay attached to the original promise, so a late rejection after a timeout
 * can never surface as an unhandled rejection.
 */
function raceActivationTimeout(awaitable, ms) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            reject(new ActivationTimeout(ms));
        }, ms);
        Promise.resolve(awaitable).then(value => { clearTimeout(timer); resolve(value); }, error => { clearTimeout(timer); reject(error); });
    });
}
/** Serialize a hot-mountable row into a YAML line for the hot subtree file. */
function renderRow(row) {
    if (row.kind === 'disable') {
        return `- id: '${row.id}'\n  disabled: true\n`;
    }
    if (row.config === undefined) {
        return `- id: '${HOT_ROW_PREFIX}${row.id}'\n  name: '${row.name}'\n`;
    }
    return `- id: '${HOT_ROW_PREFIX}${row.id}'\n  name: '${row.name}'\n  config:\n${renderConfig(row.config, 4)}\n`;
}
/** Render a static config object as indented YAML lines. */
function renderConfig(config, indent) {
    const pad = ' '.repeat(indent);
    return Object.entries(config)
        .map(([key, value]) => `${pad}${key}: ${JSON.stringify(value)}`)
        .join('\n');
}
/**
 * The hot-mount manager: owns the Include subtree handles and the hot file
 * sequence. One instance lives per host (the `harnessHot` service).
 */
export class HotManager {
    handles = new Map();
    records = new Map();
    sequence = 0;
    hotDir;
    profileDir;
    constructor(profileDir) {
        this.profileDir = profileDir;
        this.hotDir = join(profileDir, HOT_DIR);
    }
    /** The resolved profile directory backing this manager. */
    get profile() {
        return this.profileDir;
    }
    /** The hot-input directory (created on first mount, wiped on boot). */
    get dir() {
        return this.hotDir;
    }
    /** Wipe leftover hot inputs. Call once when the host starts. */
    cleanHotDir() {
        let entries;
        try {
            entries = readdirSync(this.hotDir);
        }
        catch {
            return;
        }
        for (const name of entries) {
            if (/^hot-\d+\.yml$/.test(name))
                rmSync(join(this.hotDir, name), { force: true });
        }
    }
    /**
     * Mount `packageName` into the running composition.
     * @param ctx - the host context the subtree mounts into.
     * @param packageName - the installed package to activate.
     * @returns the mount record on success.
     * @throws {@link RestartRequiredError} when the patch cannot hot-mount, or an
     * activation/timeout error when the subtree fails to settle.
     */
    async mount(ctx, packageName) {
        // A same-name re-mount supersedes the previous one.
        await this.unmount(packageName);
        const HotTree = await loadHotTreeClass();
        if (HotTree === null) {
            throw new Error('this host cannot hot-mount (include plugin unavailable) — restart to activate');
        }
        let patchText;
        try {
            patchText = readFileSync(join(this.profileDir, 'node_modules', packageName, 'cordis.patch.yml'), 'utf8');
        }
        catch {
            throw new Error(`no bundle patch found for "${packageName}" — restart to activate`);
        }
        const rows = parsePatch(patchText);
        mkdirSync(this.hotDir, { recursive: true, mode: 0o700 });
        this.sequence += 1;
        const file = join(this.hotDir, `hot-${String(this.sequence)}.yml`);
        writeFileSync(file, rows.map(renderRow).join(''));
        // A package installed into the running process (first mount, or a re-add)
        // may be invisible to Node's frozen resolution caches: the profile's
        // `node_modules` directory scan and realpath lookup were snapshotted at
        // boot. Evict the package's loadCache entries AND Node's module-resolution
        // path cache before the Include imports it, so a freshly installed package
        // resolves on this mount rather than a boot-era negative result.
        clearNodeResolutionCache(join(this.profileDir, 'node_modules', packageName));
        const handle = ctx.plugin(HotTree, { path: pathToFileURL(file).href });
        try {
            await raceActivationTimeout(handle.await(), HOT_MOUNT_TIMEOUT_MS);
        }
        catch (error) {
            if (error instanceof ActivationTimeout) {
                // A wedged activation would otherwise hold the caller open forever;
                // unwind the half-mounted subtree best-effort and let the error surface.
                try {
                    Promise.resolve(handle.dispose()).catch(() => { });
                }
                catch { /* best effort */ }
            }
            throw error;
        }
        const record = {
            package: packageName,
            file,
            rowIds: rows.map(row => row.kind === 'disable' ? row.id : `${HOT_ROW_PREFIX}${row.id}`),
            mountedAt: Date.now(),
        };
        this.handles.set(packageName, handle);
        this.records.set(packageName, record);
        ctx.logger?.info?.(`[dsh-harness-hot] mounted ${packageName}`);
        return record;
    }
    /**
     * Dispose a hot-mounted package, removing it from the running composition.
     * @param packageName - the package to unmount.
     * @returns the disposed record, or null when nothing was mounted.
     */
    async unmount(packageName) {
        const record = this.records.get(packageName);
        const handle = this.handles.get(packageName);
        if (record === undefined || handle === undefined)
            return null;
        this.records.delete(packageName);
        this.handles.delete(packageName);
        try {
            await Promise.resolve(handle.dispose());
        }
        catch (error) {
            throw new Error(`failed to dispose hot mount of "${packageName}": ${error instanceof Error ? error.message : String(error)}`);
        }
        return record;
    }
    /**
     * Hot-upgrade `packageName`: dispose its current fiber, evict the package's
     * Node module cache, then re-mount.
     * @param ctx - the host context.
     * @param loader - the loader service (for `internal.loadCache`).
     * @param packageName - the package to re-activate.
     * @returns the new mount record.
     * @throws when the deployment does not expose internals (restart required).
     */
    async upgrade(ctx, loader, packageName) {
        await this.unmount(packageName);
        const cleared = clearPackageLoadCache(loader, this.profileDir, packageName);
        if (!cleared) {
            throw new Error('this deployment does not expose the module loader internals — hot upgrade unsupported; restart to activate');
        }
        return await this.mount(ctx, packageName);
    }
    /** Current hot-mount list, in mount order. */
    list() {
        return [...this.records.values()];
    }
}
/**
 * Evict every `loadCache` record whose URL lives under the package's own
 * `node_modules/<package>/` path — the package's modules only, never its
 * dependencies. pnpm's isolated layout is a symlink: the cached URL holds the
 * REAL path, so the package directory is realpath'd before matching.
 * @param loader - the loader service (its `internal` may be undefined).
 * @param profileDir - the profile directory holding `node_modules/<package>`.
 * @param packageName - the package to evict.
 * @returns false when the loader internals are unavailable (restart required).
 */
export function clearPackageLoadCache(loader, profileDir, packageName) {
    const internal = loader.internal;
    if (internal === undefined)
        return false;
    const loadCache = internal.loadCache;
    if (loadCache === null || typeof loadCache !== 'object' || typeof loadCache.keys !== 'function') {
        // A v1/v2 loadCache is always a Map; without a keys() iterator the loader
        // internals are not the shape we expect — treat as unsupported.
        return false;
    }
    let packageReal;
    try {
        packageReal = realpathSync(join(profileDir, 'node_modules', packageName));
    }
    catch {
        // The package directory may not be a realpath-able target (e.g. a bare
        // name not yet installed); fall back to the literal join.
        packageReal = join(profileDir, 'node_modules', packageName);
    }
    const prefix = packageReal + sep;
    const toDelete = [];
    for (const url of loadCache.keys()) {
        let file;
        try {
            file = fileURLToPath(url);
        }
        catch {
            continue; // non-file URLs (node:, data:) can never be a package module
        }
        // The cached URL may hold either the literal or the realpath'd file path;
        // resolve to the real path before matching so pnpm symlinks and direct
        // installs both match the package's own directory only. When the module
        // file itself is not on disk (it always is in a live loadCache, but a
        // synthetic test key may not be), realpath its directory instead — that
        // still normalizes a symlinked root (macOS /var → /private/var) so the
        // prefix comparison agrees with the realpath'd package directory.
        let real;
        try {
            real = realpathSync(file);
        }
        catch {
            try {
                real = join(realpathSync(dirname(file)), basename(file));
            }
            catch {
                real = file;
            }
        }
        if (real.startsWith(prefix))
            toDelete.push(url);
    }
    for (const url of toDelete) {
        // Use the map-prototype delete directly: in Node 24 the loadCache is a
        // `Map<url, {[type]: ModuleJob}>` whose OWN `.delete()` only sets the type
        // slot to undefined rather than removing the key — the same reason the
        // official HMR uses Map.prototype.delete.
        const target = loadCache;
        const protoDelete = (Object.getPrototypeOf(loadCache)?.delete ?? Map.prototype.delete);
        protoDelete.call(target, url);
    }
    return true;
}
/**
 * Clear Node's module-resolution caches so a package newly installed into a
 * running process (first mount, or a re-add over the same name) resolves on
 * the next import. Node snapshots the `node_modules` directory scan and
 * realpath lookups at the process level; a package that did not exist at boot
 * is invisible to the frozen resolution caches until they are evicted.
 * @param packageDir - the package directory (used to scope the CJS require
 * cache eviction).
 */
export function clearNodeResolutionCache(packageDir) {
    try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const mod = require('node:module');
        // The CJS resolver's path cache is keyed by "request\0paths"; a fresh
        // package's bare-name request would otherwise hit a boot-era negative
        // entry. Clearing the whole table is cheap and always correct.
        if (mod._pathCache) {
            for (const key of Object.keys(mod._pathCache))
                delete mod._pathCache[key];
        }
    }
    catch { /* no module resolver cache to clear */ }
    try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const req = createRequire(import.meta.url);
        for (const cached of Object.values(req.cache)) {
            if (cached?.filename === undefined)
                continue;
            if (cached.filename.startsWith(packageDir + sep))
                delete req.cache[cached.filename];
        }
    }
    catch { /* no CJS cache to clear */ }
}
//# sourceMappingURL=hot.js.map