/**
 * Team-management wire layer (host half).
 *
 * The user-defined team roster ("编制表") ships as a read-only registry in
 * `src/team/index.ts`; this module adds the browser management surface on the
 * connection's dedicated generic RPC channel `/team-preset`, mirroring the
 * subagent-management wire in `../preset/wire`. One channel serves every
 * endpoint (`list`, `read`, `create`, `update`, `remove`, `openLocation`)
 * with the same semantics as the subagent surface: the request and response
 * shapes are zod-validated against {@link wireEndpoints}, the Host resolves
 * and rewrites teams itself (no path or file text crosses the wire), and the
 * failure vocabulary mirrors the team registry's codes.
 *
 * The channel is loopback-pinned: managing the team roster is privileged
 * (reading a team's role definitions is reconnaissance, and create/update/
 * remove/openLocation rearrange what the deployment offers), so an anonymous
 * LAN caller must not reach it — the same pin the subagent-management channel
 * carries.
 * @module dsh-harness-subagent-bundle/team/wire
 */
import type { Context } from '@deepseek-ai/cordis';
import type { RpcResult } from '@deepseek-ai/dsh-host-apiproxy/api';
import type { SubagentPresets } from '../../preset/index.ts';
import { type Teams } from '../index.ts';
/** Absolute logical channel owning the team-management endpoints. */
export declare const TEAM_PRESET_CHANNEL = "/team-preset";
/**
 * Parse and dispatch one endpoint against the team registry.
 * @param teams - the team registry service (the deployment may compose none).
 * @param subagents - the subagent registry, for the role bodies' available ids
 * (the deployment may compose none; bodies then read empty).
 * @param endpoint - the channel-relative endpoint name.
 * @param payload - the unvalidated request payload.
 * @param signal - caller/connection lifetime.
 * @returns the validated result, or the matching failure.
 */
export declare function dispatchTeamPreset(teams: Teams | undefined, subagents: SubagentPresets | undefined, endpoint: string, payload: unknown, signal: AbortSignal): Promise<RpcResult<unknown>>;
/**
 * Register the `/team-preset` channel once the connection service becomes
 * available.
 * @param ctx - the host plugin context.
 */
export declare function registerTeamPresetWire(ctx: Context): void;
/**
 * Cordis plugin body for the `/team-preset` channel. Mounted as a host row in
 * the profile's cordis.patch.yml, registering the wire without coupling it to
 * the team registry's constructor.
 * @param ctx - the host plugin context.
 */
export declare function apply(ctx: Context): void;
//# sourceMappingURL=index.d.ts.map