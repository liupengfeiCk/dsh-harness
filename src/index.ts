/**
 * dsh-harness-hot-bundle — the Harness-owned hot mount/upgrade surface as a
 * profile bundle. The package's substance is `cordis.patch.yml` (declared by
 * the `dsh.bundle.patch` manifest field) plus the host `harnessHot` service
 * and its loopback-pinned `/harness-hot` RPC channel. Pure host package: there
 * is no browser half.
 *
 * The mounted `harness-hot` host row provides `ctx.harnessHot` (mount/unmount/
 * upgrade/list) and registers the `/harness-hot` connection channel through
 * which a client calls it.
 * @module dsh-harness-hot-bundle
 */

import { Context } from '@deepseek-ai/cordis'
import { HarnessHot, harnessHotConfigSchema, type HarnessHotConfig } from './service.ts'
import { registerHarnessHotWire } from './wire/index.ts'

export { HarnessHot, deriveProfileDir, harnessHotConfigSchema } from './service.ts'
export type { HotTarget, HarnessHotConfig } from './service.ts'
export {
  ActivationTimeout, clearPackageLoadCache, HotManager, HOT_DIR, HOT_ROW_PREFIX, HOT_MOUNT_TIMEOUT_MS,
  type HotContext, type HotMountRecord, type PluginHandle,
} from './hot.ts'
export { parsePatch, RestartRequiredError, type HotDisableRow, type HotInsertRow, type HotRow } from './patch.ts'
export {
  HARNESS_HOT_CHANNEL, dispatchHarnessHot, registerHarnessHotWire, type HarnessHotHost,
} from './wire/index.ts'
export type { WireEndpointName, WireResult } from './wire/schema.ts'

/**
 * Host plugin body: provide the `harnessHot` service and register the
 * `/harness-hot` loopback channel. The row's config carries the autoMount
 * list — packages the service hot-mounts as it activates, so a business
 * plugin lives entirely on this surface (no static bundle row) yet still
 * comes back after every restart.
 * @param ctx - the host plugin context.
 * @param config - the row config (`autoMount` list); invalid shapes fail loud.
 */
export function apply(ctx: Context, config?: unknown): void {
  ctx.plugin(HarnessHot, parseRowConfig(config))
  registerHarnessHotWire(ctx)
}

/** Validate the loader row config at the plugin boundary. */
function parseRowConfig(config: unknown): HarnessHotConfig {
  if (config === undefined || config === null) return {}
  // The schema already proves the shape (autoMount is a non-empty string
  // array, or absent); narrow the optional to satisfy exactOptionalPropertyTypes.
  return harnessHotConfigSchema.parse(config) as HarnessHotConfig
}
