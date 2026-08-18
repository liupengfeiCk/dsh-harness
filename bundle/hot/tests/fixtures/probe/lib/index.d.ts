/**
 * dsh-hotprobe-bundle — the Harness hot-loader test probe.
 *
 * A minimal DSH plugin bundle whose single host row registers a loopback-pinned
 * `/hotprobe` RPC channel. The channel serves one endpoint, `version`, that
 * echoes the probe's version string. The end-to-end hot-loader check mounts
 * this package through `/harness-hot/mount`, probes `/hotprobe/version`, then
 * upgrades to a bumped `VERSION` and re-probes — proving a hot-mounted
 * package's RPC channel is reachable and hot-upgradeable in a running process.
 *
 * The wire uses the same registration shape as the official bundles
 * (agent-preset-edit, /harness-hot): `ctx.inject(['connection'], ...)` then
 * `connection.rpc.handle(...)` on the connection service. This is the official
 * cordis standard — the hot loader must drive it identically to boot.
 * @module dsh-hotprobe-bundle
 */
import type { Context } from '@deepseek-ai/cordis';
import type { RpcResult } from '@deepseek-ai/dsh-host-apiproxy/api';
/** Absolute logical channel owning the probe endpoint. */
export declare const HOTPROBE_CHANNEL = "/hotprobe";
/** The version this probe responds with. Bump this and reinstall to test upgrade. */
export declare const PROBE_VERSION = "v4";
/**
 * Parse and dispatch one probe endpoint.
 * @param endpoint - the channel-relative endpoint name.
 * @returns the validated result, or the matching failure.
 */
export declare function dispatchHotprobe(endpoint: string, _payload: unknown, _signal: AbortSignal): Promise<RpcResult<unknown>>;
/**
 * Register the `/hotprobe` channel through the official `ctx.inject` form:
 * the callback runs once the connection service is available, and the handle
 * is torn down with the fiber. The hot loader must drive this child fiber
 * exactly as boot does — this is the regression surface the harness checks.
 * @param ctx - the host plugin context.
 */
export declare function registerHotprobeWire(ctx: Context): void;
/**
 * Host plugin body: register the `/hotprobe` loopback channel.
 * @param ctx - the host plugin context.
 */
export declare function apply(ctx: Context): void;
