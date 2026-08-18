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
import { z } from 'zod';
import type { RpcResult } from '@deepseek-ai/dsh-host-apiproxy/api';
/** Success/failure wire result for one management call. */
export type WireResult<T> = RpcResult<T>;
/** A role's memory policy on the wire, mirroring `TeamRoleMemory`. */
export declare const wireRoleMemorySchema: z.ZodUnion<readonly [z.ZodLiteral<"one-shot">, z.ZodLiteral<"persistent">]>;
/** One role of a team, as carried on read (full) and update/create (staged). */
export declare const wireRoleSchema: z.ZodObject<{
    id: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
    prompt: z.ZodOptional<z.ZodString>;
    body: z.ZodString;
    memory: z.ZodUnion<readonly [z.ZodLiteral<"one-shot">, z.ZodLiteral<"persistent">]>;
}, z.core.$strip>;
/** A role summary on the roster: enough to render the row and its count. */
export declare const wireRoleSummarySchema: z.ZodObject<{
    id: z.ZodString;
    broken: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
/** Display metadata a team may publish (name/description/enabled). */
export declare const wireTeamMetadataSchema: z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    description: z.ZodOptional<z.ZodString>;
    enabled: z.ZodOptional<z.ZodBoolean>;
}, z.core.$strip>;
/** One team roster row. */
export declare const wireTeamEntrySchema: z.ZodObject<{
    id: z.ZodString;
    trust: z.ZodUnion<readonly [z.ZodLiteral<"system">, z.ZodLiteral<"user">]>;
    metadata: z.ZodObject<{
        name: z.ZodOptional<z.ZodString>;
        description: z.ZodOptional<z.ZodString>;
        enabled: z.ZodOptional<z.ZodBoolean>;
    }, z.core.$strip>;
    roles: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        broken: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
    broken: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
/** One fully-read team (full role definitions). */
export declare const wireTeamDetailSchema: z.ZodObject<{
    id: z.ZodString;
    trust: z.ZodUnion<readonly [z.ZodLiteral<"system">, z.ZodLiteral<"user">]>;
    metadata: z.ZodObject<{
        name: z.ZodOptional<z.ZodString>;
        description: z.ZodOptional<z.ZodString>;
        enabled: z.ZodOptional<z.ZodBoolean>;
    }, z.core.$strip>;
    roles: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        description: z.ZodOptional<z.ZodString>;
        prompt: z.ZodOptional<z.ZodString>;
        body: z.ZodString;
        memory: z.ZodUnion<readonly [z.ZodLiteral<"one-shot">, z.ZodLiteral<"persistent">]>;
    }, z.core.$strip>>;
    broken: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
/** teamPreset.list request payload (no fields). */
export declare const wireListRequestSchema: z.ZodObject<{}, z.core.$strip>;
/** teamPreset.list response value. */
export declare const wireListValueSchema: z.ZodObject<{
    teams: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        trust: z.ZodUnion<readonly [z.ZodLiteral<"system">, z.ZodLiteral<"user">]>;
        metadata: z.ZodObject<{
            name: z.ZodOptional<z.ZodString>;
            description: z.ZodOptional<z.ZodString>;
            enabled: z.ZodOptional<z.ZodBoolean>;
        }, z.core.$strip>;
        roles: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            broken: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>;
        broken: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
    authorable: z.ZodBoolean;
    hasDocument: z.ZodBoolean;
    bodies: z.ZodArray<z.ZodString>;
}, z.core.$strip>;
/** teamPreset.read request payload. */
export declare const wireReadRequestSchema: z.ZodObject<{
    id: z.ZodString;
}, z.core.$strip>;
/** teamPreset.read response value. */
export declare const wireReadValueSchema: z.ZodObject<{
    team: z.ZodObject<{
        id: z.ZodString;
        trust: z.ZodUnion<readonly [z.ZodLiteral<"system">, z.ZodLiteral<"user">]>;
        metadata: z.ZodObject<{
            name: z.ZodOptional<z.ZodString>;
            description: z.ZodOptional<z.ZodString>;
            enabled: z.ZodOptional<z.ZodBoolean>;
        }, z.core.$strip>;
        roles: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            description: z.ZodOptional<z.ZodString>;
            prompt: z.ZodOptional<z.ZodString>;
            body: z.ZodString;
            memory: z.ZodUnion<readonly [z.ZodLiteral<"one-shot">, z.ZodLiteral<"persistent">]>;
        }, z.core.$strip>>;
        broken: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>;
}, z.core.$strip>;
/** One staged role for create/update, with an optional body pick. */
export declare const wireStagedRoleSchema: z.ZodObject<{
    id: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
    prompt: z.ZodOptional<z.ZodString>;
    body: z.ZodString;
    memory: z.ZodUnion<readonly [z.ZodLiteral<"one-shot">, z.ZodLiteral<"persistent">]>;
}, z.core.$strip>;
/** teamPreset.create request payload: a new id plus its initial roster. */
export declare const wireCreateRequestSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodOptional<z.ZodString>;
    description: z.ZodOptional<z.ZodString>;
    roles: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        description: z.ZodOptional<z.ZodString>;
        prompt: z.ZodOptional<z.ZodString>;
        body: z.ZodString;
        memory: z.ZodUnion<readonly [z.ZodLiteral<"one-shot">, z.ZodLiteral<"persistent">]>;
    }, z.core.$strip>>;
}, z.core.$strip>;
/** teamPreset.create response value. */
export declare const wireCreateValueSchema: z.ZodObject<{
    id: z.ZodString;
}, z.core.$strip>;
/** teamPreset.update request payload: metadata and/or a whole-role rewrite. */
export declare const wireUpdateRequestSchema: z.ZodObject<{
    id: z.ZodString;
    metadata: z.ZodOptional<z.ZodObject<{
        name: z.ZodOptional<z.ZodString>;
        description: z.ZodOptional<z.ZodString>;
        enabled: z.ZodOptional<z.ZodBoolean>;
    }, z.core.$strip>>;
    roles: z.ZodOptional<z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        description: z.ZodOptional<z.ZodString>;
        prompt: z.ZodOptional<z.ZodString>;
        body: z.ZodString;
        memory: z.ZodUnion<readonly [z.ZodLiteral<"one-shot">, z.ZodLiteral<"persistent">]>;
    }, z.core.$strip>>>;
}, z.core.$strip>;
/** teamPreset.update response value. */
export declare const wireUpdateValueSchema: z.ZodObject<{
    id: z.ZodString;
}, z.core.$strip>;
/** teamPreset.remove request payload. */
export declare const wireRemoveRequestSchema: z.ZodObject<{
    id: z.ZodString;
}, z.core.$strip>;
/** teamPreset.remove response value (empty). */
export declare const wireRemoveValueSchema: z.ZodObject<{}, z.core.$strip>;
/** teamPreset.openLocation request payload. */
export declare const wireOpenLocationRequestSchema: z.ZodObject<{
    id: z.ZodString;
}, z.core.$strip>;
/** teamPreset.openLocation response value. */
export declare const wireOpenLocationValueSchema: z.ZodUnion<readonly [z.ZodObject<{
    opened: z.ZodLiteral<true>;
}, z.core.$strip>, z.ZodObject<{
    opened: z.ZodLiteral<false>;
    path: z.ZodString;
}, z.core.$strip>]>;
/** The full management surface: endpoint name → request/value schemas. */
export declare const wireEndpoints: {
    readonly list: {
        readonly request: z.ZodObject<{}, z.core.$strip>;
        readonly value: z.ZodObject<{
            teams: z.ZodArray<z.ZodObject<{
                id: z.ZodString;
                trust: z.ZodUnion<readonly [z.ZodLiteral<"system">, z.ZodLiteral<"user">]>;
                metadata: z.ZodObject<{
                    name: z.ZodOptional<z.ZodString>;
                    description: z.ZodOptional<z.ZodString>;
                    enabled: z.ZodOptional<z.ZodBoolean>;
                }, z.core.$strip>;
                roles: z.ZodArray<z.ZodObject<{
                    id: z.ZodString;
                    broken: z.ZodOptional<z.ZodString>;
                }, z.core.$strip>>;
                broken: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>>;
            authorable: z.ZodBoolean;
            hasDocument: z.ZodBoolean;
            bodies: z.ZodArray<z.ZodString>;
        }, z.core.$strip>;
    };
    readonly read: {
        readonly request: z.ZodObject<{
            id: z.ZodString;
        }, z.core.$strip>;
        readonly value: z.ZodObject<{
            team: z.ZodObject<{
                id: z.ZodString;
                trust: z.ZodUnion<readonly [z.ZodLiteral<"system">, z.ZodLiteral<"user">]>;
                metadata: z.ZodObject<{
                    name: z.ZodOptional<z.ZodString>;
                    description: z.ZodOptional<z.ZodString>;
                    enabled: z.ZodOptional<z.ZodBoolean>;
                }, z.core.$strip>;
                roles: z.ZodArray<z.ZodObject<{
                    id: z.ZodString;
                    description: z.ZodOptional<z.ZodString>;
                    prompt: z.ZodOptional<z.ZodString>;
                    body: z.ZodString;
                    memory: z.ZodUnion<readonly [z.ZodLiteral<"one-shot">, z.ZodLiteral<"persistent">]>;
                }, z.core.$strip>>;
                broken: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>;
        }, z.core.$strip>;
    };
    readonly create: {
        readonly request: z.ZodObject<{
            id: z.ZodString;
            name: z.ZodOptional<z.ZodString>;
            description: z.ZodOptional<z.ZodString>;
            roles: z.ZodArray<z.ZodObject<{
                id: z.ZodString;
                description: z.ZodOptional<z.ZodString>;
                prompt: z.ZodOptional<z.ZodString>;
                body: z.ZodString;
                memory: z.ZodUnion<readonly [z.ZodLiteral<"one-shot">, z.ZodLiteral<"persistent">]>;
            }, z.core.$strip>>;
        }, z.core.$strip>;
        readonly value: z.ZodObject<{
            id: z.ZodString;
        }, z.core.$strip>;
    };
    readonly update: {
        readonly request: z.ZodObject<{
            id: z.ZodString;
            metadata: z.ZodOptional<z.ZodObject<{
                name: z.ZodOptional<z.ZodString>;
                description: z.ZodOptional<z.ZodString>;
                enabled: z.ZodOptional<z.ZodBoolean>;
            }, z.core.$strip>>;
            roles: z.ZodOptional<z.ZodArray<z.ZodObject<{
                id: z.ZodString;
                description: z.ZodOptional<z.ZodString>;
                prompt: z.ZodOptional<z.ZodString>;
                body: z.ZodString;
                memory: z.ZodUnion<readonly [z.ZodLiteral<"one-shot">, z.ZodLiteral<"persistent">]>;
            }, z.core.$strip>>>;
        }, z.core.$strip>;
        readonly value: z.ZodObject<{
            id: z.ZodString;
        }, z.core.$strip>;
    };
    readonly remove: {
        readonly request: z.ZodObject<{
            id: z.ZodString;
        }, z.core.$strip>;
        readonly value: z.ZodObject<{}, z.core.$strip>;
    };
    readonly openLocation: {
        readonly request: z.ZodObject<{
            id: z.ZodString;
        }, z.core.$strip>;
        readonly value: z.ZodUnion<readonly [z.ZodObject<{
            opened: z.ZodLiteral<true>;
        }, z.core.$strip>, z.ZodObject<{
            opened: z.ZodLiteral<false>;
            path: z.ZodString;
        }, z.core.$strip>]>;
    };
};
/** One endpoint name the wire channel serves. */
export type WireEndpointName = keyof typeof wireEndpoints;
//# sourceMappingURL=schema.d.ts.map