/**
 * Task-entity management wire schemas and contracts.
 *
 * These are the request/response shapes the `/memory-task` wire channel
 * carries, mirroring the team-management wire in the subagent bundle and the
 * `/model-plan` wire in the model-plan bundle. Endpoint names mirror the
 * management surface (list/read/create/update/complete/attachSession) and the
 * value types mirror the task registry's own vocabulary (`Task`, `TaskRole`,
 * `TaskStatus`).
 *
 * The wire uses the same success/error result shape as the apiproxy RPC layer:
 * `{ ok: true, value }` or `{ ok: false, error }`. Error codes mirror the task
 * registry's failure vocabulary.
 * @module dsh-harness-memory-bundle/tasks/wire
 */

import { z } from 'zod'
import type { RpcResult } from '@deepseek-ai/dsh-host-apiproxy/api'

/** Success/failure wire result for one management call. */
export type WireResult<T> = RpcResult<T>

/** A task's lifecycle on the wire, mirroring `TaskStatus`. */
export const wireTaskStatusSchema = z.union([z.literal('running'), z.literal('completed')])

/** One responsible role plus its division, mirroring `TaskRole`. */
export const wireTaskRoleSchema = z.object({
  roleId: z.string().min(1),
  division: z.string().min(1),
})

/** How a session came to be associated, mirroring `TaskSessionKind`. */
export const wireTaskSessionKindSchema = z.union([z.literal('session'), z.literal('delegation')])

/** One session association on a task. */
export const wireTaskSessionSchema = z.object({
  sessionId: z.string().min(1),
  roleId: z.string().optional(),
  kind: wireTaskSessionKindSchema,
  attachedAt: z.string(),
})

/** One task roster/detail row. */
export const wireTaskEntrySchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  goal: z.string(),
  status: wireTaskStatusSchema,
  roles: z.array(wireTaskRoleSchema),
  createdAt: z.string(),
  completedAt: z.string().nullable(),
  sessions: z.array(wireTaskSessionSchema),
})

/** task.list request: an optional flag to surface completed tasks explicitly. */
export const wireListRequestSchema = z.object({
  includeCompleted: z.boolean().optional(),
})

/** task.list response value. */
export const wireListValueSchema = z.object({
  tasks: z.array(wireTaskEntrySchema),
})

/** task.read request. */
export const wireReadRequestSchema = z.object({
  id: z.string().min(1),
})

/** task.read response value. */
export const wireReadValueSchema = z.object({
  task: wireTaskEntrySchema,
})

/** task.create request: title, goal, optional responsible roles. */
export const wireCreateRequestSchema = z.object({
  title: z.string().min(1),
  goal: z.string().min(1),
  roles: z.array(wireTaskRoleSchema).optional(),
})

/** task.create response value. */
export const wireCreateValueSchema = z.object({
  task: wireTaskEntrySchema,
})

/** task.update request: any subset of the mutable fields. */
export const wireUpdateRequestSchema = z.object({
  id: z.string().min(1),
  title: z.string().optional(),
  goal: z.string().optional(),
  roles: z.array(wireTaskRoleSchema).optional(),
})

/** task.update response value. */
export const wireUpdateValueSchema = z.object({
  task: wireTaskEntrySchema,
})

/** task.complete request. */
export const wireCompleteRequestSchema = z.object({
  id: z.string().min(1),
})

/** task.complete response value. */
export const wireCompleteValueSchema = z.object({
  task: wireTaskEntrySchema,
})

/** task.attachSession request: associate a session with a task. */
export const wireAttachSessionRequestSchema = z.object({
  taskId: z.string().min(1),
  sessionId: z.string().min(1),
  roleId: z.string().optional(),
  kind: wireTaskSessionKindSchema.optional(),
})

/** task.attachSession response value. */
export const wireAttachSessionValueSchema = z.object({
  task: wireTaskEntrySchema,
})

/** The full management surface: endpoint name → request/value schemas. */
export const wireEndpoints = {
  list: { request: wireListRequestSchema, value: wireListValueSchema },
  read: { request: wireReadRequestSchema, value: wireReadValueSchema },
  create: { request: wireCreateRequestSchema, value: wireCreateValueSchema },
  update: { request: wireUpdateRequestSchema, value: wireUpdateValueSchema },
  complete: { request: wireCompleteRequestSchema, value: wireCompleteValueSchema },
  attachSession: { request: wireAttachSessionRequestSchema, value: wireAttachSessionValueSchema },
} as const

/** One endpoint name the wire channel serves. */
export type WireEndpointName = keyof typeof wireEndpoints
