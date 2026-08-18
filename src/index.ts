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
import { HarnessHot } from './service.ts'
import { registerHarnessHotWire } from './wire/index.ts'

export { HarnessHot, deriveProfileDir } from './service.ts'
export type { HotTarget } from './service.ts'
export {
  ActivationTimeout, clearPackageLoadCache, HotManager, HOT_DIR, HOT_ROW_PREFIX, HOT_MOUNT_TIMEOUT_MS,
  type HotContext, type HotMountRecord, type PluginHandle,
} from './hot.ts'
export { parsePatch, RestartRequiredError, type HotDisableRow, type HotInsertRow, type HotRow } from './patch.ts'
export {
  HARNESS_HOT_CHANNEL, dispatchHarnessHot, registerHarnessHotWire,
} from './wire/index.ts'
export type { WireEndpointName, WireResult } from './wire/schema.ts'

/**
 * Host plugin body: provide the `harnessHot` service and register the
 * `/harness-hot` loopback channel.
 * @param ctx - the host plugin context.
 */
export function apply(ctx: Context): void {
  ctx.plugin(HarnessHot)
  registerHarnessHotWire(ctx)
}
