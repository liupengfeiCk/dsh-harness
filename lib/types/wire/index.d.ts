/**
 * The `/harness-hot` wire layer (host half).
 *
 * Hot-mounting, upgrading, or unmounting a plugin rewrites what the RUNNING
 * composition offers — a privileged operation. The channel is therefore
 * loopback-pinned (`authority: 'loopback'`), exactly like the withdrawn
 * apiproxy `agentPreset.*` methods and the harness agent-preset-edit wire. The
 * channel serves four endpoints — `mount`, `unmount`, `upgrade`, `list` —
 * validated against {@link wireEndpoints}; the Host resolves the profile and
 * rewrites the running tree itself, so no file path crosses the wire.
 *
 * The Host half is registered separately from the (pure) hot engine: the
 * channel must ride where the `harnessHot` service lives, so the bundle that
 * composes a web profile calls {@link registerHarnessHotWire} once the
 * connection service is available.
 * @module dsh-harness-hot-bundle/wire
 */
import { Context } from '@deepseek-ai/cordis';
import type { RpcResult } from '@deepseek-ai/dsh-host-apiproxy/api';
import type { HarnessHot } from '../service.ts';
/** Absolute logical channel owning the harness-hot endpoints. */
export declare const HARNESS_HOT_CHANNEL = "/harness-hot";
/** The `harnessHot` service the wire needs from the host context. */
type HarnessHotService = HarnessHot;
/**
 * Parse and dispatch one endpoint against the harness-hot service.
 * @param service - the `harnessHot` service (the deployment may compose none).
 * @param endpoint - the channel-relative endpoint name.
 * @param payload - the unvalidated request payload.
 * @param signal - caller/connection lifetime.
 * @returns the validated result, or the matching failure.
 */
export declare function dispatchHarnessHot(service: HarnessHotService | undefined, endpoint: string, payload: unknown, signal: AbortSignal): Promise<RpcResult<unknown>>;
/**
 * Register the `/harness-hot` channel once the connection service becomes
 * available. Called by the profile bundle that composes a web deployment.
 * @param ctx - the host plugin context.
 */
export declare function registerHarnessHotWire(ctx: Context): void;
/**
 * Cordis plugin body for the `/harness-hot` channel. Mounted as a host row in
 * the profile bundle alongside the `harnessHot` service, this registers the
 * wire without touching any official package.
 * @param ctx - the host plugin context.
 */
export declare function apply(ctx: Context): void;
export {};
//# sourceMappingURL=index.d.ts.map