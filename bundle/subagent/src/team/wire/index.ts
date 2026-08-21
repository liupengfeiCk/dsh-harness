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

import type { Context } from '@deepseek-ai/cordis'
import { dirname } from 'node:path'
import { z } from 'zod'
import type { ConnectionRpcAuthority } from '@deepseek-ai/dsh-client-connection'
import type { RpcError, RpcResult } from '@deepseek-ai/dsh-host-apiproxy/api'
import type { SubagentPresets } from '../../preset/index.ts'
import {
  InvalidTeamIdError, TeamExistsError, TeamNotWritableError, TeamRoleInvalidError,
  type Teams, type TeamRole,
} from '../index.ts'
import { ROLE_LEVEL_DEFAULT, UnknownTeamError } from '../types.ts'
import { canOpenDirectory, openDirectory } from '../../preset/wire/opener.ts'
import { wireEndpoints, type WireEndpointName } from './schema.ts'

/** Absolute logical channel owning the team-management endpoints. */
export const TEAM_PRESET_CHANNEL = '/team-preset'

/** Loopback-pinned authority: managing the roster is privileged. */
const AUTHORITY: ConnectionRpcAuthority = 'loopback'

/** One endpoint's request payload, narrowed to its validated schema. */
type EndpointPayload<N extends WireEndpointName> = z.infer<typeof wireEndpoints[N]['request']>

/** A role staged by the form, narrowed to the wire's create/update shape. */
type StagedRole = EndpointPayload<'create'>['roles'][number]

/**
 * Parse and dispatch one endpoint against the team registry.
 * @param teams - the team registry service (the deployment may compose none).
 * @param subagents - the subagent registry, for the role subagents' available
 * ids (the deployment may compose none; subagents then read empty).
 * @param endpoint - the channel-relative endpoint name.
 * @param payload - the unvalidated request payload.
 * @param signal - caller/connection lifetime.
 * @returns the validated result, or the matching failure.
 */
export async function dispatchTeamPreset(
  teams: Teams | undefined,
  subagents: SubagentPresets | undefined,
  endpoint: string,
  payload: unknown,
  signal: AbortSignal,
): Promise<RpcResult<unknown>> {
  try {
    switch (endpoint) {
      case 'list':
        return await list(teams, subagents)
      case 'read':
        return await read(teams, parse(wireEndpoints.read.request, payload))
      case 'create':
        return await create(teams, parse(wireEndpoints.create.request, payload))
      case 'update':
        return await update(teams, parse(wireEndpoints.update.request, payload))
      case 'remove':
        return await remove(teams, parse(wireEndpoints.remove.request, payload))
      case 'openLocation':
        return await openLocation(teams, parse(wireEndpoints.openLocation.request, payload), signal)
      case 'modeSelect':
        return await modeSelect(teams, parse(wireEndpoints.modeSelect.request, payload))
      case 'modeRead':
        return await modeRead(teams, parse(wireEndpoints.modeRead.request, payload))
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
      message: `team-preset handler failure: ${error instanceof Error ? error.message : String(error)}`,
      details: {},
    })
  }
}

/**
 * Register the `/team-preset` channel once the connection service becomes
 * available.
 * @param ctx - the host plugin context.
 */
export function registerTeamPresetWire(ctx: Context): void {
  ctx.inject(['connection'], (connectionCtx) => {
    const connection = connectionCtx.connection
    connectionCtx.effect(
      () => connection.rpc.handle(
        TEAM_PRESET_CHANNEL,
        (endpoint, payload, signal) =>
          dispatchTeamPreset(
            connectionCtx.get('teams'),
            connectionCtx.get('subagentPresets'),
            endpoint,
            payload,
            signal,
          ),
        { authority: AUTHORITY },
      ),
      'dsh-team-preset: /team-preset rpc channel',
    )
  })
}

/**
 * Cordis plugin body for the `/team-preset` channel. Mounted as a host row in
 * the profile's cordis.patch.yml, registering the wire without coupling it to
 * the team registry's constructor.
 * @param ctx - the host plugin context.
 */
export function apply(ctx: Context): void {
  registerTeamPresetWire(ctx)
}

/** A deployment with no team registry answers an empty roster, not an error. */
async function list(
  teams: Teams | undefined,
  subagents: SubagentPresets | undefined,
): Promise<RpcResult<unknown>> {
  if (teams === undefined) {
    return ok({ teams: [], authorable: false, hasDocument: canOpenDirectory(), subagents: [] })
  }
  const roster = await teams.list()
  return ok({
    teams: roster.map(team => ({
      id: team.id,
      trust: team.trust,
      metadata: team.metadata,
      roles: team.roles.map(role => ({
        id: role.id,
        level: role.level,
        ...role.broken === undefined ? {} : { broken: role.broken },
      })),
      ...team.broken === undefined ? {} : { broken: team.broken },
    })),
    authorable: teams.authorable,
    hasDocument: canOpenDirectory(),
    // The role subagents' available ids come from the subagent registry. An
    // absent registry reads an empty subagent list — no role can bind a
    // subagent, so the surface offers no picks.
    subagents: subagents === undefined ? [] : (await subagents.list()).map(subagent => subagent.id),
  })
}

async function read(
  teams: Teams | undefined,
  request: EndpointPayload<'read'>,
): Promise<RpcResult<unknown>> {
  if (teams === undefined) return fail(noRoster(request.id))
  try {
    const team = await teams.resolve(request.id)
    return ok({
      team: {
        id: team.id,
        trust: team.trust,
        metadata: team.metadata,
        roles: team.roles.map(role => ({
          id: role.id,
          ...role.description === undefined ? {} : { description: role.description },
          ...role.prompt === undefined ? {} : { prompt: role.prompt },
          subagent: role.subagent,
          level: role.level,
          memory: role.memory,
          inheritMainSummaries: role.inheritMainSummaries,
        })),
        ...team.broken === undefined ? {} : { broken: team.broken },
        // The config-hygiene advisory surfaces on the team detail so the UI
        // can read it, not just the host log.
        ...teams.hygieneWarning(team) === undefined ? {} : { warning: teams.hygieneWarning(team) },
      },
    })
  } catch (error) {
    return fail(teamFailure(request.id, error))
  }
}

async function create(
  teams: Teams | undefined,
  request: EndpointPayload<'create'>,
): Promise<RpcResult<unknown>> {
  if (teams === undefined) return fail(noRoster(request.id))
  try {
    await teams.create(
      request.id,
      {
        ...request.name === undefined ? {} : { name: request.name },
        ...request.description === undefined ? {} : { description: request.description },
      },
      request.roles.map(stagedRole),
    )
    return ok({ id: request.id })
  } catch (error) {
    return fail(teamFailure(request.id, error))
  }
}

async function update(
  teams: Teams | undefined,
  request: EndpointPayload<'update'>,
): Promise<RpcResult<unknown>> {
  if (teams === undefined) return fail(noRoster(request.id))
  try {
    const { id, metadata, roles } = request
    // An enabled-only metadata write is the row-level toggle (folded into
    // update, mirroring the subagent surface): it must keep the team's other
    // metadata and roster intact.
    const enabledOnly = metadata !== undefined
      && Object.keys(metadata).length === 1
      && 'enabled' in metadata
    if (enabledOnly) {
      await teams.setEnabled(id, metadata.enabled as boolean)
      return ok({ id })
    }
    const team = await teams.resolve(id)
    // A partial update keeps the untouched side: a metadata-only write (the
    // toggle, other than the enabled-only fast path) preserves the roster, and
    // a roles-only write preserves the stored metadata. `teams.update` is a
    // whole-file rewrite, so the caller composes the complete intended team.
    const nextRoles = roles === undefined ? team.roles : roles.map(stagedRole)
    const nextName = metadata?.name ?? team.metadata.name
    const nextDescription = metadata?.description ?? team.metadata.description
    const nextEnabled = metadata?.enabled ?? team.metadata.enabled
    await teams.update(
      id,
      {
        ...nextName === undefined ? {} : { name: nextName },
        ...nextDescription === undefined ? {} : { description: nextDescription },
        ...nextEnabled === undefined ? {} : { enabled: nextEnabled },
      },
      nextRoles,
    )
    return ok({ id })
  } catch (error) {
    return fail(teamFailure(request.id, error))
  }
}

async function remove(
  teams: Teams | undefined,
  request: EndpointPayload<'remove'>,
): Promise<RpcResult<unknown>> {
  if (teams === undefined) return fail(noRoster(request.id))
  try {
    await teams.remove(request.id)
    return ok({})
  } catch (error) {
    return fail(teamFailure(request.id, error))
  }
}

async function openLocation(
  teams: Teams | undefined,
  request: EndpointPayload<'openLocation'>,
  signal: AbortSignal,
): Promise<RpcResult<unknown>> {
  if (teams === undefined) return fail(noRoster(request.id))
  try {
    const team = await teams.resolve(request.id)
    // A shipped team's install is not the user's to manage; pointing an editor
    // into it invites edits an upgrade will silently overwrite.
    if (team.trust !== 'user') {
      throw new TeamNotWritableError(team.id, 'it ships with the deployment')
    }
    const directory = dirname(team.path)
    if (!canOpenDirectory()) return ok({ opened: false as const, path: directory })
    await openDirectory(directory, signal)
    return ok({ opened: true as const })
  } catch (error) {
    if (error instanceof TeamNotWritableError) return fail(teamFailure(request.id, error))
    return fail({
      code: 'internal',
      message: `team "${request.id}" location open failed: ${error instanceof Error ? error.message : String(error)}`,
      details: {},
    })
  }
}

async function modeSelect(
  teams: Teams | undefined,
  request: EndpointPayload<'modeSelect'>,
): Promise<RpcResult<unknown>> {
  if (teams === undefined) return fail(noRoster(''))
  try {
    await teams.selectMode(request.sessionId as never, request.mode, request.team)
    const state = await teams.readMode(request.sessionId as never)
    return ok({
      ...state.mode === 'team' && state.team !== undefined ? { mode: state.mode, team: state.team } : { mode: state.mode },
    })
  } catch (error) {
    return fail(modeFailure(request.sessionId, error))
  }
}

async function modeRead(
  teams: Teams | undefined,
  request: EndpointPayload<'modeRead'>,
): Promise<RpcResult<unknown>> {
  if (teams === undefined) return fail(noRoster(request.sessionId))
  try {
    const state = await teams.readMode(request.sessionId as never)
    return ok({
      ...state.mode === 'team' && state.team !== undefined ? { mode: state.mode, team: state.team } : { mode: state.mode },
    })
  } catch (error) {
    return fail(modeFailure(request.sessionId, error))
  }
}

/** Map one staged role onto the registry's `TeamRole` vocabulary. */
function stagedRole(role: StagedRole): TeamRole {
  return {
    id: role.id,
    ...role.description === undefined ? {} : { description: role.description },
    ...role.prompt === undefined ? {} : { prompt: role.prompt },
    subagent: role.subagent,
    // A staged role without an explicit level falls back to the default; the
    // registry refuses levels below 1 (redundant with the schema but kept so
    // the guard survives even a non-schema caller).
    level: role.level === undefined ? ROLE_LEVEL_DEFAULT : role.level,
    memory: role.memory,
    // T12: omitted on the wire means the default (inherit). Older clients that
    // never send the field keep inheriting; an explicit `false` opts out.
    inheritMainSummaries: role.inheritMainSummaries !== false,
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
 * apiproxy closed `RpcError` union so the team codes can survive with their
 * semantics intact; the result is cast to the carrier's `RpcResult` shape at
 * the boundary.
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
    message: `team-preset channel does not serve endpoint "${endpoint}"`,
    details: { issues: [] },
  }
}

/** The not-found shape when no team registry is composed. */
function noRoster(id: string): WireError {
  return {
    code: 'team-preset-not-found',
    message: 'this deployment composes no user-defined teams',
    details: { team: id, available: [] },
  }
}

/** Map one authoring/roster failure onto the wire codes. */
function teamFailure(team: string, error: unknown): WireError {
  if (error instanceof UnknownTeamError) {
    return {
      code: 'team-preset-not-found',
      message: error.message,
      details: { team: error.teamId, available: [...error.available] },
    }
  }
  if (error instanceof TeamNotWritableError) {
    return {
      code: 'team-preset-read-only',
      message: error.message,
      details: { team, reason: error.message },
    }
  }
  if (error instanceof InvalidTeamIdError) {
    return {
      code: 'team-preset-invalid',
      message: error.message,
      details: { team, reason: error.message },
    }
  }
  if (error instanceof TeamExistsError) {
    return {
      code: 'team-preset-exists',
      message: error.message,
      details: { team, reason: error.message },
    }
  }
  if (error instanceof TeamRoleInvalidError) {
    return {
      code: 'team-preset-invalid',
      message: error.message,
      details: { team, role: error.roleId, reason: error.message },
    }
  }
  return { code: 'internal', message: `team "${team}": ${String(error)}`, details: {} }
}

/** Map one mode-selection failure onto the wire vocabulary. */
function modeFailure(sessionId: string, error: unknown): WireError {
  if (error instanceof UnknownTeamError) {
    return {
      code: 'team-preset-not-found',
      message: error.message,
      details: { team: error.teamId, available: [...error.available] },
    }
  }
  const message = error instanceof Error ? error.message : String(error)
  // A started session cannot change surface — the same blank-window lock the
  // agent preset carries.
  if (message.includes('has already started')) {
    return {
      code: 'team-mode-locked',
      message,
      details: { sessionId },
    }
  }
  return { code: 'internal', message: `session "${sessionId}": ${message}`, details: { sessionId } }
}
