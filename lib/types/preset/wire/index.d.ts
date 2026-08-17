/**
 * Subagent-management wire layer (host half).
 *
 * The withdrawn apiproxy `subagentPreset.*` domain lived in the shared `/api`
 * registry; this module re-homes the same management surface on the
 * connection's dedicated generic RPC channel `/subagent-preset`, so the
 * apiproxy registry stays untouched. One channel serves every endpoint
 * (`list`, `read`, `create`, `openDocument`, `remove`, `readEditable`,
 * `update`) with the same semantics as the withdrawn domain: the request and
 * response shapes are zod-validated against {@link wireEndpoints}, the Host
 * resolves and rewrites subagents itself (no path or composition text crosses
 * the wire), and the failure vocabulary keeps the withdrawn domain's codes so
 * the browser surface reads unchanged.
 *
 * The channel is loopback-pinned: managing the subagent roster is privileged
 * (reading a composition is reconnaissance, and create/remove/openDocument/
 * update rearrange what the deployment offers), so an anonymous LAN caller
 * must not reach it. This mirrors the loopback pin the withdrawn apiproxy
 * domain carried.
 * @module dsh-harness-subagent-bundle/preset/wire
 */
import type { Context } from '@deepseek-ai/cordis';
import type { RpcResult } from '@deepseek-ai/dsh-host-apiproxy/api';
import { type SubagentPresets } from '../index.ts';
/** Absolute logical channel owning the subagent-management endpoints. */
export declare const SUBAGENT_PRESET_CHANNEL = "/subagent-preset";
/**
 * Parse and dispatch one endpoint against the subagent registry.
 * @param registry - the subagent-presets service (the deployment may compose none).
 * @param endpoint - the channel-relative endpoint name.
 * @param payload - the unvalidated request payload.
 * @param signal - caller/connection lifetime.
 * @returns the validated result, or the matching failure.
 */
export declare function dispatchSubagentPreset(registry: SubagentPresets | undefined, endpoint: string, payload: unknown, signal: AbortSignal): Promise<RpcResult<unknown>>;
/**
 * Register the `/subagent-preset` channel once the connection service becomes
 * available. Called from the {@link SubagentPresets} service constructor so the
 * management surface rides alongside the registry without a separate cordis
 * plugin row.
 * @param ctx - the host plugin context.
 */
export declare function registerSubagentPresetWire(ctx: Context): void;
//# sourceMappingURL=index.d.ts.map