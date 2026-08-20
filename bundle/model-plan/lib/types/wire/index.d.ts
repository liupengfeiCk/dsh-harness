/**
 * Model-plan management wire layer (host half).
 *
 * The model-plan registry ships as a host service in `../index.ts`; this
 * module adds the browser management surface on the connection's dedicated
 * generic RPC channel `/model-plan`, mirroring the team-management wire in the
 * subagent bundle. One channel serves every endpoint (`list`, `read`,
 * `create`, `update`, `remove`, `select`, `readSelection`) with the same
 * semantics as the team surface: the request and response shapes are
 * zod-validated against {@link wireEndpoints}, the Host resolves and rewrites
 * plans itself (no path or file text crosses the wire), and the failure
 * vocabulary mirrors the plan registry's codes.
 *
 * The channel is loopback-pinned: managing plans is privileged (reading a
 * plan's params is reconnaissance, and create/update/remove/select rearrange
 * what a bound session uses), so an anonymous LAN caller must not reach it —
 * the same pin the team-management channel carries.
 * @module dsh-harness-model-plan-bundle/wire
 */
import type { Context } from '@deepseek-ai/cordis';
import type { RpcResult } from '@deepseek-ai/dsh-host-apiproxy/api';
import { type ModelPlans } from '../index.ts';
/** Absolute logical channel owning the model-plan management endpoints. */
export declare const MODEL_PLAN_CHANNEL = "/model-plan";
/**
 * Parse and dispatch one endpoint against the plan registry.
 * @param plans - the plan registry service (the deployment may compose none).
 * @param endpoint - the channel-relative endpoint name.
 * @param payload - the unvalidated request payload.
 * @param signal - caller/connection lifetime.
 * @returns the validated result, or the matching failure.
 */
export declare function dispatchModelPlan(plans: ModelPlans | undefined, endpoint: string, payload: unknown, signal: AbortSignal): Promise<RpcResult<unknown>>;
/**
 * Register the `/model-plan` channel once the connection service becomes
 * available.
 * @param ctx - the host plugin context.
 */
export declare function registerModelPlanWire(ctx: Context): void;
/**
 * Cordis plugin body for the `/model-plan` channel. Mounted as a host row in
 * the profile's cordis.patch.yml, registering the wire without coupling it to
 * the plan registry's constructor.
 * @param ctx - the host plugin context.
 */
export declare function apply(ctx: Context): void;
//# sourceMappingURL=index.d.ts.map