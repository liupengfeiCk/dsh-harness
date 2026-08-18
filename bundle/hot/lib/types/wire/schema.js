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
/** One hot-mount row reported by `list`. */
export const wireMountRowSchema = z.object({
    package: z.string(),
    rowIds: z.array(z.string()),
    mountedAt: z.number(),
});
/** mount request payload. */
export const wireMountRequestSchema = z.object({
    package: z.string().min(1),
    profileDir: z.string().optional(),
});
/** mount response value. */
export const wireMountValueSchema = z.object({
    package: z.string(),
    rowIds: z.array(z.string()),
    mountedAt: z.number(),
});
/** unmount request payload. */
export const wireUnmountRequestSchema = z.object({
    package: z.string().min(1),
});
/** unmount response value (null when nothing was mounted). */
export const wireUnmountValueSchema = z.object({
    package: z.string(),
    rowIds: z.array(z.string()),
    mountedAt: z.number(),
}).nullable();
/** upgrade request payload. */
export const wireUpgradeRequestSchema = z.object({
    package: z.string().min(1),
    profileDir: z.string().optional(),
});
/** upgrade response value. */
export const wireUpgradeValueSchema = z.object({
    package: z.string(),
    rowIds: z.array(z.string()),
    mountedAt: z.number(),
});
/** list request payload. */
export const wireListRequestSchema = z.object({});
/** list response value. */
export const wireListValueSchema = z.array(wireMountRowSchema);
/** shutdown request payload (empty). */
export const wireShutdownRequestSchema = z.object({});
/** shutdown response value. */
export const wireShutdownValueSchema = z.object({
    shuttingDown: z.boolean(),
});
/** The full harness-hot surface: endpoint name → request/value schemas. */
export const wireEndpoints = {
    mount: { request: wireMountRequestSchema, value: wireMountValueSchema },
    unmount: { request: wireUnmountRequestSchema, value: wireUnmountValueSchema },
    upgrade: { request: wireUpgradeRequestSchema, value: wireUpgradeValueSchema },
    list: { request: wireListRequestSchema, value: wireListValueSchema },
    shutdown: { request: wireShutdownRequestSchema, value: wireShutdownValueSchema },
};
//# sourceMappingURL=schema.js.map