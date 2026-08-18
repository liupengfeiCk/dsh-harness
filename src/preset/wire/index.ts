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

import type { Context } from '@deepseek-ai/cordis'
import { dirname } from 'node:path'
import { z } from 'zod'
import type { ConnectionRpcAuthority } from '@deepseek-ai/dsh-client-connection'
import type { RpcError, RpcResult } from '@deepseek-ai/dsh-host-apiproxy/api'
import {
  SubagentNotWritableError,
  UnknownSubagentError,
  type SubagentMetadata,
  type SubagentPresets,
} from '../index.ts'
import { canOpenDirectory, openDirectory } from './opener.ts'
import { wireEndpoints, type WireEndpointName } from './schema.ts'

/** Absolute logical channel owning the subagent-management endpoints. */
export const SUBAGENT_PRESET_CHANNEL = '/subagent-preset'

/** Loopback-pinned authority: managing the roster is privileged. */
const AUTHORITY: ConnectionRpcAuthority = 'loopback'

/** One endpoint's request payload, narrowed to its validated schema. */
type EndpointPayload<N extends WireEndpointName> = z.infer<typeof wireEndpoints[N]['request']>

/**
 * Parse and dispatch one endpoint against the subagent registry.
 * @param registry - the subagent-presets service (the deployment may compose none).
 * @param endpoint - the channel-relative endpoint name.
 * @param payload - the unvalidated request payload.
 * @param signal - caller/connection lifetime.
 * @returns the validated result, or the matching failure.
 */
export async function dispatchSubagentPreset(
  registry: SubagentPresets | undefined,
  endpoint: string,
  payload: unknown,
  signal: AbortSignal,
): Promise<RpcResult<unknown>> {
  try {
    switch (endpoint) {
      case 'list':
        return await list(registry)
      case 'read':
        return await read(registry, parse(wireEndpoints.read.request, payload))
      case 'create':
        return await create(registry, parse(wireEndpoints.create.request, payload))
      case 'openDocument':
        return await openDocument(registry, parse(wireEndpoints.openDocument.request, payload), signal)
      case 'remove':
        return await remove(registry, parse(wireEndpoints.remove.request, payload))
      case 'readEditable':
        return await readEditable(registry, parse(wireEndpoints.readEditable.request, payload))
      case 'update':
        return await update(registry, parse(wireEndpoints.update.request, payload))
      default:
        return fail(badEndpointError(endpoint))
    }
  } catch (error) {
    if (error instanceof BadRequestError) {
      return fail({
        code: 'bad-request',
        message: `invalid payload for ${endpoint}`,
        details: { issues: error.issues },
      })
    }
    return fail({
      code: 'internal',
      message: `subagent-preset handler failure: ${error instanceof Error ? error.message : String(error)}`,
      details: {},
    })
  }
}

/**
 * Register the `/subagent-preset` channel once the connection service becomes
 * available. Called from the {@link SubagentPresets} service constructor so the
 * management surface rides alongside the registry without a separate cordis
 * plugin row.
 * @param ctx - the host plugin context.
 */
export function registerSubagentPresetWire(ctx: Context): void {
  // `ctx.inject(['connection'])` inside a hot-mounted Include subtree may
  // never be driven ACTIVE (proven against the harness hot loader), so this
  // registers through an immediate `ctx.get` plus the shared-registry
  // `internal/service` event — reaching the connection whether it is already
  // present (runtime hot mount) or arrives later (boot auto-mount).
  const tryRegister = (): void => {
    const connection = ctx.get('connection')
    if (connection === undefined) return
    ctx.effect(
      () => connection.rpc.handle(
        SUBAGENT_PRESET_CHANNEL,
        (endpoint, payload, signal) =>
          dispatchSubagentPreset(ctx.get('subagentPresets'), endpoint, payload, signal),
        { authority: AUTHORITY },
      ),
      'dsh-subagent-preset: /subagent-preset rpc channel',
    )
  }
  tryRegister()
  ctx.on('internal/service', (name) => {
    if (name === 'connection') tryRegister()
  })
}

/** A deployment with no subagent registry answers an empty roster, not an error. */
async function list(registry: SubagentPresets | undefined): Promise<RpcResult<unknown>> {
  if (registry === undefined) {
    return ok({ subagents: [], authorable: false, hasDocument: false })
  }
  return ok({
    subagents: (await registry.list()).map(subagent => ({
      id: subagent.id,
      trust: subagent.trust,
      // The metadata rides through whole so a new metadata field needs no
      // per-field assembly on this wire seam.
      metadata: subagent.metadata,
      ...subagent.broken === undefined ? {} : { broken: subagent.broken },
    })),
    authorable: registry.authorable,
    hasDocument: canOpenDirectory(),
  })
}

async function read(
  registry: SubagentPresets | undefined,
  request: EndpointPayload<'read'>,
): Promise<RpcResult<unknown>> {
  if (registry === undefined) return fail(notFound(request.subagent))
  try {
    const resolved = await registry.resolve(request.subagent)
    return ok({
      subagent: resolved.id,
      trust: resolved.trust,
      content: await registry.read(resolved.id),
    })
  } catch (error) {
    return fail(subagentFailure(request.subagent, error))
  }
}

async function create(
  registry: SubagentPresets | undefined,
  request: EndpointPayload<'create'>,
): Promise<RpcResult<unknown>> {
  if (registry === undefined) return fail(notFound(request.subagent))
  try {
    await registry.create(request.from, request.subagent)
    return ok({ subagent: request.subagent })
  } catch (error) {
    return fail(subagentFailure(request.subagent, error))
  }
}

async function openDocument(
  registry: SubagentPresets | undefined,
  request: EndpointPayload<'openDocument'>,
  signal: AbortSignal,
): Promise<RpcResult<unknown>> {
  if (registry === undefined) return fail(notFound(request.subagent))
  try {
    const resolved = await registry.resolve(request.subagent)
    // Same line as the withdrawn agent-presets domain: the shipped install is
    // not the user's to manage, and pointing an editor into it invites edits
    // an upgrade will silently overwrite.
    if (resolved.trust !== 'user') {
      throw new SubagentNotWritableError(resolved.id, 'it ships with the deployment')
    }
    const directory = dirname(resolved.path)
    if (!canOpenDirectory()) return ok({ opened: false as const, path: directory })
    return await openDirectoryResult(directory, signal)
  } catch (error) {
    return fail(subagentFailure(request.subagent, error))
  }
}

async function openDirectoryResult(directory: string, signal: AbortSignal): Promise<RpcResult<unknown>> {
  try {
    await openDirectory(directory, signal)
    return ok({ opened: true as const })
  } catch (error) {
    if (signal.aborted) {
      return fail({ code: 'cancelled', message: 'path open was aborted', details: {} })
    }
    return fail({
      code: 'internal',
      message: `path open failed: ${error instanceof Error ? error.message : String(error)}`,
      details: {},
    })
  }
}

async function remove(
  registry: SubagentPresets | undefined,
  request: EndpointPayload<'remove'>,
): Promise<RpcResult<unknown>> {
  if (registry === undefined) return fail(notFound(request.subagent))
  try {
    await registry.remove(request.subagent)
    return ok({})
  } catch (error) {
    return fail(subagentFailure(request.subagent, error))
  }
}

async function readEditable(
  registry: SubagentPresets | undefined,
  request: EndpointPayload<'readEditable'>,
): Promise<RpcResult<unknown>> {
  if (registry === undefined) return fail(notFound(request.subagent))
  try {
    const fields = await registry.readEditable(request.subagent)
    return ok({
      subagent: request.subagent,
      ...fields.persona === undefined ? {} : { persona: fields.persona },
      tools: fields.tools,
      catalog: fields.catalog,
      metadata: fields.metadata,
    })
  } catch (error) {
    return fail(subagentFailure(request.subagent, error))
  }
}

async function update(
  registry: SubagentPresets | undefined,
  request: EndpointPayload<'update'>,
): Promise<RpcResult<unknown>> {
  if (registry === undefined) return fail(notFound(request.subagent))
  try {
    const { subagent, persona, tools, installTools, removeTools, metadata } = request
    // An enabled-only metadata write is the row-level toggle (folded into
    // update after the toggle method was removed): it must keep the row's
    // other metadata intact, and a shipped subagent's switch is an override
    // rather than an install rewrite.
    const enabledOnly = metadata !== undefined
      && Object.keys(metadata).length === 1
      && 'enabled' in metadata
    if (enabledOnly) {
      await registry.setEnabled(subagent, metadata.enabled as boolean)
      return ok({ subagent })
    }
    const staged: { persona?: { text?: string } } = {}
    if (persona !== undefined) staged.persona = persona
    await registry.updateComposition(
      subagent,
      {
        ...staged.persona === undefined ? {} : { persona: staged.persona },
        ...tools === undefined ? {} : { tools },
        ...installTools === undefined ? {} : { installTools },
        ...removeTools === undefined ? {} : { removeTools },
      },
      metadata as SubagentMetadata | undefined,
    )
    return ok({ subagent })
  } catch (error) {
    return fail(subagentFailure(request.subagent, error))
  }
}

/** Parse one endpoint's payload; a malformed shape throws BadRequestError. */
function parse<S extends z.ZodType>(
  schema: S,
  payload: unknown,
): z.infer<S> {
  const parsed = schema.safeParse(payload)
  if (!parsed.success) throw new BadRequestError(parsed.error.issues)
  return parsed.data
}

/** A malformed endpoint payload; thrown inside parse and folded by dispatch. */
class BadRequestError extends Error {
  constructor(readonly issues: readonly unknown[]) {
    super('invalid payload')
  }
}

/**
 * The wire's own failure vocabulary. Kept as a local shape rather than the
 * apiproxy closed `RpcError` union so the withdrawn `subagent-preset-*` codes
 * can survive the registry withdrawal with their semantics intact; the result
 * is cast to the carrier's `RpcResult` shape at the boundary.
 */
type WireError = { code: string; message: string; details: Record<string, unknown> }

/** Success branch of a wire result. */
function ok(value: unknown): RpcResult<unknown> {
  return { ok: true as const, value }
}

/** Failure branch of a wire result. */
function fail(error: WireError): RpcResult<unknown> {
  return { ok: false as const, error: error as RpcError }
}

/** Fail-closed code for an endpoint this channel does not serve. */
function badEndpointError(endpoint: string): WireError {
  return {
    code: 'bad-request',
    message: `subagent-preset channel does not serve endpoint "${endpoint}"`,
    details: { issues: [] },
  }
}

/** The withdrawn domain's not-found shape when the roster is absent. */
function notFound(subagent: string): WireError {
  return {
    code: 'subagent-preset-not-found',
    message: 'this deployment composes no user-defined subagents',
    details: { subagent, available: [] },
  }
}

/** Map one authoring/roster failure onto the withdrawn domain's wire codes. */
function subagentFailure(subagent: string, error: unknown): WireError {
  if (error instanceof UnknownSubagentError) {
    return {
      code: 'subagent-preset-not-found',
      message: error.message,
      details: { subagent: error.subagentId, available: [...error.available] },
    }
  }
  if (error instanceof SubagentNotWritableError) {
    return {
      code: 'subagent-preset-read-only',
      message: error.message,
      details: { subagent, reason: error.message },
    }
  }
  return { code: 'internal', message: `subagent "${subagent}": ${String(error)}`, details: {} }
}
