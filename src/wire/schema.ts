/**
 * Model-plan management wire schemas and contracts.
 *
 * These are the request/response shapes the `/model-plan` wire channel carries,
 * mirroring the team-management wire in the subagent bundle
 * (`team/wire/schema`). Names mirror the management surface
 * (list/read/create/update/remove/select/readSelection) and the value types
 * mirror the plan registry's own vocabulary (`ModelPlan`, `PlanParams`,
 * `PlanTrust`) so a new field needs no per-field assembly on this seam.
 *
 * The wire uses the same success/error result shape as the apiproxy RPC layer:
 * `{ ok: true, value }` or `{ ok: false, error }`. The error codes mirror the
 * plan registry's failure vocabulary.
 * @module dsh-harness-model-plan-bundle/wire
 */

import { z } from 'zod'
import type { RpcResult } from '@deepseek-ai/dsh-host-apiproxy/api'

/** Success/failure wire result for one management call. */
export type WireResult<T> = RpcResult<T>

/** A JSON value carried by the params bag on the wire. */
const jsonValueSchema: z.ZodType<unknown> = z.lazy(() => z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
  z.array(jsonValueSchema),
  z.record(z.string(), jsonValueSchema),
]))

/**
 * A bag of arbitrary key=value plan params on the wire. Carried as a plain
 * record of JSON values; callers narrow it to `PlanParams` (string keys) at
 * the dispatch boundary.
 */
export const wireParamsSchema = z.record(z.string(), jsonValueSchema)

/** A plan's trust on the wire, mirroring `PlanTrust`. */
export const wireTrustSchema = z.union([z.literal('system'), z.literal('user')])

/** One plan roster row. */
export const wirePlanEntrySchema = z.object({
  id: z.string().min(1),
  name: z.string().optional(),
  provider: z.string(),
  model: z.string(),
  params: wireParamsSchema,
  trust: wireTrustSchema,
  isDefault: z.boolean(),
  broken: z.string().optional(),
})

/** modelPlan.list request payload (no fields). */
export const wireListRequestSchema = z.object({})

/** modelPlan.list response value. */
export const wireListValueSchema = z.object({
  plans: z.array(wirePlanEntrySchema),
  authorable: z.boolean(),
})

/** modelPlan.read request payload. */
export const wireReadRequestSchema = z.object({
  id: z.string().min(1),
})

/** modelPlan.read response value. */
export const wireReadValueSchema = z.object({
  plan: wirePlanEntrySchema,
})

/** modelPlan.create request payload: a new id plus its initial fields. */
export const wireCreateRequestSchema = z.object({
  id: z.string().min(1),
  name: z.string().optional(),
  provider: z.string(),
  model: z.string(),
  params: wireParamsSchema.optional(),
  default: z.boolean().optional(),
})

/** modelPlan.create response value. */
export const wireCreateValueSchema = z.object({
  id: z.string(),
})

/** modelPlan.update request payload: any subset of the plan's fields. */
export const wireUpdateRequestSchema = z.object({
  id: z.string().min(1),
  name: z.string().optional(),
  provider: z.string().optional(),
  model: z.string().optional(),
  params: wireParamsSchema.optional(),
  default: z.boolean().optional(),
})

/** modelPlan.update response value. */
export const wireUpdateValueSchema = z.object({
  id: z.string(),
})

/** modelPlan.remove request payload. */
export const wireRemoveRequestSchema = z.object({
  id: z.string().min(1),
})

/** modelPlan.remove response value (empty). */
export const wireRemoveValueSchema = z.object({})

/** modelPlan.select request payload: the session to bind, the plan, and an optional session overrides bag. */
export const wireSelectRequestSchema = z.object({
  sessionId: z.string().min(1),
  planId: z.string().min(1),
  /** Session-level temporary params riding above the plan's own params. */
  overrides: wireParamsSchema.optional(),
})

/** modelPlan.select response value: the folded selection now active. */
export const wireSelectValueSchema = z.object({
  planId: z.string(),
  overrides: wireParamsSchema,
})

/** modelPlan.readSelection request payload. */
export const wireReadSelectionRequestSchema = z.object({
  sessionId: z.string().min(1),
})

/** modelPlan.readSelection response value: the session's current folded selection. */
export const wireReadSelectionValueSchema = z.object({
  planId: z.string().optional(),
  overrides: wireParamsSchema,
})

/** The full management surface: endpoint name → request/value schemas. */
export const wireEndpoints = {
  list: { request: wireListRequestSchema, value: wireListValueSchema },
  read: { request: wireReadRequestSchema, value: wireReadValueSchema },
  create: { request: wireCreateRequestSchema, value: wireCreateValueSchema },
  update: { request: wireUpdateRequestSchema, value: wireUpdateValueSchema },
  remove: { request: wireRemoveRequestSchema, value: wireRemoveValueSchema },
  select: { request: wireSelectRequestSchema, value: wireSelectValueSchema },
  readSelection: { request: wireReadSelectionRequestSchema, value: wireReadSelectionValueSchema },
} as const

/** One endpoint name the wire channel serves. */
export type WireEndpointName = keyof typeof wireEndpoints
