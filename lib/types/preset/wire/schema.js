/**
 * Subagent-management wire schemas and contracts.
 *
 * These are the request/response shapes the subagent-preset wire channel
 * carries, moved here from the withdrawn apiproxy `subagentPreset.*` domain so
 * the browser surface and the Host handler validate against the same zod
 * schemas without touching the apiproxy registry. Names mirror the withdrawn
 * domain's (list/read/create/openDocument/remove/readEditable/update) and the
 * value types mirror the registry's own vocabulary (`SubagentPresetEntry`,
 * `SubagentPresetMetadata`, `ToolRow`, `CatalogTool`) so a new metadata field
 * needs no per-field assembly on this seam.
 *
 * The wire uses the same success/error result shape as the apiproxy RPC layer:
 * `{ ok: true, value }` or `{ ok: false, error }`. The error codes mirror the
 * withdrawn `subagentPreset.*` domain's vocabulary.
 * @module dsh-harness-subagent-bundle/preset/wire
 */
import { z } from 'zod';
/** The display metadata object carried on list/readEditable/update rows. */
export const wireSubagentMetadataSchema = z.object({
    description: z.string().optional(),
    enabled: z.boolean().optional(),
    model: z.object({ provider: z.string(), model: z.string() }).optional(),
    inheritParent: z.boolean().optional(),
});
/** One subagent roster row. */
export const wireSubagentEntrySchema = z.object({
    id: z.string().min(1),
    trust: z.union([z.literal('system'), z.literal('user')]),
    metadata: wireSubagentMetadataSchema,
    broken: z.string().min(1).optional(),
});
/** subagentPreset.list request payload (no fields). */
export const wireListRequestSchema = z.object({});
/** subagentPreset.list response value. */
export const wireListValueSchema = z.object({
    subagents: z.array(wireSubagentEntrySchema),
    authorable: z.boolean(),
    hasDocument: z.boolean(),
});
/** subagentPreset.read request payload. */
export const wireReadRequestSchema = z.object({
    subagent: z.string().min(1),
});
/** subagentPreset.read response value. */
export const wireReadValueSchema = z.object({
    subagent: z.string(),
    trust: z.union([z.literal('system'), z.literal('user')]),
    content: z.string(),
});
/** subagentPreset.create request payload. */
export const wireCreateRequestSchema = z.object({
    from: z.string().min(1),
    subagent: z.string().min(1),
});
/** subagentPreset.create response value. */
export const wireCreateValueSchema = z.object({
    subagent: z.string(),
});
/** subagentPreset.openDocument request payload. */
export const wireOpenDocumentRequestSchema = z.object({
    subagent: z.string().min(1),
});
/** subagentPreset.openDocument response value. */
export const wireOpenDocumentValueSchema = z.union([
    z.object({ opened: z.literal(true) }),
    z.object({ opened: z.literal(false), path: z.string() }),
]);
/** subagentPreset.remove request payload. */
export const wireRemoveRequestSchema = z.object({
    subagent: z.string().min(1),
});
/** subagentPreset.remove response value (empty). */
export const wireRemoveValueSchema = z.object({});
/** One tool row of subagentPreset.readEditable. */
export const wireToolRowSchema = z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    disabled: z.union([z.boolean(), z.literal('expr')]),
    description: z.string().optional(),
});
/** One catalog entry of subagentPreset.readEditable. */
export const wireCatalogToolSchema = z.object({
    name: z.string().min(1),
    toolNames: z.array(z.string()),
    description: z.string().optional(),
    installed: z.boolean(),
});
/** subagentPreset.readEditable request payload. */
export const wireReadEditableRequestSchema = z.object({
    subagent: z.string().min(1),
});
/** subagentPreset.readEditable response value. */
export const wireReadEditableValueSchema = z.object({
    subagent: z.string(),
    persona: z.object({ text: z.string() }).optional(),
    tools: z.array(wireToolRowSchema),
    catalog: z.array(wireCatalogToolSchema),
    metadata: wireSubagentMetadataSchema,
});
/** subagentPreset.update request payload. */
export const wireUpdateRequestSchema = z.object({
    subagent: z.string().min(1),
    persona: z.object({ text: z.string() }).optional(),
    tools: z.record(z.string(), z.object({ disabled: z.boolean() })).optional(),
    installTools: z.array(z.string()).optional(),
    removeTools: z.array(z.string()).optional(),
    metadata: wireSubagentMetadataSchema.optional(),
});
/** subagentPreset.update response value. */
export const wireUpdateValueSchema = z.object({
    subagent: z.string(),
});
/** The full management surface: endpoint name → request/value schemas. */
export const wireEndpoints = {
    list: { request: wireListRequestSchema, value: wireListValueSchema },
    read: { request: wireReadRequestSchema, value: wireReadValueSchema },
    create: { request: wireCreateRequestSchema, value: wireCreateValueSchema },
    openDocument: { request: wireOpenDocumentRequestSchema, value: wireOpenDocumentValueSchema },
    remove: { request: wireRemoveRequestSchema, value: wireRemoveValueSchema },
    readEditable: { request: wireReadEditableRequestSchema, value: wireReadEditableValueSchema },
    update: { request: wireUpdateRequestSchema, value: wireUpdateValueSchema },
};
//# sourceMappingURL=schema.js.map