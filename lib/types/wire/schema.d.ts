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
import { z } from 'zod';
import type { RpcResult } from '@deepseek-ai/dsh-host-apiproxy/api';
/** Success/failure wire result for one management call. */
export type WireResult<T> = RpcResult<T>;
/**
 * A bag of arbitrary key=value plan params on the wire. Carried as a plain
 * record of JSON values; callers narrow it to `PlanParams` (string keys) at
 * the dispatch boundary.
 */
export declare const wireParamsSchema: z.ZodRecord<z.ZodString, z.ZodType<unknown, unknown, z.core.$ZodTypeInternals<unknown, unknown>>>;
/** A plan's trust on the wire, mirroring `PlanTrust`. */
export declare const wireTrustSchema: z.ZodUnion<readonly [z.ZodLiteral<"system">, z.ZodLiteral<"user">]>;
/** One plan roster row. */
export declare const wirePlanEntrySchema: z.ZodObject<{
    id: z.ZodString;
    provider: z.ZodString;
    model: z.ZodString;
    params: z.ZodRecord<z.ZodString, z.ZodType<unknown, unknown, z.core.$ZodTypeInternals<unknown, unknown>>>;
    trust: z.ZodUnion<readonly [z.ZodLiteral<"system">, z.ZodLiteral<"user">]>;
    isDefault: z.ZodBoolean;
    broken: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
/** modelPlan.list request payload (no fields). */
export declare const wireListRequestSchema: z.ZodObject<{}, z.core.$strip>;
/** modelPlan.list response value. */
export declare const wireListValueSchema: z.ZodObject<{
    plans: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        provider: z.ZodString;
        model: z.ZodString;
        params: z.ZodRecord<z.ZodString, z.ZodType<unknown, unknown, z.core.$ZodTypeInternals<unknown, unknown>>>;
        trust: z.ZodUnion<readonly [z.ZodLiteral<"system">, z.ZodLiteral<"user">]>;
        isDefault: z.ZodBoolean;
        broken: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
    authorable: z.ZodBoolean;
}, z.core.$strip>;
/** modelPlan.read request payload. */
export declare const wireReadRequestSchema: z.ZodObject<{
    id: z.ZodString;
}, z.core.$strip>;
/** modelPlan.read response value. */
export declare const wireReadValueSchema: z.ZodObject<{
    plan: z.ZodObject<{
        id: z.ZodString;
        provider: z.ZodString;
        model: z.ZodString;
        params: z.ZodRecord<z.ZodString, z.ZodType<unknown, unknown, z.core.$ZodTypeInternals<unknown, unknown>>>;
        trust: z.ZodUnion<readonly [z.ZodLiteral<"system">, z.ZodLiteral<"user">]>;
        isDefault: z.ZodBoolean;
        broken: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>;
}, z.core.$strip>;
/** modelPlan.create request payload: a new id plus its initial fields. */
export declare const wireCreateRequestSchema: z.ZodObject<{
    id: z.ZodString;
    provider: z.ZodString;
    model: z.ZodString;
    params: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodType<unknown, unknown, z.core.$ZodTypeInternals<unknown, unknown>>>>;
    default: z.ZodOptional<z.ZodBoolean>;
}, z.core.$strip>;
/** modelPlan.create response value. */
export declare const wireCreateValueSchema: z.ZodObject<{
    id: z.ZodString;
}, z.core.$strip>;
/** modelPlan.update request payload: any subset of the plan's fields. */
export declare const wireUpdateRequestSchema: z.ZodObject<{
    id: z.ZodString;
    provider: z.ZodOptional<z.ZodString>;
    model: z.ZodOptional<z.ZodString>;
    params: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodType<unknown, unknown, z.core.$ZodTypeInternals<unknown, unknown>>>>;
    default: z.ZodOptional<z.ZodBoolean>;
}, z.core.$strip>;
/** modelPlan.update response value. */
export declare const wireUpdateValueSchema: z.ZodObject<{
    id: z.ZodString;
}, z.core.$strip>;
/** modelPlan.remove request payload. */
export declare const wireRemoveRequestSchema: z.ZodObject<{
    id: z.ZodString;
}, z.core.$strip>;
/** modelPlan.remove response value (empty). */
export declare const wireRemoveValueSchema: z.ZodObject<{}, z.core.$strip>;
/** modelPlan.select request payload: the session to bind, the plan, and an optional session overrides bag. */
export declare const wireSelectRequestSchema: z.ZodObject<{
    sessionId: z.ZodString;
    planId: z.ZodString;
    overrides: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodType<unknown, unknown, z.core.$ZodTypeInternals<unknown, unknown>>>>;
}, z.core.$strip>;
/** modelPlan.select response value: the folded selection now active. */
export declare const wireSelectValueSchema: z.ZodObject<{
    planId: z.ZodString;
    overrides: z.ZodRecord<z.ZodString, z.ZodType<unknown, unknown, z.core.$ZodTypeInternals<unknown, unknown>>>;
}, z.core.$strip>;
/** modelPlan.readSelection request payload. */
export declare const wireReadSelectionRequestSchema: z.ZodObject<{
    sessionId: z.ZodString;
}, z.core.$strip>;
/** modelPlan.readSelection response value: the session's current folded selection. */
export declare const wireReadSelectionValueSchema: z.ZodObject<{
    planId: z.ZodOptional<z.ZodString>;
    overrides: z.ZodRecord<z.ZodString, z.ZodType<unknown, unknown, z.core.$ZodTypeInternals<unknown, unknown>>>;
}, z.core.$strip>;
/** The full management surface: endpoint name → request/value schemas. */
export declare const wireEndpoints: {
    readonly list: {
        readonly request: z.ZodObject<{}, z.core.$strip>;
        readonly value: z.ZodObject<{
            plans: z.ZodArray<z.ZodObject<{
                id: z.ZodString;
                provider: z.ZodString;
                model: z.ZodString;
                params: z.ZodRecord<z.ZodString, z.ZodType<unknown, unknown, z.core.$ZodTypeInternals<unknown, unknown>>>;
                trust: z.ZodUnion<readonly [z.ZodLiteral<"system">, z.ZodLiteral<"user">]>;
                isDefault: z.ZodBoolean;
                broken: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>>;
            authorable: z.ZodBoolean;
        }, z.core.$strip>;
    };
    readonly read: {
        readonly request: z.ZodObject<{
            id: z.ZodString;
        }, z.core.$strip>;
        readonly value: z.ZodObject<{
            plan: z.ZodObject<{
                id: z.ZodString;
                provider: z.ZodString;
                model: z.ZodString;
                params: z.ZodRecord<z.ZodString, z.ZodType<unknown, unknown, z.core.$ZodTypeInternals<unknown, unknown>>>;
                trust: z.ZodUnion<readonly [z.ZodLiteral<"system">, z.ZodLiteral<"user">]>;
                isDefault: z.ZodBoolean;
                broken: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>;
        }, z.core.$strip>;
    };
    readonly create: {
        readonly request: z.ZodObject<{
            id: z.ZodString;
            provider: z.ZodString;
            model: z.ZodString;
            params: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodType<unknown, unknown, z.core.$ZodTypeInternals<unknown, unknown>>>>;
            default: z.ZodOptional<z.ZodBoolean>;
        }, z.core.$strip>;
        readonly value: z.ZodObject<{
            id: z.ZodString;
        }, z.core.$strip>;
    };
    readonly update: {
        readonly request: z.ZodObject<{
            id: z.ZodString;
            provider: z.ZodOptional<z.ZodString>;
            model: z.ZodOptional<z.ZodString>;
            params: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodType<unknown, unknown, z.core.$ZodTypeInternals<unknown, unknown>>>>;
            default: z.ZodOptional<z.ZodBoolean>;
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
    readonly select: {
        readonly request: z.ZodObject<{
            sessionId: z.ZodString;
            planId: z.ZodString;
            overrides: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodType<unknown, unknown, z.core.$ZodTypeInternals<unknown, unknown>>>>;
        }, z.core.$strip>;
        readonly value: z.ZodObject<{
            planId: z.ZodString;
            overrides: z.ZodRecord<z.ZodString, z.ZodType<unknown, unknown, z.core.$ZodTypeInternals<unknown, unknown>>>;
        }, z.core.$strip>;
    };
    readonly readSelection: {
        readonly request: z.ZodObject<{
            sessionId: z.ZodString;
        }, z.core.$strip>;
        readonly value: z.ZodObject<{
            planId: z.ZodOptional<z.ZodString>;
            overrides: z.ZodRecord<z.ZodString, z.ZodType<unknown, unknown, z.core.$ZodTypeInternals<unknown, unknown>>>;
        }, z.core.$strip>;
    };
};
/** One endpoint name the wire channel serves. */
export type WireEndpointName = keyof typeof wireEndpoints;
//# sourceMappingURL=schema.d.ts.map