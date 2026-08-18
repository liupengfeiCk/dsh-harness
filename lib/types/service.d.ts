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
    constructor(ctx: Context);
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
    /** The current hot-mount list, in mount order. */
    list(): HotMountRecord[];
}
//# sourceMappingURL=service.d.ts.map