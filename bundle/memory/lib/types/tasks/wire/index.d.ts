/**
 * Task-entity management wire layer (host half).
 *
 * The task registry ships as the `tasks` host service in `../index.ts`; this
 * module adds the management surface on the connection's dedicated generic RPC
 * channel `/memory-task`, mirroring the `/model-plan` wire in the model-plan
 * bundle. One channel serves every endpoint (`list`, `read`, `create`,
 * `update`, `complete`, `attachSession`). The channel is loopback-pinned:
 * managing tasks is privileged (creating/updating rearranges what the memory
 * engine filters by), so an anonymous LAN caller must not reach it.
 *
 * The `apply` entry is the cordis plugin body the memory bundle's
 * `cordis.patch.yml` mounts (the skeleton reserves the `memory-task-wire` row).
 * @module dsh-harness-memory-bundle/tasks/wire
 */
import type { Context } from '@deepseek-ai/cordis';
import type { RpcResult } from '@deepseek-ai/dsh-host-apiproxy/api';
import type { Tasks } from '../index.ts';
/** Absolute logical channel owning the task-management endpoints. */
export declare const TASK_WIRE_CHANNEL = "/memory-task";
/**
 * Parse and dispatch one endpoint against the task registry.
 * @param tasks - the task registry service (the deployment may compose none).
 * @param endpoint - the channel-relative endpoint name.
 * @param payload - the unvalidated request payload.
 * @param signal - caller/connection lifetime.
 * @returns the validated result, or the matching failure.
 */
export declare function dispatchTask(tasks: Tasks | undefined, endpoint: string, payload: unknown, signal: AbortSignal): Promise<RpcResult<unknown>>;
/**
 * Register the `/memory-task` channel once the connection service becomes
 * available.
 * @param ctx - the host plugin context.
 */
export declare function registerTaskWire(ctx: Context): void;
/**
 * Cordis plugin body for the `/memory-task` channel. Mounted as a host row in
 * the memory bundle's `cordis.patch.yml` (`memory-task-wire`).
 * @param ctx - the host plugin context.
 */
export declare function apply(ctx: Context): void;
//# sourceMappingURL=index.d.ts.map