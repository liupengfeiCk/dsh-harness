/**
 * Package-owned invariant companion for `dsh-harness-subagent-bundle/preset`.
 *
 * Subagent mounts are per-child and unwind with the child, so there are no
 * standing compositions to re-audit the way agent presets do. The one
 * assertion this companion owns is that a subagent mount never leaks a
 * process-global service into the root realm — which `mountPreset` already
 * proves once at mount, and which is re-checked here on every service
 * registration so a row that publishes later (from a timer or an async
 * continuation) cannot escape that one-shot audit.
 * @module dsh-harness-subagent-bundle/preset/invariant
 */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'
// Type-only: resolves the `agent` field `dsh-agent` merges into its context.
import type {} from '@deepseek-ai/dsh-agent'
// Imported through the package name, not `./mount.ts`: a module shared between
// the two build entry points becomes a third chunk that the published `files`
// list does not carry, which `verify-built-package-invariants` rejects.
import { leakedServices, livePresetMounts } from '@deepseek-ai/dsh-agent-presets'

const PACKAGE_NAME = 'dsh-harness-subagent-bundle/preset'

/** Cordis companion plugin name. */
export const name = 'subagent-presets-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * Assert that no mounted subagent composition reaches the root service realm.
 *
 * `mountPreset` proves this once, when the subtree settles; a row that
 * publishes later would escape that one-shot audit, so re-check every live
 * mount whenever a service registration changes.
 */
const install: InvariantInstaller = (ctx, fail) => {
  ctx.on('internal/service', function (this: Context, serviceName) {
    for (const mount of livePresetMounts()) {
      const leaked = leakedServices(ctx, mount.fiber)
      if (leaked.length === 0) continue
      fail(
        `subagent "${mount.presetId}" published process-global service(s) [${leaked.join(', ')}] `
        + `after its mount was audited (observed while notifying "${serviceName}") — `
        + 'a subagent service must sit behind an `isolate` realm or move to the host composition',
      )
    }
  }, { global: true })
}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
