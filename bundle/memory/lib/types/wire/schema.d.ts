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
export declare const ASSET_SCOPE: z.ZodEnum<{
    team: "team";
    teamRole: "teamRole";
    project: "project";
}>;
/** Isolation coordinates for one scope tab. */
export declare const isolationSchema: z.ZodObject<{
    teamId: z.ZodOptional<z.ZodString>;
    roleId: z.ZodOptional<z.ZodString>;
    projectId: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
/** An enumerated asset row on the wire. */
export declare const assetEntrySchema: z.ZodObject<{
    ref: z.ZodString;
    layer: z.ZodEnum<{
        L1: "L1";
        L2: "L2";
        L3: "L3";
    }>;
    title: z.ZodString;
    preview: z.ZodString;
    updatedAtMs: z.ZodNumber;
}, z.core.$strip>;
/** The settings value for the config surface. */
export declare const memorySettingsSchema: z.ZodObject<{
    enabled: z.ZodBoolean;
    refinementPlan: z.ZodString;
    compression: z.ZodObject<{
        mode: z.ZodEnum<{
            follow: "follow";
            plan: "plan";
        }>;
        planId: z.ZodString;
    }, z.core.$strip>;
    injectionLimit: z.ZodNumber;
    compressionLine: z.ZodNumber;
    retainLine: z.ZodNumber;
}, z.core.$strip>;
/** Wire endpoints: method → request + response schema. */
export declare const wireEndpoints: {
    readonly assets: {
        readonly request: z.ZodObject<{
            scope: z.ZodEnum<{
                team: "team";
                teamRole: "teamRole";
                project: "project";
            }>;
            isolation: z.ZodOptional<z.ZodObject<{
                teamId: z.ZodOptional<z.ZodString>;
                roleId: z.ZodOptional<z.ZodString>;
                projectId: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>>;
        }, z.core.$strip>;
        readonly response: z.ZodObject<{
            scope: z.ZodEnum<{
                team: "team";
                teamRole: "teamRole";
                project: "project";
            }>;
            isolation: z.ZodObject<{
                teamId: z.ZodOptional<z.ZodString>;
                roleId: z.ZodOptional<z.ZodString>;
                projectId: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>;
            l1: z.ZodArray<z.ZodObject<{
                ref: z.ZodString;
                layer: z.ZodEnum<{
                    L1: "L1";
                    L2: "L2";
                    L3: "L3";
                }>;
                title: z.ZodString;
                preview: z.ZodString;
                updatedAtMs: z.ZodNumber;
            }, z.core.$strip>>;
            l2: z.ZodArray<z.ZodObject<{
                ref: z.ZodString;
                layer: z.ZodEnum<{
                    L1: "L1";
                    L2: "L2";
                    L3: "L3";
                }>;
                title: z.ZodString;
                preview: z.ZodString;
                updatedAtMs: z.ZodNumber;
            }, z.core.$strip>>;
            l3: z.ZodArray<z.ZodObject<{
                ref: z.ZodString;
                layer: z.ZodEnum<{
                    L1: "L1";
                    L2: "L2";
                    L3: "L3";
                }>;
                title: z.ZodString;
                preview: z.ZodString;
                updatedAtMs: z.ZodNumber;
            }, z.core.$strip>>;
        }, z.core.$strip>;
    };
    readonly assetRead: {
        readonly request: z.ZodObject<{
            ref: z.ZodString;
        }, z.core.$strip>;
        readonly response: z.ZodObject<{
            title: z.ZodString;
            content: z.ZodString;
        }, z.core.$strip>;
    };
    readonly assetDelete: {
        readonly request: z.ZodObject<{
            ref: z.ZodString;
        }, z.core.$strip>;
        readonly response: z.ZodObject<{
            deleted: z.ZodBoolean;
        }, z.core.$strip>;
    };
    readonly bindRole: {
        readonly request: z.ZodObject<{
            roleId: z.ZodString;
            assetRef: z.ZodString;
        }, z.core.$strip>;
        readonly response: z.ZodObject<{
            assets: z.ZodArray<z.ZodString>;
        }, z.core.$strip>;
    };
    readonly unbindRole: {
        readonly request: z.ZodObject<{
            roleId: z.ZodString;
            assetRef: z.ZodString;
        }, z.core.$strip>;
        readonly response: z.ZodObject<{
            assets: z.ZodArray<z.ZodString>;
        }, z.core.$strip>;
    };
    readonly roleBindings: {
        readonly request: z.ZodObject<{
            roleId: z.ZodString;
        }, z.core.$strip>;
        readonly response: z.ZodObject<{
            assets: z.ZodArray<z.ZodString>;
        }, z.core.$strip>;
    };
    readonly status: {
        readonly request: z.ZodObject<{
            scope: z.ZodEnum<{
                team: "team";
                teamRole: "teamRole";
                project: "project";
            }>;
            isolation: z.ZodOptional<z.ZodObject<{
                teamId: z.ZodOptional<z.ZodString>;
                roleId: z.ZodOptional<z.ZodString>;
                projectId: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>>;
        }, z.core.$strip>;
        readonly response: z.ZodObject<{
            scope: z.ZodEnum<{
                team: "team";
                teamRole: "teamRole";
                project: "project";
            }>;
            isolation: z.ZodObject<{
                teamId: z.ZodOptional<z.ZodString>;
                roleId: z.ZodOptional<z.ZodString>;
                projectId: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>;
            l0Count: z.ZodNumber;
            l1Count: z.ZodNumber;
            l2Count: z.ZodNumber;
            l3Count: z.ZodNumber;
            lastExtractedAtMs: z.ZodNumber;
        }, z.core.$strip>;
    };
    readonly config: {
        readonly request: z.ZodObject<{}, z.core.$strip>;
        readonly response: z.ZodObject<{
            enabled: z.ZodBoolean;
            refinementPlan: z.ZodString;
            compression: z.ZodObject<{
                mode: z.ZodEnum<{
                    follow: "follow";
                    plan: "plan";
                }>;
                planId: z.ZodString;
            }, z.core.$strip>;
            injectionLimit: z.ZodNumber;
            compressionLine: z.ZodNumber;
            retainLine: z.ZodNumber;
        }, z.core.$strip>;
    };
};
/** One endpoint's method name. */
export type WireEndpointName = keyof typeof wireEndpoints;
//# sourceMappingURL=schema.d.ts.map