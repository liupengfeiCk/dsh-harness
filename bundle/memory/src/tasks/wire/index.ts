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

import type { Context } from '@deepseek-ai/cordis'
import { z } from 'zod'
import type { ConnectionRpcAuthority } from '@deepseek-ai/dsh-client-connection'
import type { RpcError, RpcResult } from '@deepseek-ai/dsh-host-apiproxy/api'
import type { Tasks } from '../index.ts'
import { InvalidTaskInputError, UnknownTaskError } from '../types.ts'
import { wireEndpoints, type WireEndpointName } from './schema.ts'

/** Absolute logical channel owning the task-management endpoints. */
export const TASK_WIRE_CHANNEL = '/memory-task'

/** Loopback-pinned authority: managing tasks is privileged. */
const AUTHORITY: ConnectionRpcAuthority = 'loopback'

/** One endpoint's request payload, narrowed to its validated schema. */
type EndpointPayload<N extends WireEndpointName> = z.infer<typeof wireEndpoints[N]['request']>

/**
 * Parse and dispatch one endpoint against the task registry.
 * @param tasks - the task registry service (the deployment may compose none).
 * @param endpoint - the channel-relative endpoint name.
 * @param payload - the unvalidated request payload.
 * @param signal - caller/connection lifetime.
 * @returns the validated result, or the matching failure.
 */
export async function dispatchTask(
  tasks: Tasks | undefined,
  endpoint: string,
  payload: unknown,
  signal: AbortSignal,
): Promise<RpcResult<unknown>> {
  // All endpoints are single-round-trip registry calls; the connection signal
  // is deliberately unused (kept for the shared rpc-handle signature).
  void signal
  try {
    switch (endpoint) {
      case 'list':
        return await list(tasks, parse(wireEndpoints.list.request, payload))
      case 'read':
        return await read(tasks, parse(wireEndpoints.read.request, payload))
      case 'create':
        return await create(tasks, parse(wireEndpoints.create.request, payload))
      case 'update':
        return await update(tasks, parse(wireEndpoints.update.request, payload))
      case 'complete':
        return await complete(tasks, parse(wireEndpoints.complete.request, payload))
      case 'attachSession':
        return await attachSession(tasks, parse(wireEndpoints.attachSession.request, payload))
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
      message: `memory-task handler failure: ${error instanceof Error ? error.message : String(error)}`,
      details: {},
    })
  }
}

/**
 * Register the `/memory-task` channel once the connection service becomes
 * available.
 * @param ctx - the host plugin context.
 */
export function registerTaskWire(ctx: Context): void {
  ctx.inject(['connection'], (connectionCtx) => {
    const connection = connectionCtx.connection
    connectionCtx.effect(
      () => connection.rpc.handle(
        TASK_WIRE_CHANNEL,
        (endpoint, payload, signal) =>
          dispatchTask(connectionCtx.get('tasks'), endpoint, payload, signal),
        { authority: AUTHORITY },
      ),
      'dsh-memory-tasks: /memory-task rpc channel',
    )
  })
}

/**
 * Cordis plugin body for the `/memory-task` channel. Mounted as a host row in
 * the memory bundle's `cordis.patch.yml` (`memory-task-wire`).
 * @param ctx - the host plugin context.
 */
export function apply(ctx: Context): void {
  registerTaskWire(ctx)
}

/** A deployment with no task registry answers an empty roster, not an error. */
async function list(
  tasks: Tasks | undefined,
  request: EndpointPayload<'list'>,
): Promise<RpcResult<unknown>> {
  const roster = tasks === undefined
    ? []
    : request.includeCompleted === undefined
      ? tasks.list()
      : tasks.list({ includeCompleted: request.includeCompleted })
  return ok({ tasks: roster.map(taskEntry) })
}

async function read(
  tasks: Tasks | undefined,
  request: EndpointPayload<'read'>,
): Promise<RpcResult<unknown>> {
  if (tasks === undefined) return fail(noTasks(request.id))
  try {
    return ok({ task: taskEntry(tasks.read(request.id)) })
  } catch (error) {
    return fail(taskFailure(request.id, error))
  }
}

async function create(
  tasks: Tasks | undefined,
  request: EndpointPayload<'create'>,
): Promise<RpcResult<unknown>> {
  if (tasks === undefined) return fail(noTasks(request.title))
  try {
    const task = tasks.create({
      title: request.title,
      goal: request.goal,
      ...request.roles === undefined ? {} : { roles: request.roles },
    })
    return ok({ task: taskEntry(task) })
  } catch (error) {
    return fail(taskFailure(request.title, error))
  }
}

async function update(
  tasks: Tasks | undefined,
  request: EndpointPayload<'update'>,
): Promise<RpcResult<unknown>> {
  if (tasks === undefined) return fail(noTasks(request.id))
  try {
    const task = tasks.update(request.id, {
      ...request.title === undefined ? {} : { title: request.title },
      ...request.goal === undefined ? {} : { goal: request.goal },
      ...request.roles === undefined ? {} : { roles: request.roles },
    })
    return ok({ task: taskEntry(task) })
  } catch (error) {
    return fail(taskFailure(request.id, error))
  }
}

async function complete(
  tasks: Tasks | undefined,
  request: EndpointPayload<'complete'>,
): Promise<RpcResult<unknown>> {
  if (tasks === undefined) return fail(noTasks(request.id))
  try {
    const task = tasks.complete(request.id)
    return ok({ task: taskEntry(task) })
  } catch (error) {
    return fail(taskFailure(request.id, error))
  }
}

async function attachSession(
  tasks: Tasks | undefined,
  request: EndpointPayload<'attachSession'>,
): Promise<RpcResult<unknown>> {
  if (tasks === undefined) return fail(noTasks(request.taskId))
  try {
    const task = tasks.attachSession(
      request.taskId,
      request.sessionId,
      request.roleId,
      request.kind ?? 'session',
    )
    return ok({ task: taskEntry(task) })
  } catch (error) {
    return fail(taskFailure(request.taskId, error))
  }
}

/** One task's roster/detail entry on the wire. */
function taskEntry(task: {
  readonly id: string
  readonly title: string
  readonly goal: string
  readonly status: string
  readonly roles: readonly unknown[]
  readonly createdAt: string
  readonly completedAt: string | null
  readonly sessions: readonly unknown[]
}): Record<string, unknown> {
  return {
    id: task.id,
    title: task.title,
    goal: task.goal,
    status: task.status,
    roles: task.roles,
    createdAt: task.createdAt,
    completedAt: task.completedAt,
    sessions: task.sessions,
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

/** The wire's own failure vocabulary, kept local to the apiproxy's closed union. */
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
    message: `memory-task channel does not serve endpoint "${endpoint}"`,
    details: { issues: [] },
  }
}

/** The not-found shape when no task registry is composed. */
function noTasks(id: string): WireError {
  return {
    code: 'memory-task-not-found',
    message: 'this deployment composes no task registry',
    details: { task: id, available: [] },
  }
}

/** Map one registry failure onto the wire codes. */
function taskFailure(task: string, error: unknown): WireError {
  if (error instanceof UnknownTaskError) {
    return {
      code: 'memory-task-not-found',
      message: error.message,
      details: { task: error.taskId, available: [...error.available] },
    }
  }
  if (error instanceof InvalidTaskInputError) {
    return {
      code: 'memory-task-invalid',
      message: error.message,
      details: { task, reason: error.message },
    }
  }
  return { code: 'internal', message: `task "${task}": ${String(error)}`, details: {} }
}
