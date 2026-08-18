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
import { HarnessHot } from "./service.js";
import { registerHarnessHotWire } from "./wire/index.js";
export { HarnessHot, deriveProfileDir } from "./service.js";
export { ActivationTimeout, clearPackageLoadCache, HotManager, HOT_DIR, HOT_ROW_PREFIX, HOT_MOUNT_TIMEOUT_MS, } from "./hot.js";
export { parsePatch, RestartRequiredError } from "./patch.js";
export { HARNESS_HOT_CHANNEL, dispatchHarnessHot, registerHarnessHotWire, } from "./wire/index.js";
/**
 * Host plugin body: provide the `harnessHot` service and register the
 * `/harness-hot` loopback channel.
 * @param ctx - the host plugin context.
 */
export function apply(ctx) {
    ctx.plugin(HarnessHot);
    registerHarnessHotWire(ctx);
}
//# sourceMappingURL=index.js.map