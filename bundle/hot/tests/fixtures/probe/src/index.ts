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

import type { Context } from '@deepseek-ai/cordis'
import type { ConnectionRpcAuthority } from '@deepseek-ai/dsh-client-connection'
import type { RpcError, RpcResult } from '@deepseek-ai/dsh-host-apiproxy/api'

/** Absolute logical channel owning the probe endpoint. */
export const HOTPROBE_CHANNEL = '/hotprobe'

/** Loopback-pinned authority: this is a live-composition probe. */
const AUTHORITY: ConnectionRpcAuthority = 'loopback'

/** The version this probe responds with. Bump this and reinstall to test upgrade. */
export const PROBE_VERSION = 'v4'

/**
 * Parse and dispatch one probe endpoint.
 * @param endpoint - the channel-relative endpoint name.
 * @returns the validated result, or the matching failure.
 */
export function dispatchHotprobe(
  endpoint: string,
  _payload: unknown,
  _signal: AbortSignal,
): Promise<RpcResult<unknown>> {
  switch (endpoint) {
    case 'version':
      return Promise.resolve(ok({ version: PROBE_VERSION }))
    default:
      return Promise.resolve(fail({
        code: 'bad-request',
        message: `hotprobe channel does not serve endpoint "${endpoint}"`,
        details: { issues: [] },
      }))
  }
}

/** Success branch of a wire result. */
function ok(value: unknown): RpcResult<unknown> {
  return { ok: true as const, value }
}

/** Failure branch of a wire result. */
function fail(error: RpcError): RpcResult<unknown> {
  return { ok: false as const, error }
}

/**
 * Register the `/hotprobe` channel through the official `ctx.inject` form:
 * the callback runs once the connection service is available, and the handle
 * is torn down with the fiber. The hot loader must drive this child fiber
 * exactly as boot does — this is the regression surface the harness checks.
 * @param ctx - the host plugin context.
 */
export function registerHotprobeWire(ctx: Context): void {
  ctx.inject(['connection'], (connectionCtx) => {
    const connection = connectionCtx.connection
    connectionCtx.effect(
      () => connection.rpc.handle(
        HOTPROBE_CHANNEL,
        (endpoint, payload, signal) =>
          dispatchHotprobe(endpoint, payload, signal),
        { authority: AUTHORITY },
      ),
      'dsh-hotprobe: /hotprobe rpc channel',
    )
  })
}

/**
 * Host plugin body: register the `/hotprobe` loopback channel.
 * @param ctx - the host plugin context.
 */
export function apply(ctx: Context): void {
  registerHotprobeWire(ctx)
}
