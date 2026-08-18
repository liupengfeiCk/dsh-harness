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
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, realpathSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parsePatch, RestartRequiredError } from "./patch.js";
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
     *
     * Failure semantics: on any failure after static-row convergence (an
     * import/apply error or an activation timeout), this mount rolls back
     * symmetrically — it disposes the half-mounted subtree best-effort and
     * restores every static row it had disabled — before rethrowing. A failed
     * mount therefore leaves the static layer running exactly as it did before
     * the call; it can never strand the composition in a "static disabled + hot
     * not mounted" state.
     */
    async mount(ctx, packageName) {
        // A same-name re-mount supersedes the previous one (restoring the static
        // rows the prior mount disabled, then disabling them fresh below).
        await this.unmount(packageName, ctx);
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
        // Converge a double mount: disable each static root-tree row whose id
        // matches a hot insert row (the prefix is stripped, so a hot
        // `harness-subagent-harness` row targets the static `subagent-harness`),
        // before the hot subtree mounts the same-name row. A missing static row is
        // a plain hot-only pull-in (e.g. a probe) and is skipped harmlessly. The
        // disabled ids are recorded so unmount restores exactly what this mount
        // turned off.
        const staticRows = [];
        const staticRowsAdapter = ctx.staticRows;
        if (staticRowsAdapter) {
            for (const row of rows) {
                if (row.kind !== 'insert')
                    continue;
                if (!staticRowsAdapter.has(row.id))
                    continue;
                await staticRowsAdapter.disable(row.id);
                staticRows.push(row.id);
            }
        }
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
            // A failed mount — an import/apply error or an activation timeout — must
            // NEVER leave the composition in a "static rows disabled + no hot rows
            // mounted" state: that is exactly the outage this harness hit (a failed
            // subagent import left /subagent-preset dead with 405 until a manual
            // restart). Roll back symmetrically before surfacing the error: unwind
            // the half-mounted subtree best-effort AND restore every static row this
            // mount disabled, so the static layer runs again exactly as it did before
            // the mount. The original error still surfaces to the caller.
            try {
                Promise.resolve(handle.dispose()).catch(() => { });
            }
            catch { /* best effort */ }
            if (staticRowsAdapter) {
                for (const id of staticRows) {
                    if (staticRowsAdapter.has(id))
                        await staticRowsAdapter.restore(id);
                }
            }
            throw error;
        }
        const record = {
            package: packageName,
            file,
            rowIds: rows.map(row => row.kind === 'disable' ? row.id : `${HOT_ROW_PREFIX}${row.id}`),
            staticRows,
            mountedAt: Date.now(),
        };
        this.handles.set(packageName, handle);
        this.records.set(packageName, record);
        ctx.logger?.info?.(`[dsh-harness-hot] mounted ${packageName}`);
        return record;
    }
    /**
     * Dispose a hot-mounted package, removing it from the running composition
     * and restoring the static root-tree rows this mount had disabled.
     * @param packageName - the package to unmount.
     * @param ctx - the host context, for the static-row adapter (absent when the
     * hot core is driven without one, e.g. unit tests or a host without a loader).
     * @returns the disposed record, or null when nothing was mounted.
     */
    async unmount(packageName, ctx) {
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
        // Symmetric restore: bring back every static row this mount turned off.
        // A row that no longer exists (the bundle was removed) is skipped by the
        // adapter, so unmount stays convergent from any prior state.
        const staticRowsAdapter = ctx?.staticRows;
        if (staticRowsAdapter) {
            for (const id of record.staticRows) {
                if (staticRowsAdapter.has(id))
                    await staticRowsAdapter.restore(id);
            }
        }
        return record;
    }
    /**
     * Hot-upgrade `packageName`: dispose its current fiber, evict the package's
     * Node module cache, then re-mount.
     *
     * Boundary: the eviction (`clearPackageLoadCache` + `clearNodeResolutionCache`)
     * reaches the loader `loadCache` and the CJS `_pathCache`/`require.cache`, but
     * NOT Node's process-level ESM package resolution cache. Node caches a
     * package's parsed `package.json` (including its `exports` map) in a C++
     * binding layer (`modulesBinding.readPackageJSON`) keyed by path; a subpath
     * that failed `exports` resolution (`ERR_PACKAGE_PATH_NOT_EXPORTED`) stays
     * failed for the life of the process even after the on-disk `exports` is
     * fixed and every JS-side cache is cleared — it is unreachable from JS and
     * has no public API. If a hot upgrade leaves the package relying on a newly
     * exported subpath that failed to resolve earlier in this process, the only
     * recovery is a host restart.
     *
     * Because that C++ cache is unreachable, a hot upgrade that changes the
     * package's *structure* — its `exports` map (add/remove/rewrite) or its
     * nested `node_modules` layout — can never take effect in the live process
     * and fails with a confusing `ERR_PACKAGE_PATH_NOT_EXPORTED`/`ENOENT` after
     * the old copy is already disposed. {@link preflightUpgradeStructure} detects
     * that structural change up front and refuses with a clear restart-required
     * error *before* any eviction or re-mount, so the running hot copy (and the
     * static layer) is left untouched.
     * @param ctx - the host context.
     * @param loader - the loader service (for `internal.loadCache`).
     * @param packageName - the package to re-activate.
     * @returns the new mount record.
     * @throws when the deployment does not expose internals (restart required),
     * or a {@link RestartRequiredError} when the upgrade would change the package
     * structure (only a host restart can take it).
     *
     * Failure semantics: the old hot copy is disposed up front (existing
     * behaviour). A failed re-mount restores every static row the old mount had
     * disabled AND every row the new mount was about to disable (via {@link mount}'s
     * rollback), so the static layer resumes running. The process is never left
     * in a "static disabled + no hot copy mounted" state.
     */
    async upgrade(ctx, loader, packageName) {
        // Preflight: refuse before touching anything if the disk's new package
        // structure cannot be taken by the live process (see preflightUpgradeStructure).
        // The preflight reads the on-disk package.json and the package's own
        // loadCache keys, neither of which a passing preflight mutates, so a
        // restart-required refusal leaves the current hot copy running untouched.
        const preflight = preflightUpgrade(this.profileDir, packageName, loader);
        if (!preflight.ok) {
            throw new RestartRequiredError(`upgrade would change the package structure of "${packageName}" (${preflight.reason}) — restart to activate`);
        }
        await this.unmount(packageName, ctx);
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
 * Collect every `loadCache` key whose URL resolves under the package's own
 * `node_modules/<package>/` path — the package's modules only, never its
 * dependencies. pnpm's isolated layout is a symlink: the cached URL holds the
 * REAL path, so the package directory is realpath'd before matching.
 * @param loader - the loader service (its `internal` may be undefined).
 * @param profileDir - the profile directory holding `node_modules/<package>`.
 * @param packageName - the package to inspect.
 * @returns the package's own loadCache URL keys, or null when the loader
 * internals are unavailable or not the expected Map shape.
 */
export function collectPackageLoadCacheUrls(loader, profileDir, packageName) {
    const internal = loader.internal;
    if (internal === undefined)
        return null;
    const loadCache = internal.loadCache;
    if (loadCache === null || typeof loadCache !== 'object' || typeof loadCache.keys !== 'function') {
        // A v1/v2 loadCache is always a Map; without a keys() iterator the loader
        // internals are not the shape we expect — treat as unsupported.
        return null;
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
    const urls = [];
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
            urls.push(url);
    }
    return urls;
}
/**
 * Evict every `loadCache` record whose URL lives under the package's own
 * `node_modules/<package>/` path — the package's modules only, never its
 * dependencies.
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
    const toDelete = collectPackageLoadCacheUrls(loader, profileDir, packageName);
    if (toDelete === null)
        return false;
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
 * Preflight a hot upgrade before any eviction or re-mount: detect whether the
 * on-disk package's *structure* changed in a way the live process can never
 * take, so the upgrade is refused up front with a clear restart-required error
 * instead of failing later with a confusing `ERR_PACKAGE_PATH_NOT_EXPORTED` /
 * `ENOENT` after the old copy is already disposed.
 *
 * Two structural changes are caught (both verified unreachable from JS):
 *   1. **Nested `node_modules` layout change** — a module the package already
 *      loaded (its URL lives under the package's own `node_modules/<pkg>/` path
 *      in the loader `loadCache`) no longer exists on disk. The package now
 *      resolves its dependencies differently; only a restart re-reads them.
 *   2. **`exports` map change** — a module the package already loaded maps to a
 *      relative subpath that the disk's new `package.json` `exports` no longer
 *      exports. Node's C++ `readPackageJSON` cache freezes the old `exports`,
 *      so the re-import keeps resolving against the stale map (or fails) even
 *      after the JS-side caches are cleared.
 *
 * The preflight reads only (never mutates) the on-disk package.json and the
 * package's own loadCache keys, so a refusal leaves the current hot copy — and
 * the static layer — running untouched.
 * @param profileDir - the profile directory holding `node_modules/<package>`.
 * @param packageName - the package being upgraded.
 * @param loader - the loader service (for `internal.loadCache`).
 * @returns `{ ok: true }` when the live process can take the new package, or
 * `{ ok: false, reason }` when a structural change requires a host restart.
 * A deployment without loader internals (or a package never loaded into this
 * process) passes preflight — the existing upgrade path then reports the
 * internals/unmount problem on its own terms.
 */
export function preflightUpgrade(profileDir, packageName, loader) {
    // The loadCache keys are realpath'd (pnpm symlinks); realpath the package
    // dir the same way so the exports-coverage comparison and relative paths
    // agree with the loaded module paths.
    let pkgDir;
    try {
        pkgDir = realpathSync(join(profileDir, 'node_modules', packageName));
    }
    catch {
        pkgDir = join(profileDir, 'node_modules', packageName);
    }
    let diskPackageJsonText;
    try {
        diskPackageJsonText = readFileSync(join(pkgDir, 'package.json'), 'utf8');
    }
    catch {
        // No readable package.json — nothing structural to compare; let the normal
        // mount path report whatever it finds.
        return { ok: true };
    }
    const urls = collectPackageLoadCacheUrls(loader, profileDir, packageName);
    if (urls === null)
        return { ok: true };
    // The loadCache URLs are file:// URLs; convert to real file paths. A key that
    // is not a file URL (node:, data:) can never be a package module and is skipped.
    // The file is realpath'd (when it still exists) so the exports-coverage
    // comparison shares the realpath basis of `pkgDir` (macOS /var → /private/var
    // is a symlink; a literal-vs-realpath mismatch would falsely flag an unchanged
    // package). A missing file keeps its literal path so the nested-layout check
    // can still detect it.
    const loadedFiles = [];
    for (const url of urls) {
        let file;
        try {
            file = fileURLToPath(url);
        }
        catch {
            continue; // non-file URL, not a package module
        }
        try {
            loadedFiles.push(realpathSync(file));
        }
        catch {
            loadedFiles.push(file);
        }
    }
    return preflightUpgradeStructure(pkgDir, loadedFiles, diskPackageJsonText);
}
/**
 * The pure structure-comparison core of {@link preflightUpgrade}, separated so
 * the two structural-change checks are unit-testable without a live loader.
 * @param pkgDir - the package directory on disk.
 * @param loadedFiles - the real file paths this process already loaded from
 * the package (from its `loadCache`).
 * @param diskPackageJsonText - the on-disk (new) `package.json` text.
 * @returns `{ ok: true }` or `{ ok: false, reason }` — see
 * {@link preflightUpgrade} for the two checks' meaning.
 */
export function preflightUpgradeStructure(pkgDir, loadedFiles, diskPackageJsonText) {
    // 1) Nested node_modules / layout change: any module this process already
    //    loaded from the package must still exist on disk. A missing file means
    //    the disk now lays the package (or its nested dependencies) out
    //    differently — a restart is the only way to pick it up.
    for (const file of loadedFiles) {
        if (existsSync(file))
            continue;
        return { ok: false, reason: `already-loaded module ${relative(pkgDir, file)} no longer exists on disk (nested node_modules layout changed)` };
    }
    // 2) exports map change: every still-existing loaded module must still be
    //    covered by the disk's new `exports`. A loaded subpath the new exports
    //    no longer exposes (or maps elsewhere) stays frozen by Node's C++ cache.
    let exportsField;
    try {
        exportsField = JSON.parse(diskPackageJsonText).exports;
    }
    catch {
        // Unparsable package.json — nothing to compare; a malformed file fails
        // elsewhere with its own diagnostic.
        return { ok: true };
    }
    if (exportsField === undefined)
        return { ok: true };
    const exact = collectExactExportedFiles(exportsField, pkgDir);
    // A wildcard export (`./*`/`./*.js`) cannot be expanded precisely without
    // re-running Node's pattern matcher, so we cannot prove a loaded file is
    // dropped. Be conservative: treat a wildcard exports as covering every
    // loaded file (do not fail a change we cannot verify). Only the exact-map
    // case — where a previously exposed file is now absent — is a certain
    // restart-required structural change.
    if (exact.wildcard)
        return { ok: true };
    for (const file of loadedFiles) {
        if (exact.files.size === 0 || exact.files.has(file))
            continue;
        return { ok: false, reason: `already-loaded module ${relative(pkgDir, file)} is no longer exported by the new package.json exports map` };
    }
    return { ok: true };
}
/**
 * Collect the exact on-disk file targets of a package.json `exports` field.
 * A string exports is shorthand for `{ ".": <string> }`; a subpath maps to a
 * string file or a conditions object whose string leaves are the file targets.
 * Subpath patterns (`./*`, `./*.js`) set `wildcard` and are not expanded —
 * {@link preflightUpgradeStructure} treats their coverage as unprovable and
 * conservatively passes rather than risk a false restart-required.
 * @param exportsField - the parsed `exports` value (string | object).
 * @param pkgDir - the package directory (targets resolve against it).
 * @returns the exact file targets and whether any wildcard was present.
 */
function collectExactExportedFiles(exportsField, pkgDir) {
    const files = new Set();
    let wildcard = false;
    const pushTarget = (target) => {
        // A target is resolved against the package root (the `./` prefix is
        // package-relative). A `*` (subpath or extension wildcard) cannot be
        // expanded here; flag it and skip the exact path.
        if (target.includes('*')) {
            wildcard = true;
            return;
        }
        files.add(join(pkgDir, target.replace(/^\.\//, '')));
    };
    if (typeof exportsField === 'string') {
        pushTarget(exportsField);
    }
    else if (exportsField !== null && typeof exportsField === 'object' && !Array.isArray(exportsField)) {
        for (const value of Object.values(exportsField)) {
            // A subpath maps to a string file, or to a conditions object whose
            // leaves are the file targets.
            if (typeof value === 'string') {
                pushTarget(value);
            }
            else if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
                for (const leaf of Object.values(value)) {
                    if (typeof leaf === 'string')
                        pushTarget(leaf);
                }
            }
        }
    }
    return { files, wildcard };
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