/**
 * `/memory` wire endpoint schemas (host half, T14).
 *
 * Every endpoint's request/response shape is zod-validated at the dispatch
 * seam, mirroring the `/memory-task` and `/model-plan` wires. The failure
 * vocabulary is the manager's own codes mapped at the dispatch layer.
 *
 * @module dsh-harness-memory-bundle/wire/schema
 */
import { z } from 'zod';
/** The three scope tabs the settings section offers. */
export const ASSET_SCOPE = z.enum(['team', 'teamRole', 'project']);
/** Isolation coordinates for one scope tab. */
export const isolationSchema = z.object({
    teamId: z.string().optional(),
    roleId: z.string().optional(),
    projectId: z.string().optional(),
});
/** An enumerated asset row on the wire. */
export const assetEntrySchema = z.object({
    ref: z.string(),
    layer: z.enum(['L1', 'L2', 'L3']),
    title: z.string(),
    preview: z.string(),
    updatedAtMs: z.number(),
});
/** The settings value for the config surface. */
export const memorySettingsSchema = z.object({
    enabled: z.boolean(),
    refinementPlan: z.string(),
    compression: z.object({
        mode: z.enum(['follow', 'plan']),
        planId: z.string(),
    }),
    injectionLimit: z.number(),
    compressionLine: z.number(),
    retainLine: z.number(),
});
/** Wire endpoints: method → request + response schema. */
export const wireEndpoints = {
    assets: {
        request: z.object({ scope: ASSET_SCOPE, isolation: isolationSchema.optional() }),
        response: z.object({
            scope: ASSET_SCOPE,
            isolation: isolationSchema,
            l1: z.array(assetEntrySchema),
            l2: z.array(assetEntrySchema),
            l3: z.array(assetEntrySchema),
        }),
    },
    assetRead: {
        request: z.object({ ref: z.string() }),
        response: z.object({ title: z.string(), content: z.string() }),
    },
    assetDelete: {
        request: z.object({ ref: z.string() }),
        response: z.object({ deleted: z.boolean() }),
    },
    bindRole: {
        request: z.object({ roleId: z.string(), assetRef: z.string() }),
        response: z.object({ assets: z.array(z.string()) }),
    },
    unbindRole: {
        request: z.object({ roleId: z.string(), assetRef: z.string() }),
        response: z.object({ assets: z.array(z.string()) }),
    },
    roleBindings: {
        request: z.object({ roleId: z.string() }),
        response: z.object({ assets: z.array(z.string()) }),
    },
    status: {
        request: z.object({ scope: ASSET_SCOPE, isolation: isolationSchema.optional() }),
        response: z.object({
            scope: ASSET_SCOPE,
            isolation: isolationSchema,
            l0Count: z.number(),
            l1Count: z.number(),
            l2Count: z.number(),
            l3Count: z.number(),
            lastExtractedAtMs: z.number(),
        }),
    },
    config: {
        request: z.object({}),
        response: memorySettingsSchema,
    },
};
//# sourceMappingURL=schema.js.map