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
import { Context, Service } from '@deepseek-ai/cordis';
import { z } from 'zod';
import { type HotMountRecord } from './hot.ts';
declare module '@deepseek-ai/cordis' {
    interface Context {
        harnessHot: HarnessHot;
    }
}
/** One hot operation's requested target. */
export interface HotTarget {
    package: string;
    /** Explicit profile directory; defaults to the service's derived profile. */
    profileDir?: string;
}
/**
 * The `harness-hot` row config. Business plugins activated exclusively
 * through `autoMount` keep their rows out of the static bundle layers, so a
 * live `upgrade` never collides with a frozen boot-era mount — and this list
 * is what brings them back after every restart.
 */
export interface HarnessHotConfig {
    /**
     * Packages hot-mounted as part of the service's own activation (boot or a
     * live recompose of the row). A package that fails to mount (uninstalled,
     * unpatchable) is logged and skipped; it never takes the tree down.
     */
    autoMount?: string[];
}
/** Zod schema validating the row config at the plugin boundary. */
export declare const harnessHotConfigSchema: z.ZodObject<{
    autoMount: z.ZodOptional<z.ZodArray<z.ZodString>>;
}, z.core.$strip>;
/**
 * Resolve the active profile directory. The loader's `baseUrl` is pinned to
 * the profile directory by `bootApp`; when that is unavailable (no loader, or
 * a baseUrl outside the expected shape) return null so the caller must pass an
 * explicit `profileDir`.
 */
export declare function deriveProfileDir(ctx: Context): string | null;
/**
 * The harness hot surface (`ctx.harnessHot`).
 */
export declare class HarnessHot extends Service {
    static inject: string[];
    private readonly defaultProfileDir;
    private readonly manager;
    private readonly autoMount;
    constructor(ctx: Context, config?: HarnessHotConfig);
    /**
     * Mount every configured package as the service activates. Runs as the
     * class-plugin init hook (the fiber awaits it), so this row settles only
     * once the whole list has been attempted; one package's failure is logged
     * and skipped rather than failing the tree.
     */
    [Service.init](): Promise<void>;
    /** The deployment's logger service, when one is composed. */
    private logger;
    /** The profile directory this service derives, or null when unavailable. */
    get profileDir(): string | null;
    private resolveManager;
    /**
     * Hot-mount a package into the running composition.
     * @param target - the package to mount and an optional profile override.
     * @returns the mount record.
     * @throws a `RestartRequiredError` when the patch cannot hot-mount, or an
     * activation/timeout error when the subtree fails to settle.
     */
    mount(target: HotTarget): Promise<HotMountRecord>;
    /**
     * Hot-unmount a package, removing it from the running composition.
     * @param packageName - the package to unmount.
     * @returns the disposed record, or null when nothing was mounted.
     */
    unmount(packageName: string): Promise<HotMountRecord | null>;
    /**
     * Hot-upgrade a same-name package by evicting its module cache and re-mounting.
     * @param target - the package to upgrade and an optional profile override.
     * @returns the new mount record.
     * @throws when the deployment does not expose module-loader internals.
     */
    upgrade(target: HotTarget): Promise<HotMountRecord>;
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
    private hostCtx;
    /**
     * The root (boot) tree's entry group holding the static rows. The bootstrap
     * include is mounted under the fixed id `'include'` (see app-boot's
     * `mountRootInclude`), so its `subgroup` is the root entry group whose
     * `data` lists every static row.
     */
    private staticRootGroup;
    /**
     * Build the static-row adapter for a host context: runtime-disable/restore
     * a static root-tree row in memory only — we stop/restart the row's running
     * fiber directly and mirror the disabled flag onto the root group's `data`
     * array so a later recomposition does not resurrect the static copy while
     * the hot row owns its registration.
     *
     * Two loader facts drive the implementation:
     * - The static rows live in the `include` entry's own subtree tree, not the
     *   root loader tree, so `loader.resolve(id)` (which searches only the root
     *   tree) misses them; `loader.entries()` walks every subtree, matching on
     *   the local `options.id`.
     * - `entry.update({ disabled: true })` does NOT stop the running fiber in
     *   this deployment — its dispose branch never fires against the loaded
     *   entry (verified live: uid unchanged after the update) — so we dispose
     *   the fiber directly to converge a double mount. Restore mirrors this:
     *   flip the flags and `refresh()` re-imports the stopped fiber.
     */
    private staticRowsAdapter;
    /** The host context carrying the static-row adapter the hot core needs. */
    private withStaticRows;
    /** The current hot-mount list, in mount order. */
    list(): HotMountRecord[];
}
//# sourceMappingURL=service.d.ts.map