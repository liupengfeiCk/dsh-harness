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
/** The hot-input directory, relative to the profile directory. */
export declare const HOT_DIR = ".harness-hot";
/** Ceiling for one hot-mount activation; env-overridable like the market's. */
export declare const HOT_MOUNT_TIMEOUT_MS: number;
/** The id prefix applied to hot-mounted `insert` rows so they never collide. */
export declare const HOT_ROW_PREFIX = "harness-";
/** One active hot mount, keyed by package name. */
export interface HotMountRecord {
    package: string;
    /** The hot file backing the subtree (path). */
    file: string;
    /** Row ids this mount pulled in (already prefixed where applicable). */
    rowIds: string[];
    /** When the mount settled (ms epoch). */
    mountedAt: number;
}
/** The subset of the host context the hot core needs. */
export interface HotContext {
    plugin(plugin: unknown, config: unknown): PluginHandle;
    logger?: {
        info?(message: string): void;
        warn(message: string): void;
    };
}
/** A cordis plugin handle the hot core tracks and disposes. */
export interface PluginHandle {
    await(): Promise<unknown>;
    dispose(): Promise<unknown> | void;
}
/** The Node internal loader surface the upgrade path touches. */
export interface InternalLoader {
    loadCache: unknown;
}
/** The loader service surface carrying `internal`. */
export interface LoaderLike {
    internal?: InternalLoader | undefined;
}
/** Activation did not settle within the hot-mount ceiling. */
export declare class ActivationTimeout extends Error {
    constructor(ms: number);
}
/**
 * The hot-mount manager: owns the Include subtree handles and the hot file
 * sequence. One instance lives per host (the `harnessHot` service).
 */
export declare class HotManager {
    private handles;
    private records;
    private sequence;
    private readonly hotDir;
    private readonly profileDir;
    constructor(profileDir: string);
    /** The resolved profile directory backing this manager. */
    get profile(): string;
    /** The hot-input directory (created on first mount, wiped on boot). */
    get dir(): string;
    /** Wipe leftover hot inputs. Call once when the host starts. */
    cleanHotDir(): void;
    /**
     * Mount `packageName` into the running composition.
     * @param ctx - the host context the subtree mounts into.
     * @param packageName - the installed package to activate.
     * @returns the mount record on success.
     * @throws {@link RestartRequiredError} when the patch cannot hot-mount, or an
     * activation/timeout error when the subtree fails to settle.
     */
    mount(ctx: HotContext, packageName: string): Promise<HotMountRecord>;
    /**
     * Dispose a hot-mounted package, removing it from the running composition.
     * @param packageName - the package to unmount.
     * @returns the disposed record, or null when nothing was mounted.
     */
    unmount(packageName: string): Promise<HotMountRecord | null>;
    /**
     * Hot-upgrade `packageName`: dispose its current fiber, evict the package's
     * Node module cache, then re-mount.
     * @param ctx - the host context.
     * @param loader - the loader service (for `internal.loadCache`).
     * @param packageName - the package to re-activate.
     * @returns the new mount record.
     * @throws when the deployment does not expose internals (restart required).
     */
    upgrade(ctx: HotContext, loader: LoaderLike, packageName: string): Promise<HotMountRecord>;
    /** Current hot-mount list, in mount order. */
    list(): HotMountRecord[];
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
export declare function clearPackageLoadCache(loader: LoaderLike, profileDir: string, packageName: string): boolean;
//# sourceMappingURL=hot.d.ts.map