/**
 * `/harness-hot` wire schemas and contracts.
 *
 * These are the request/response shapes the harness-hot RPC channel carries.
 * The channel is loopback-pinned: hot-mounting, upgrading, or unmounting a
 * plugin rewrites what the running composition offers, so an anonymous LAN
 * caller must never reach it.
 *
 * The wire uses the same success/error result shape as the apiproxy RPC layer:
 * `{ ok: true, value }` or `{ ok: false, error }`. Error codes mirror the hot
 * domain's vocabulary (`hot-restart-required`, `hot-not-found`, `hot-internal`).
 * @module dsh-harness-hot-bundle/wire-schema
 */
import { z } from 'zod';
import type { RpcResult } from '@deepseek-ai/dsh-host-apiproxy/api';
/** Success/failure wire result for one harness-hot call. */
export type WireResult<T> = RpcResult<T>;
/** One hot-mount row reported by `list`. */
export declare const wireMountRowSchema: z.ZodObject<{
    package: z.ZodString;
    rowIds: z.ZodArray<z.ZodString>;
    mountedAt: z.ZodNumber;
}, z.core.$strip>;
/** mount request payload. */
export declare const wireMountRequestSchema: z.ZodObject<{
    package: z.ZodString;
    profileDir: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
/** mount response value. */
export declare const wireMountValueSchema: z.ZodObject<{
    package: z.ZodString;
    rowIds: z.ZodArray<z.ZodString>;
    mountedAt: z.ZodNumber;
}, z.core.$strip>;
/** unmount request payload. */
export declare const wireUnmountRequestSchema: z.ZodObject<{
    package: z.ZodString;
}, z.core.$strip>;
/** unmount response value (null when nothing was mounted). */
export declare const wireUnmountValueSchema: z.ZodNullable<z.ZodObject<{
    package: z.ZodString;
    rowIds: z.ZodArray<z.ZodString>;
    mountedAt: z.ZodNumber;
}, z.core.$strip>>;
/** upgrade request payload. */
export declare const wireUpgradeRequestSchema: z.ZodObject<{
    package: z.ZodString;
    profileDir: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
/** upgrade response value. */
export declare const wireUpgradeValueSchema: z.ZodObject<{
    package: z.ZodString;
    rowIds: z.ZodArray<z.ZodString>;
    mountedAt: z.ZodNumber;
}, z.core.$strip>;
/** list request payload. */
export declare const wireListRequestSchema: z.ZodObject<{}, z.core.$strip>;
/** list response value. */
export declare const wireListValueSchema: z.ZodArray<z.ZodObject<{
    package: z.ZodString;
    rowIds: z.ZodArray<z.ZodString>;
    mountedAt: z.ZodNumber;
}, z.core.$strip>>;
/** The full harness-hot surface: endpoint name → request/value schemas. */
export declare const wireEndpoints: {
    readonly mount: {
        readonly request: z.ZodObject<{
            package: z.ZodString;
            profileDir: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>;
        readonly value: z.ZodObject<{
            package: z.ZodString;
            rowIds: z.ZodArray<z.ZodString>;
            mountedAt: z.ZodNumber;
        }, z.core.$strip>;
    };
    readonly unmount: {
        readonly request: z.ZodObject<{
            package: z.ZodString;
        }, z.core.$strip>;
        readonly value: z.ZodNullable<z.ZodObject<{
            package: z.ZodString;
            rowIds: z.ZodArray<z.ZodString>;
            mountedAt: z.ZodNumber;
        }, z.core.$strip>>;
    };
    readonly upgrade: {
        readonly request: z.ZodObject<{
            package: z.ZodString;
            profileDir: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>;
        readonly value: z.ZodObject<{
            package: z.ZodString;
            rowIds: z.ZodArray<z.ZodString>;
            mountedAt: z.ZodNumber;
        }, z.core.$strip>;
    };
    readonly list: {
        readonly request: z.ZodObject<{}, z.core.$strip>;
        readonly value: z.ZodArray<z.ZodObject<{
            package: z.ZodString;
            rowIds: z.ZodArray<z.ZodString>;
            mountedAt: z.ZodNumber;
        }, z.core.$strip>>;
    };
};
/** One endpoint name the wire channel serves. */
export type WireEndpointName = keyof typeof wireEndpoints;
//# sourceMappingURL=schema.d.ts.map