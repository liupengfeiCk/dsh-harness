/**
 * Browser transport for the subagent-management wire channel.
 *
 * The withdrawn apiproxy `subagentPreset.*` domain reached the browser as
 * methods on the shared `IApiClient`; that domain now lives on the connection's
 * dedicated `/subagent-preset` channel, so this module adapts
 * {@link ClientConnectionRpc.call} into the same management surface the section
 * controller consumes. Each method mints the payload the Host handler
 * validates against its zod schema and returns the Host's `RpcResult` — the
 * same success/failure shape the withdrawn `IApiClient` methods returned
 * (minus the echoed rpcId, which the section never used).
 * @module dsh-harness-subagent-bundle/ui/wire-client
 */

import type { ClientConnectionRpc } from '@deepseek-ai/dsh-client-connection/client'
import type { RpcResult } from '@deepseek-ai/dsh-api-remotes/client'

/** Absolute logical channel the Host serves subagent management on. */
export const SUBAGENT_PRESET_CHANNEL = '/subagent-preset'

/** A subagent's display metadata on the wire. */
export interface WireSubagentMetadata {
  readonly description?: string
  readonly enabled?: boolean
  /** Model-plan id the subagent binds; absent means "inherit the parent". */
  readonly model?: string
  readonly inheritParent?: boolean
}

/** One subagent roster row. */
export interface WireSubagentEntry {
  readonly id: string
  readonly trust: 'system' | 'user'
  readonly metadata: WireSubagentMetadata
  readonly broken?: string
}

/** One tool row in a subagent's composition, with its enabled state. */
export interface WireToolRow {
  readonly id: string
  readonly name: string
  readonly disabled: boolean | 'expr'
  readonly description?: string
}

/** One installable tool package in the available-tools directory. */
export interface WireCatalogTool {
  readonly name: string
  readonly toolNames: readonly string[]
  readonly description?: string
  readonly installed: boolean
}

/** The browser-side management face over the `/subagent-preset` channel. */
export interface SubagentPresetWire {
  list(payload: Record<string, never>, signal?: AbortSignal): Promise<RpcResult<{
    subagents: readonly WireSubagentEntry[]
    authorable: boolean
    hasDocument: boolean
  }>>
  read(payload: { subagent: string }, signal?: AbortSignal): Promise<RpcResult<{
    subagent: string
    trust: 'system' | 'user'
    content: string
  }>>
  create(payload: { from: string; subagent: string }, signal?: AbortSignal): Promise<RpcResult<{ subagent: string }>>
  openDocument(payload: { subagent: string }, signal?: AbortSignal): Promise<RpcResult<
    { opened: true } | { opened: false; path: string }
  >>
  remove(payload: { subagent: string }, signal?: AbortSignal): Promise<RpcResult<{}>>
  readEditable(payload: { subagent: string }, signal?: AbortSignal): Promise<RpcResult<{
    subagent: string
    persona?: { text: string }
    tools: readonly WireToolRow[]
    catalog: readonly WireCatalogTool[]
    metadata: WireSubagentMetadata
  }>>
  update(payload: {
    subagent: string
    persona?: { text?: string }
    tools?: Readonly<Record<string, { disabled: boolean }>>
    installTools?: readonly string[]
    removeTools?: readonly string[]
    metadata?: WireSubagentMetadata
  }, signal?: AbortSignal): Promise<RpcResult<{ subagent: string }>>
}

/** Build the management wire face over one connection RPC caller. */
export function createSubagentPresetWire(rpc: ClientConnectionRpc): SubagentPresetWire {
  return {
    list: (payload, signal) => call<{
      subagents: readonly WireSubagentEntry[]
      authorable: boolean
      hasDocument: boolean
    }>('list', payload, signal),
    read: (payload, signal) => call<{
      subagent: string
      trust: 'system' | 'user'
      content: string
    }>('read', payload, signal),
    create: (payload, signal) => call<{ subagent: string }>('create', payload, signal),
    openDocument: (payload, signal) => call<{ opened: true } | { opened: false; path: string }>('openDocument', payload, signal),
    remove: (payload, signal) => call<{}>('remove', payload, signal),
    readEditable: (payload, signal) => call<{
      subagent: string
      persona?: { text: string }
      tools: readonly WireToolRow[]
      catalog: readonly WireCatalogTool[]
      metadata: WireSubagentMetadata
    }>('readEditable', payload, signal),
    update: (payload, signal) => call<{ subagent: string }>('update', payload, signal),
  }

  /** Call one endpoint, returning the caller's declared result type. */
  function call<T>(endpoint: string, payload: unknown, signal?: AbortSignal): Promise<RpcResult<T>> {
    return rpc.call(SUBAGENT_PRESET_CHANNEL, endpoint, payload, signal) as Promise<RpcResult<T>>
  }
}
