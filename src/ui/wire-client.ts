/**
 * Browser transport for the model-plan management wire channel.
 *
 * The model-plan registry ("模型方案") rides the connection's dedicated
 * `/model-plan` channel, so this module adapts
 * {@link ClientConnectionRpc.call} into the management surface the settings
 * section controller and the composer model-seat controller consume. Each
 * method mints the payload the Host handler validates against its zod schema
 * and returns the Host's `RpcResult` — the same success/failure shape the
 * team-management wire returns.
 * @module dsh-harness-model-plan-bundle/ui/wire-client
 */

import type { ClientConnectionRpc } from '@deepseek-ai/dsh-client-connection/client'
import type { RpcResult } from '@deepseek-ai/dsh-api-remotes/client'

/** Absolute logical channel the Host serves model-plan management on. */
export const MODEL_PLAN_CHANNEL = '/model-plan'

/** A plan's provenance on the wire, mirroring the registry's own trust. */
export type WirePlanTrust = 'system' | 'user'

/** A bag of arbitrary key=value plan params (values are JSON scalars). */
export type WireParams = Record<string, unknown>

/** One plan roster row. */
export interface WirePlanEntry {
  readonly id: string
  readonly name?: string
  readonly provider: string
  readonly model: string
  readonly params: WireParams
  readonly trust: WirePlanTrust
  readonly isDefault: boolean
  readonly broken?: string
}

/** The session's folded selection as the wire reports it. */
export interface WireSelectionState {
  readonly planId?: string
  readonly overrides: WireParams
}

/** The browser-side management face over the `/model-plan` channel. */
export interface ModelPlanWire {
  list(payload: Record<string, never>, signal?: AbortSignal): Promise<RpcResult<{
    plans: readonly WirePlanEntry[]
    authorable: boolean
  }>>
  read(payload: { id: string }, signal?: AbortSignal): Promise<RpcResult<{ plan: WirePlanEntry }>>
  readSelection(payload: { sessionId: string }, signal?: AbortSignal): Promise<RpcResult<WireSelectionState>>
  create(payload: {
    id: string
    name?: string
    provider: string
    model: string
    params?: WireParams
    default?: boolean
  }, signal?: AbortSignal): Promise<RpcResult<{ id: string }>>
  update(payload: {
    id: string
    name?: string
    provider?: string
    model?: string
    params?: WireParams
    default?: boolean
  }, signal?: AbortSignal): Promise<RpcResult<{ id: string }>>
  remove(payload: { id: string }, signal?: AbortSignal): Promise<RpcResult<{}>>
  select(payload: {
    sessionId: string
    planId: string
    overrides?: WireParams
  }, signal?: AbortSignal): Promise<RpcResult<WireSelectionState>>
}

/** Build the management wire face over one connection RPC caller. */
export function createModelPlanWire(rpc: ClientConnectionRpc): ModelPlanWire {
  return {
    list: (payload, signal) => call<{
      plans: readonly WirePlanEntry[]
      authorable: boolean
    }>('list', payload, signal),
    read: (payload, signal) => call<{ plan: WirePlanEntry }>('read', payload, signal),
    readSelection: (payload, signal) => call<WireSelectionState>('readSelection', payload, signal),
    create: (payload, signal) => call<{ id: string }>('create', payload, signal),
    update: (payload, signal) => call<{ id: string }>('update', payload, signal),
    remove: (payload, signal) => call<{}>('remove', payload, signal),
    select: (payload, signal) => call<WireSelectionState>('select', payload, signal),
  }

  /** Call one endpoint, returning the caller's declared result type. */
  function call<T>(endpoint: string, payload: unknown, signal?: AbortSignal): Promise<RpcResult<T>> {
    return rpc.call(MODEL_PLAN_CHANNEL, endpoint, payload, signal) as Promise<RpcResult<T>>
  }
}
