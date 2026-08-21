/**
 * Browser transport for the memory-management wire channel.
 *
 * The "记忆" settings section rides the connection's dedicated `/memory`
 * channel, so this module adapts {@link ClientConnectionRpc.call} into the
 * management surface the section controller consumes. Each method mints the
 * payload the Host handler validates against its zod schema and returns the
 * Host's `RpcResult` — the same success/failure shape the model-plan and
 * task-management wires return.
 * @module dsh-harness-memory-bundle/ui/wire-client
 */

import type { ClientConnectionRpc } from '@deepseek-ai/dsh-client-connection/client'
import type { RpcResult } from '@deepseek-ai/dsh-api-remotes/client'

/** Absolute logical channel the Host serves memory management on. */
export const MEMORY_CHANNEL = '/memory'

/** The three scoping tabs the settings section offers. */
export type WireAssetScope = 'team' | 'teamRole' | 'project'

/** Isolation coordinates for one scope tab. */
export interface WireIsolation {
  readonly teamId?: string
  readonly roleId?: string
  readonly projectId?: string
}

/** One enumerated asset row on the wire. */
export interface WireAssetEntry {
  readonly ref: string
  readonly layer: 'L1' | 'L2' | 'L3'
  readonly title: string
  readonly preview: string
  readonly updatedAtMs: number
}

/** One scope's assets across the three layers. */
export interface WireScopeAssets {
  readonly scope: WireAssetScope
  readonly isolation: WireIsolation
  readonly l1: readonly WireAssetEntry[]
  readonly l2: readonly WireAssetEntry[]
  readonly l3: readonly WireAssetEntry[]
}

/** Pipeline status for one scope. */
export interface WireScopeStatus {
  readonly scope: WireAssetScope
  readonly isolation: WireIsolation
  readonly l0Count: number
  readonly l1Count: number
  readonly l2Count: number
  readonly l3Count: number
  readonly lastExtractedAtMs: number
}

/** The memory settings value. */
export interface WireMemorySettings {
  readonly enabled: boolean
  readonly refinementPlan: string
  readonly compression: {
    readonly mode: 'follow' | 'plan'
    readonly planId: string
  }
  readonly injectionLimit: number
  readonly compressionLine: number
  readonly retainLine: number
}

/** The browser-side management face over the `/memory` channel. */
export interface MemoryWire {
  assets(payload: { scope: WireAssetScope; isolation?: WireIsolation }, signal?: AbortSignal): Promise<RpcResult<WireScopeAssets>>
  assetRead(payload: { ref: string }, signal?: AbortSignal): Promise<RpcResult<{ title: string; content: string }>>
  assetDelete(payload: { ref: string }, signal?: AbortSignal): Promise<RpcResult<{ deleted: boolean }>>
  bindRole(payload: { roleId: string; assetRef: string }, signal?: AbortSignal): Promise<RpcResult<{ assets: string[] }>>
  unbindRole(payload: { roleId: string; assetRef: string }, signal?: AbortSignal): Promise<RpcResult<{ assets: string[] }>>
  roleBindings(payload: { roleId: string }, signal?: AbortSignal): Promise<RpcResult<{ assets: string[] }>>
  status(payload: { scope: WireAssetScope; isolation?: WireIsolation }, signal?: AbortSignal): Promise<RpcResult<WireScopeStatus>>
  config(payload: Record<string, never>, signal?: AbortSignal): Promise<RpcResult<WireMemorySettings>>
}

/** Build the management wire face over one connection RPC caller. */
export function createMemoryWire(rpc: ClientConnectionRpc): MemoryWire {
  return {
    assets: (payload, signal) => call<WireScopeAssets>('assets', payload, signal),
    assetRead: (payload, signal) => call<{ title: string; content: string }>('assetRead', payload, signal),
    assetDelete: (payload, signal) => call<{ deleted: boolean }>('assetDelete', payload, signal),
    bindRole: (payload, signal) => call<{ assets: string[] }>('bindRole', payload, signal),
    unbindRole: (payload, signal) => call<{ assets: string[] }>('unbindRole', payload, signal),
    roleBindings: (payload, signal) => call<{ assets: string[] }>('roleBindings', payload, signal),
    status: (payload, signal) => call<WireScopeStatus>('status', payload, signal),
    config: (payload, signal) => call<WireMemorySettings>('config', payload, signal),
  }

  /** Call one endpoint, returning the caller's declared result type. */
  function call<T>(endpoint: string, payload: unknown, signal?: AbortSignal): Promise<RpcResult<T>> {
    return rpc.call(MEMORY_CHANNEL, endpoint, payload, signal) as Promise<RpcResult<T>>
  }
}
