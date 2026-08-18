/**
 * Team-management wire schemas and contracts.
 *
 * These are the request/response shapes the `/team-preset` wire channel
 * carries, mirroring the subagent-management wire in `../preset/wire/schema`.
 * Names mirror the management surface (list/read/create/update/remove/
 * openLocation) and the value types mirror the team registry's own vocabulary
 * (`Team`, `TeamRole`, `TeamMetadata`) so a new field needs no per-field
 * assembly on this seam.
 *
 * The wire uses the same success/error result shape as the apiproxy RPC layer:
 * `{ ok: true, value }` or `{ ok: false, error }`. The error codes mirror the
 * team registry's failure vocabulary.
 * @module dsh-harness-subagent-bundle/team/wire
 */

import { z } from 'zod'
import type { RpcResult } from '@deepseek-ai/dsh-host-apiproxy/api'

/** Success/failure wire result for one management call. */
export type WireResult<T> = RpcResult<T>

/** A role's memory policy on the wire, mirroring `TeamRoleMemory`. */
export const wireRoleMemorySchema = z.union([z.literal('one-shot'), z.literal('persistent')])

/** One role of a team, as carried on read (full) and update/create (staged). */
export const wireRoleSchema = z.object({
  id: z.string().min(1),
  description: z.string().optional(),
  prompt: z.string().optional(),
  subagent: z.string().min(1),
  memory: wireRoleMemorySchema,
})

/** A role summary on the roster: enough to render the row and its count. */
export const wireRoleSummarySchema = z.object({
  id: z.string().min(1),
  broken: z.string().optional(),
})

/** Display metadata a team may publish (name/description/enabled). */
export const wireTeamMetadataSchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  enabled: z.boolean().optional(),
})

/** One team roster row. */
export const wireTeamEntrySchema = z.object({
  id: z.string().min(1),
  trust: z.union([z.literal('system'), z.literal('user')]),
  metadata: wireTeamMetadataSchema,
  roles: z.array(wireRoleSummarySchema),
  broken: z.string().optional(),
})

/** One fully-read team (full role definitions). */
export const wireTeamDetailSchema = z.object({
  id: z.string().min(1),
  trust: z.union([z.literal('system'), z.literal('user')]),
  metadata: wireTeamMetadataSchema,
  roles: z.array(wireRoleSchema),
  broken: z.string().optional(),
})

/** teamPreset.list request payload (no fields). */
export const wireListRequestSchema = z.object({})

/** teamPreset.list response value. */
export const wireListValueSchema = z.object({
  teams: z.array(wireTeamEntrySchema),
  authorable: z.boolean(),
  hasDocument: z.boolean(),
  /** The subagent ids a role's "subagent" may select from (the delegation surface). */
  subagents: z.array(z.string()),
})

/** teamPreset.read request payload. */
export const wireReadRequestSchema = z.object({
  id: z.string().min(1),
})

/** teamPreset.read response value. */
export const wireReadValueSchema = z.object({
  team: wireTeamDetailSchema,
})

/** One staged role for create/update, with an optional subagent pick. */
export const wireStagedRoleSchema = z.object({
  id: z.string().min(1),
  description: z.string().optional(),
  prompt: z.string().optional(),
  subagent: z.string().min(1),
  memory: wireRoleMemorySchema,
})

/** teamPreset.create request payload: a new id plus its initial roster. */
export const wireCreateRequestSchema = z.object({
  id: z.string().min(1),
  name: z.string().optional(),
  description: z.string().optional(),
  roles: z.array(wireStagedRoleSchema),
})

/** teamPreset.create response value. */
export const wireCreateValueSchema = z.object({
  id: z.string(),
})

/** teamPreset.update request payload: metadata and/or a whole-role rewrite. */
export const wireUpdateRequestSchema = z.object({
  id: z.string().min(1),
  metadata: wireTeamMetadataSchema.optional(),
  roles: z.array(wireStagedRoleSchema).optional(),
})

/** teamPreset.update response value. */
export const wireUpdateValueSchema = z.object({
  id: z.string(),
})

/** teamPreset.remove request payload. */
export const wireRemoveRequestSchema = z.object({
  id: z.string().min(1),
})

/** teamPreset.remove response value (empty). */
export const wireRemoveValueSchema = z.object({})

/** teamPreset.openLocation request payload. */
export const wireOpenLocationRequestSchema = z.object({
  id: z.string().min(1),
})

/** teamPreset.openLocation response value. */
export const wireOpenLocationValueSchema = z.union([
  z.object({ opened: z.literal(true) }),
  z.object({ opened: z.literal(false), path: z.string() }),
])

/** The session-level delegation surface a session may select. */
export const wireTeamModeSchema = z.union([z.literal('standard'), z.literal('team')])

/** teamPreset.modeSelect request payload: the surface plus an optional team. */
export const wireModeSelectRequestSchema = z.object({
  sessionId: z.string().min(1),
  mode: wireTeamModeSchema,
  team: z.string().min(1).optional(),
}).refine(
  payload => payload.mode !== 'team' || payload.team !== undefined,
  { message: 'selecting the team mode requires a team id' },
)

/** teamPreset.modeSelect response value: the folded state now active. */
export const wireModeSelectValueSchema = z.object({
  mode: wireTeamModeSchema,
  team: z.string().optional(),
})

/** teamPreset.modeRead request payload. */
export const wireModeReadRequestSchema = z.object({
  sessionId: z.string().min(1),
})

/** teamPreset.modeRead response value: the session's current folded state. */
export const wireModeReadValueSchema = z.object({
  mode: wireTeamModeSchema,
  team: z.string().optional(),
})

/** The full management surface: endpoint name → request/value schemas. */
export const wireEndpoints = {
  list: { request: wireListRequestSchema, value: wireListValueSchema },
  read: { request: wireReadRequestSchema, value: wireReadValueSchema },
  create: { request: wireCreateRequestSchema, value: wireCreateValueSchema },
  update: { request: wireUpdateRequestSchema, value: wireUpdateValueSchema },
  remove: { request: wireRemoveRequestSchema, value: wireRemoveValueSchema },
  openLocation: { request: wireOpenLocationRequestSchema, value: wireOpenLocationValueSchema },
  modeSelect: { request: wireModeSelectRequestSchema, value: wireModeSelectValueSchema },
  modeRead: { request: wireModeReadRequestSchema, value: wireModeReadValueSchema },
} as const

/** One endpoint name the wire channel serves. */
export type WireEndpointName = keyof typeof wireEndpoints
