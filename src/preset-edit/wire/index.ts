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
 * @module dsh-harness-subagent-bundle/preset-edit/wire
 */

import { isAbsolute, join } from 'node:path'
import { rm } from 'node:fs/promises'
import { z } from 'zod'
import type { Context } from '@deepseek-ai/cordis'
import { writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'
import {
  PresetNotWritableError, UnknownPresetError,
  type AgentPresets,
} from '@deepseek-ai/dsh-agent-presets'
import {
  METADATA_FILE, readPresetMetadata, renderPresetMetadata, writableRoot,
  type PresetMetadata,
} from '@deepseek-ai/dsh-agent-presets'
import type { ConnectionRpcAuthority } from '@deepseek-ai/dsh-client-connection'
import type { RpcError, RpcResult } from '@deepseek-ai/dsh-host-apiproxy/api'
import {
  applyEdits, discoverToolPackages, InvalidPresetEditsError, readEditableFields,
  type DelegationKey, type PresetCompositionEdits,
} from '../edit.ts'
import {
  wireEndpoints, type WireEndpointName,
} from './schema.ts'

/** Absolute logical channel owning the agent-preset editing endpoints. */
export const AGENT_PRESET_EDIT_CHANNEL = '/agent-preset-edit'

/** Loopback-pinned authority: editing preset files is privileged. */
const AUTHORITY: ConnectionRpcAuthority = 'loopback'

/** One endpoint's request payload, narrowed to its validated schema. */
type EndpointPayload<N extends WireEndpointName> = z.infer<typeof wireEndpoints[N]['request']>

/** The `agentPresets` service the wire needs from the host context. */
type AgentPresetsService = AgentPresets

/**
 * Parse and dispatch one endpoint against the agent-preset registry.
 * @param registry - the `agentPresets` service (the deployment may compose none).
 * @param endpoint - the channel-relative endpoint name.
 * @param payload - the unvalidated request payload.
 * @param signal - caller/connection lifetime.
 * @returns the validated result, or the matching failure.
 */
export async function dispatchAgentPresetEdit(
  registry: AgentPresetsService | undefined,
  endpoint: string,
  payload: unknown,
  signal: AbortSignal,
): Promise<RpcResult<unknown>> {
  try {
    switch (endpoint) {
      case 'readEditable':
        return await readEditable(registry, parse(wireEndpoints.readEditable.request, payload), signal)
      case 'update':
        return await update(registry, parse(wireEndpoints.update.request, payload), signal)
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
      message: `agent-preset-edit handler failure: ${error instanceof Error ? error.message : String(error)}`,
      details: {},
    })
  }
}

/**
 * Register the `/agent-preset-edit` channel once the connection service
 * becomes available. Called by the profile bundle that composes a web
 * deployment — the channel must ride alongside the `agentPresets` service it
 * reads, but the official service itself stays zero-invasive.
 * @param ctx - the host plugin context.
 */
export function registerAgentPresetEditWire(ctx: Context): void {
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
        AGENT_PRESET_EDIT_CHANNEL,
        (endpoint, payload, signal) =>
          dispatchAgentPresetEdit(ctx.get('agentPresets'), endpoint, payload, signal),
        { authority: AUTHORITY },
      ),
      'dsh-preset-edit: /agent-preset-edit rpc channel',
    )
  }
  tryRegister()
  ctx.on('internal/service', (name) => {
    if (name === 'connection') tryRegister()
  })
}

/**
 * Cordis plugin body for the `/agent-preset-edit` channel. Mounted as a host
 * row in the profile bundle alongside the `agentPresets` service, this
 * registers the editing wire without touching the official service package.
 * @param ctx - the host plugin context.
 */
export function apply(ctx: Context): void {
  registerAgentPresetEditWire(ctx)
}

/**
 * Read the editable fields one preset's form may seed from.
 *
 * Only `user` presets are editable — a shipped one has no fields to offer — so
 * the answer is empty rather than a refusal for trust the caller is not
 * allowed to edit anyway, exactly as the withdrawn `agentPreset.readEditable`
 * answered. The preset's display metadata rides through so the form seeds its
 * name and description alongside the composition fields.
 */
async function readEditable(
  registry: AgentPresetsService | undefined,
  request: EndpointPayload<'readEditable'>,
  signal: AbortSignal,
): Promise<RpcResult<unknown>> {
  if (registry === undefined) return fail(noRoster(request.agentPreset))
  try {
    const preset = await registry.resolve(request.agentPreset)
    signal.throwIfAborted()
    if (preset.trust !== 'user') {
      return ok({
        agentPreset: preset.id,
        delegation: [],
        tools: [],
        catalog: [],
        ...preset.name === undefined ? {} : { name: preset.name },
        ...preset.description === undefined ? {} : { description: preset.description },
      })
    }
    const fields = readEditableFields(await registry.read(preset.id), discoverToolPackages())
    return ok({
      agentPreset: preset.id,
      ...fields.persona === undefined ? {} : { persona: fields.persona },
      delegation: fields.delegation,
      tools: fields.tools,
      catalog: fields.catalog,
      ...preset.name === undefined ? {} : { name: preset.name },
      ...preset.description === undefined ? {} : { description: preset.description },
    })
  } catch (error) {
    return fail(presetFailure(request.agentPreset, error))
  }
}

/**
 * Rewrite one preset's editable fields.
 *
 * Only fields the request names change. The composition is edited line-scoped
 * through {@link applyEdits}, so comments, sibling rows, other plugin rows,
 * the file's ordering, and `!!js` expressions survive byte-for-byte, and the
 * edited composition is validated with the loader's own schema before it is
 * written. The display metadata keeps any field the request did not name;
 * clearing every named metadata field removes `preset.yml`. A shipped preset
 * is refused, exactly like the withdrawn `update` and like `remove`.
 */
async function update(
  registry: AgentPresetsService | undefined,
  request: EndpointPayload<'update'>,
  signal: AbortSignal,
): Promise<RpcResult<unknown>> {
  if (registry === undefined) return fail(noRoster(request.agentPreset))
  try {
    const { agentPreset, persona, delegation, tools, installTools, removeTools, metadata } = request
    const preset = await registry.resolve(agentPreset)
    signal.throwIfAborted()
    if (preset.trust !== 'user') {
      return fail({
        code: 'agent-preset-read-only',
        message: `agent preset "${agentPreset}" ships with the deployment`,
        details: { agentPreset, reason: 'it ships with the deployment' },
      })
    }
    // The path containment check mirrors the withdrawn authoring write: a
    // preset the service resolved must also live under the writable root
    // before its files are touched. Trust alone is not enough — a preset id
    // colliding with a path outside the root would otherwise be rewritten.
    const dir = join(writableRoot(registry.roots), preset.id)
    if (!isAbsolute(preset.path) || !preset.path.startsWith(dir)) {
      return fail({
        code: 'agent-preset-read-only',
        message: `agent preset "${agentPreset}" does not live under the writable preset root`,
        details: { agentPreset, reason: 'it does not live under the writable preset root' },
      })
    }
    const compositionEdits: PresetCompositionEdits = {
      ...persona === undefined ? {} : { persona },
      ...delegation !== undefined && Object.keys(delegation).length > 0
        ? { delegation: delegation as Readonly<Record<string, Partial<Record<DelegationKey, unknown>>>> }
        : {},
      ...tools !== undefined && Object.keys(tools).length > 0
        ? { tools: tools as Readonly<Record<string, { disabled: boolean }>> }
        : {},
      ...installTools !== undefined && installTools.length > 0
        ? { installTools }
        : {},
      ...removeTools !== undefined && removeTools.length > 0
        ? { removeTools }
        : {},
    }
    if (
      compositionEdits.persona !== undefined
      || compositionEdits.delegation !== undefined
      || compositionEdits.tools !== undefined
      || compositionEdits.installTools !== undefined
      || compositionEdits.removeTools !== undefined
    ) {
      const content = await registry.read(preset.id)
      signal.throwIfAborted()
      const edited = applyEdits(content, compositionEdits, preset.id)
      await writeFileAtomic(preset.path, edited, { mode: 0o600, dirMode: 0o700 })
    }
    if (metadata !== undefined) {
      signal.throwIfAborted()
      const current = await readPresetMetadata(dir)
      const merged: PresetMetadata = {
        ...current.order === undefined ? {} : { order: current.order },
        ...metadata.name === undefined ? {} : { name: metadata.name },
        ...metadata.description === undefined ? {} : { description: metadata.description },
      }
      const rendered = renderPresetMetadata(merged)
      const metadataPath = join(dir, METADATA_FILE)
      if (rendered === undefined) {
        await rm(metadataPath, { force: true })
      } else {
        await writeFileAtomic(metadataPath, rendered, { mode: 0o600, dirMode: 0o700 })
      }
    }
    return ok({ agentPreset })
  } catch (error) {
    return fail(presetFailure(request.agentPreset, error))
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
 * apiproxy closed `RpcError` union so the withdrawn `agent-preset-*` codes
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
    message: `agent-preset-edit channel does not serve endpoint "${endpoint}"`,
    details: { issues: [] },
  }
}

/** The withdrawn domain's no-roster shape when no registry is composed. */
function noRoster(agentPreset: string): WireError {
  return {
    code: 'agent-preset-not-found',
    message: 'this deployment composes no user-defined agent presets',
    details: { agentPreset, available: [] },
  }
}

/** Map one authoring failure onto the withdrawn domain's wire codes. */
function presetFailure(agentPreset: string, error: unknown): WireError {
  if (error instanceof InvalidPresetEditsError) {
    return {
      code: 'agent-preset-invalid',
      message: error.message,
      details: { agentPreset, reason: error.reason },
    }
  }
  if (error instanceof UnknownPresetError) {
    return {
      code: 'agent-preset-not-found',
      message: error.message,
      details: { agentPreset, available: [...error.available] },
    }
  }
  if (error instanceof PresetNotWritableError) {
    return {
      code: 'agent-preset-read-only',
      message: error.message,
      details: { agentPreset, reason: error.message },
    }
  }
  return { code: 'internal', message: `agent preset "${agentPreset}": ${String(error)}`, details: {} }
}
