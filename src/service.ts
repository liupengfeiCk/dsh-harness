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

import { fileURLToPath } from 'node:url'
import { Context, Service } from '@deepseek-ai/cordis'
import { HotManager, type HotMountRecord } from './hot.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    harnessHot: HarnessHot
  }
}

/** One hot operation's requested target. */
export interface HotTarget {
  package: string
  /** Explicit profile directory; defaults to the service's derived profile. */
  profileDir?: string
}

/**
 * Resolve the active profile directory. The loader's `baseUrl` is pinned to
 * the profile directory by `bootApp`; when that is unavailable (no loader, or
 * a baseUrl outside the expected shape) return null so the caller must pass an
 * explicit `profileDir`.
 */
export function deriveProfileDir(ctx: Context): string | null {
  const baseUrl = ctx.baseUrl
  if (typeof baseUrl !== 'string' || baseUrl === '') return null
  try {
    const path = fileURLToPath(baseUrl)
    // fileURLToPath of a directory URL may carry a trailing separator.
    return path.endsWith('/') || path.endsWith('\\') ? path.slice(0, -1) : path
  } catch {
    return null
  }
}

/**
 * The harness hot surface (`ctx.harnessHot`).
 */
export class HarnessHot extends Service {
  static inject = ['loader']

  private readonly defaultProfileDir: string | null
  private readonly manager: HotManager

  constructor(ctx: Context) {
    super(ctx, 'harnessHot')
    this.defaultProfileDir = deriveProfileDir(ctx)
    this.manager = new HotManager(this.defaultProfileDir ?? process.cwd())
    // Boot-time wipe: leftover hot inputs must never collide with the bundle
    // layer on the next boot.
    this.manager.cleanHotDir()
  }

  /** The profile directory this service derives, or null when unavailable. */
  get profileDir(): string | null {
    return this.defaultProfileDir
  }

  private resolveManager(profileDir?: string): HotManager {
    if (profileDir === undefined) {
      if (this.defaultProfileDir === null) {
        throw new Error('harness-hot: no profile directory available — pass an explicit profileDir')
      }
      return this.manager
    }
    if (profileDir === this.defaultProfileDir) return this.manager
    // An explicit override re-bases the manager onto that profile.
    return new HotManager(profileDir)
  }

  /**
   * Hot-mount a package into the running composition.
   * @param target - the package to mount and an optional profile override.
   * @returns the mount record.
   * @throws a `RestartRequiredError` when the patch cannot hot-mount, or an
   * activation/timeout error when the subtree fails to settle.
   */
  async mount(target: HotTarget): Promise<HotMountRecord> {
    return await this.resolveManager(target.profileDir).mount(this.ctx, target.package)
  }

  /**
   * Hot-unmount a package, removing it from the running composition.
   * @param packageName - the package to unmount.
   * @returns the disposed record, or null when nothing was mounted.
   */
  async unmount(packageName: string): Promise<HotMountRecord | null> {
    return await this.manager.unmount(packageName)
  }

  /**
   * Hot-upgrade a same-name package by evicting its module cache and re-mounting.
   * @param target - the package to upgrade and an optional profile override.
   * @returns the new mount record.
   * @throws when the deployment does not expose module-loader internals.
   */
  async upgrade(target: HotTarget): Promise<HotMountRecord> {
    return await this.resolveManager(target.profileDir).upgrade(this.ctx, this.ctx.loader, target.package)
  }

  /** The current hot-mount list, in mount order. */
  list(): HotMountRecord[] {
    return this.manager.list()
  }
}
