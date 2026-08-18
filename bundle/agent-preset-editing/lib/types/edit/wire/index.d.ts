/**
 * Agent-preset editing wire layer (host half).
 *
 * The withdrawn apiproxy `agentPreset.readEditable` / `agentPreset.update`
 * methods lived in the shared `/api` registry; this module re-homes the same
 * editing surface on the connection's dedicated generic RPC channel
 * `/agent-preset-edit`, so the apiproxy registry stays untouched. One channel
 * serves every endpoint (`readEditable`, `update`) with the same semantics as
 * the withdrawn domain: the request and response shapes are zod-validated
 * against {@link wireEndpoints}, the Host resolves and rewrites the preset
 * itself (no composition text or path crosses the wire), and the failure
 * vocabulary keeps the withdrawn domain's codes so the browser surface reads
 * unchanged.
 *
 * The channel is loopback-pinned: editing a preset's files is privileged
 * (reading a composition — or its structured editable fields — is
 * reconnaissance, and update rewrites what the deployment offers), so an
 * anonymous LAN caller must not reach it. This mirrors the loopback pin the
 * withdrawn apiproxy methods carried.
 *
 * The Host half of the editing surface is registered separately from the
 * (pure-function) edit mechanism: the channel must be mounted where the
 * `agentPresets` service lives, so the bundle that composes a web profile
 * calls {@link registerAgentPresetEditWire} once the connection service is
 * available.
 * @module dsh-harness-agent-preset-editing-bundle/edit/wire
 */
import type { Context } from '@deepseek-ai/cordis';
import { type AgentPresets } from '@deepseek-ai/dsh-agent-presets';
import type { RpcResult } from '@deepseek-ai/dsh-host-apiproxy/api';
/** Absolute logical channel owning the agent-preset editing endpoints. */
export declare const AGENT_PRESET_EDIT_CHANNEL = "/agent-preset-edit";
/** The `agentPresets` service the wire needs from the host context. */
type AgentPresetsService = AgentPresets;
/**
 * Parse and dispatch one endpoint against the agent-preset registry.
 * @param registry - the `agentPresets` service (the deployment may compose none).
 * @param endpoint - the channel-relative endpoint name.
 * @param payload - the unvalidated request payload.
 * @param signal - caller/connection lifetime.
 * @returns the validated result, or the matching failure.
 */
export declare function dispatchAgentPresetEdit(registry: AgentPresetsService | undefined, endpoint: string, payload: unknown, signal: AbortSignal): Promise<RpcResult<unknown>>;
/**
 * Register the `/agent-preset-edit` channel once the connection service
 * becomes available. Called by the profile bundle that composes a web
 * deployment — the channel must ride alongside the `agentPresets` service it
 * reads, but the official service itself stays zero-invasive.
 * @param ctx - the host plugin context.
 */
export declare function registerAgentPresetEditWire(ctx: Context): void;
/**
 * Cordis plugin body for the `/agent-preset-edit` channel. Mounted as a host
 * row in the profile bundle alongside the `agentPresets` service, this
 * registers the editing wire without touching the official service package.
 * @param ctx - the host plugin context.
 */
export declare function apply(ctx: Context): void;
export {};
//# sourceMappingURL=index.d.ts.map