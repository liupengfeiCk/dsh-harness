/**
 * Memory management wire layer (host half, T14).
 *
 * The settings section's "记忆" block reads and mutates the memory engine's
 * assets through the connection's dedicated generic RPC channel `/memory`,
 * mirroring the `/model-plan` and `/memory-task` wires. One channel serves
 * every endpoint (`assets`, `assetRead`, `assetDelete`, `bindRole`,
 * `unbindRole`, `roleBindings`, `status`, `config`) with the same semantics as
 * the sibling surfaces: request and response shapes are zod-validated against
 * {@link wireEndpoints}, and the manager resolves/rewrites assets itself (no
 * path or file text crosses the wire).
 *
 * The channel is loopback-pinned: managing memory is privileged (deleting an
 * asset and reassigning role bindings rearranges what the engine injects), so
 * an anonymous LAN caller must not reach it.
 *
 * The `apply` entry is the cordis plugin body the memory bundle's
 * `cordis.patch.yml` mounts (`memory-wire`).
 * @module dsh-harness-memory-bundle/wire
 */
import type { Context } from '@deepseek-ai/cordis';
import type { RpcResult } from '@deepseek-ai/dsh-host-apiproxy/api';
import { MemoryManager } from '../memory/manager.ts';
/** Absolute logical channel owning the memory-management endpoints. */
export declare const MEMORY_CHANNEL = "/memory";
/**
 * Parse and dispatch one endpoint against the memory manager.
 * @param manager - the memory management facade.
 * @param endpoint - the channel-relative endpoint name.
 * @param payload - the unvalidated request payload.
 * @param signal - caller/connection lifetime.
 * @returns the validated result, or the matching failure.
 */
export declare function dispatchMemory(manager: MemoryManager | undefined, endpoint: string, payload: unknown, signal: AbortSignal): Promise<RpcResult<unknown>>;
/**
 * Register the `/memory` channel once the connection service becomes available.
 * @param ctx - the host plugin context.
 */
export declare function registerMemoryWire(ctx: Context): void;
/**
 * Cordis plugin body for the `/memory` channel. Mounted as a host row in the
 * memory bundle's `cordis.patch.yml` (`memory-wire`).
 * @param ctx - the host plugin context.
 */
export declare function apply(ctx: Context): void;
//# sourceMappingURL=index.d.ts.map