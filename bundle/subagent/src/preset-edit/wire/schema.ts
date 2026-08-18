/**
 * Agent-preset editing wire schemas and contracts.
 *
 * These are the request/response shapes the agent-preset-edit wire channel
 * carries, moved here from the withdrawn apiproxy `agentPreset.readEditable` /
 * `agentPreset.update` domain so the browser surface and the Host handler
 * validate against the same zod schemas without touching the apiproxy
 * registry. Names mirror the withdrawn domain's and the value types mirror
 * this package's own vocabulary (`DelegationInstance`, `ToolRow`,
 * `CatalogTool`) so a new editable field needs no per-field assembly on this
 * seam.
 *
 * The wire uses the same success/error result shape as the apiproxy RPC layer:
 * `{ ok: true, value }` or `{ ok: false, error }`. The error codes mirror the
 * withdrawn `agentPreset.*` domain's vocabulary (`agent-preset-not-found`,
 * `agent-preset-read-only`, `agent-preset-invalid`).
 * @module dsh-harness-subagent-bundle/preset-edit/wire-schema
 */

import { z } from 'zod'
import type { RpcResult } from '@deepseek-ai/dsh-host-apiproxy/api'
import type {
  CatalogTool, DelegationInstance, ToolRow,
} from '../edit.ts'

/** Success/failure wire result for one editing call. */
export type WireResult<T> = RpcResult<T>

/** One delegation instance the form may edit, keyed by its instance id. */
export interface WireDelegationRow extends DelegationInstance {}

/** One tool row in the inventory, with its enabled state and optional prose. */
export interface WireToolRow extends ToolRow {}

/** One installable tool package in the available-tools directory. */
export interface WireCatalogTool extends CatalogTool {}

/** agentPreset.readEditable request payload. */
export const wireReadEditableRequestSchema = z.object({
  agentPreset: z.string().min(1),
})

/** One delegation instance a form may edit. */
export const wireDelegationRowSchema = z.object({
  id: z.string().min(1),
  disabled: z.boolean().optional(),
  provider: z.string().optional(),
  backgroundMode: z.string().optional(),
  backgroundModeLocked: z.boolean(),
  enableRunInBackground: z.boolean().optional(),
  maxDepth: z.unknown().optional(),
  toolName: z.string().optional(),
})

/** One tool row's editable state. */
export const wireToolRowSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  disabled: z.union([z.boolean(), z.literal('expr')]),
  description: z.string().optional(),
})

/** One installable tool package in the available-tools directory. */
export const wireCatalogToolSchema = z.object({
  name: z.string().min(1),
  toolNames: z.array(z.string()),
  description: z.string().optional(),
  installed: z.boolean(),
})

/** agentPreset.readEditable response value. */
export const wireReadEditableValueSchema = z.object({
  agentPreset: z.string(),
  persona: z.object({ text: z.string() }).optional(),
  delegation: z.array(wireDelegationRowSchema),
  tools: z.array(wireToolRowSchema),
  catalog: z.array(wireCatalogToolSchema),
  name: z.string().optional(),
  description: z.string().optional(),
})

/** agentPreset.update request payload. */
export const wireUpdateRequestSchema = z.object({
  agentPreset: z.string().min(1),
  persona: z.object({ text: z.string() }).optional(),
  delegation: z.record(z.string(), z.record(z.string(), z.unknown())).optional(),
  tools: z.record(z.string(), z.object({ disabled: z.boolean() })).optional(),
  installTools: z.array(z.string()).optional(),
  removeTools: z.array(z.string()).optional(),
  metadata: z.object({
    name: z.string().optional(),
    description: z.string().optional(),
  }).optional(),
})

/** agentPreset.update response value. */
export const wireUpdateValueSchema = z.object({
  agentPreset: z.string(),
})

/** The full editing surface: endpoint name → request/value schemas. */
export const wireEndpoints = {
  readEditable: { request: wireReadEditableRequestSchema, value: wireReadEditableValueSchema },
  update: { request: wireUpdateRequestSchema, value: wireUpdateValueSchema },
} as const

/** One endpoint name the wire channel serves. */
export type WireEndpointName = keyof typeof wireEndpoints
