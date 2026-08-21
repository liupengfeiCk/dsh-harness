/**
 * Memory management wire layer (host half, T14).
 *
 * The settings section's "记忆" block reads and mutates the memory engine's
 * assets through the connection's dedicated generic RPC channel `/memory`,
 * mirroring the `/model-plan` and `/memory-task` wires. One channel serves
 * every endpoint (`assets`, `assetRead`, `assetDelete`, `bindRole`,
 * `unbindRole`, `roleBindings`, `status`, `config`) with the same semantics as
 * the sibling surfaces: request and response shapes are zod-validated against
 * {@link wireEndpoints}, and the manager resolves/rewrites assets itself (no
 * path or file text crosses the wire).
 *
 * The channel is loopback-pinned: managing memory is privileged (deleting an
 * asset and reassigning role bindings rearranges what the engine injects), so
 * an anonymous LAN caller must not reach it.
 *
 * The `apply` entry is the cordis plugin body the memory bundle's
 * `cordis.patch.yml` mounts (`memory-wire`).
 * @module dsh-harness-memory-bundle/wire
 */
import { MemoryManager } from "../memory/manager.js";
import { wireEndpoints } from "./schema.js";
/** Absolute logical channel owning the memory-management endpoints. */
export const MEMORY_CHANNEL = '/memory';
/** Loopback-pinned authority: managing memory is privileged. */
const AUTHORITY = 'loopback';
/**
 * Parse and dispatch one endpoint against the memory manager.
 * @param manager - the memory management facade.
 * @param endpoint - the channel-relative endpoint name.
 * @param payload - the unvalidated request payload.
 * @param signal - caller/connection lifetime.
 * @returns the validated result, or the matching failure.
 */
export async function dispatchMemory(manager, endpoint, payload, signal) {
    // All endpoints are single-round-trip calls; the connection signal is
    // deliberately unused (kept for the shared rpc-handle signature).
    void signal;
    try {
        switch (endpoint) {
            case 'assets':
                return await assets(manager, parse(wireEndpoints.assets.request, payload));
            case 'assetRead':
                return await assetRead(manager, parse(wireEndpoints.assetRead.request, payload));
            case 'assetDelete':
                return await assetDelete(manager, parse(wireEndpoints.assetDelete.request, payload));
            case 'bindRole':
                return await bindRole(manager, parse(wireEndpoints.bindRole.request, payload));
            case 'unbindRole':
                return await unbindRole(manager, parse(wireEndpoints.unbindRole.request, payload));
            case 'roleBindings':
                return await roleBindings(manager, parse(wireEndpoints.roleBindings.request, payload));
            case 'status':
                return await status(manager, parse(wireEndpoints.status.request, payload));
            case 'config':
                return await config(manager);
            default:
                return fail(badEndpointError(endpoint));
        }
    }
    catch (error) {
        if (error instanceof BadRequestError) {
            return fail({
                code: 'bad-request',
                message: `invalid payload for ${endpoint}`,
                details: { issues: error.issues },
            });
        }
        return fail({
            code: 'internal',
            message: `memory handler failure: ${error instanceof Error ? error.message : String(error)}`,
            details: {},
        });
    }
}
/**
 * Register the `/memory` channel once the connection service becomes available.
 * @param ctx - the host plugin context.
 */
export function registerMemoryWire(ctx) {
    ctx.inject(['connection', 'memory'], (connectionCtx) => {
        const connection = connectionCtx.connection;
        const memory = connectionCtx.get('memory');
        const manager = new MemoryManager(memory, memory.hostAdapter.dataDirPath);
        connectionCtx.effect(() => connection.rpc.handle(MEMORY_CHANNEL, (endpoint, payload, signal) => dispatchMemory(manager, endpoint, payload, signal), { authority: AUTHORITY }), 'dsh-memory: /memory rpc channel');
    });
}
/**
 * Cordis plugin body for the `/memory` channel. Mounted as a host row in the
 * memory bundle's `cordis.patch.yml` (`memory-wire`).
 * @param ctx - the host plugin context.
 */
export function apply(ctx) {
    registerMemoryWire(ctx);
}
/** A deployment with no manager answers an empty roster, not an error. */
async function assets(manager, request) {
    const isolation = cleanIsolation(request.isolation);
    if (manager === undefined)
        return ok({ scope: request.scope, isolation, l1: [], l2: [], l3: [] });
    const result = await manager.assets(request.scope, isolation);
    return ok({
        scope: result.scope,
        isolation: result.isolation,
        l1: result.l1,
        l2: result.l2,
        l3: result.l3,
    });
}
async function assetRead(manager, request) {
    if (manager === undefined)
        return fail(notFound(request.ref));
    const asset = await manager.readAsset(request.ref);
    if (asset === undefined)
        return fail(notFound(request.ref));
    return ok(asset);
}
async function assetDelete(manager, request) {
    if (manager === undefined)
        return fail(notFound(request.ref));
    const deleted = await manager.deleteAsset(request.ref);
    return ok({ deleted });
}
async function bindRole(manager, request) {
    if (manager === undefined)
        return fail(noManager(request.roleId));
    await manager.bindRole(request.roleId, request.assetRef);
    return ok({ assets: [...await manager.roleBindings(request.roleId)] });
}
async function unbindRole(manager, request) {
    if (manager === undefined)
        return fail(noManager(request.roleId));
    await manager.unbindRole(request.roleId, request.assetRef);
    return ok({ assets: [...await manager.roleBindings(request.roleId)] });
}
async function roleBindings(manager, request) {
    if (manager === undefined)
        return ok({ assets: [] });
    return ok({ assets: [...await manager.roleBindings(request.roleId)] });
}
async function status(manager, request) {
    const isolation = cleanIsolation(request.isolation);
    if (manager === undefined) {
        return ok({
            scope: request.scope,
            isolation,
            l0Count: 0,
            l1Count: 0,
            l2Count: 0,
            l3Count: 0,
            lastExtractedAtMs: 0,
        });
    }
    const result = await manager.status(request.scope, isolation);
    return ok(result);
}
async function config(manager) {
    if (manager === undefined) {
        return ok({
            enabled: true,
            refinementPlan: '',
            compression: { mode: 'follow', planId: '' },
            injectionLimit: 0.2,
            compressionLine: 0.8,
            retainLine: 0.16,
        });
    }
    return ok(manager.settings());
}
/** Strip undefined optional keys so the value matches `ScopeIsolation`. */
function cleanIsolation(isolation) {
    if (isolation === undefined)
        return {};
    return {
        ...isolation.teamId !== undefined && isolation.teamId.length > 0 ? { teamId: isolation.teamId } : {},
        ...isolation.roleId !== undefined && isolation.roleId.length > 0 ? { roleId: isolation.roleId } : {},
        ...isolation.projectId !== undefined && isolation.projectId.length > 0 ? { projectId: isolation.projectId } : {},
    };
}
/** Parse one endpoint's payload; a malformed shape throws BadRequestError. */
function parse(schema, payload) {
    const parsed = schema.safeParse(payload);
    if (!parsed.success)
        throw new BadRequestError(parsed.error.issues);
    return parsed.data;
}
/** A malformed endpoint payload; thrown inside parse and folded by dispatch. */
class BadRequestError extends Error {
    issues;
    constructor(issues) {
        super('invalid payload');
        this.issues = issues;
    }
}
/** Success branch of a wire result. */
function ok(value) {
    return { ok: true, value };
}
/** Failure branch of a wire result. */
function fail(error) {
    return { ok: false, error: error };
}
/** Fail-closed code for an endpoint this channel does not serve. */
function badEndpointError(endpoint) {
    return {
        code: 'bad-request',
        message: `memory channel does not serve endpoint "${endpoint}"`,
        details: { issues: [] },
    };
}
/** The not-found shape when an asset cannot be resolved. */
function notFound(ref) {
    return {
        code: 'memory-not-found',
        message: 'memory asset not found',
        details: { ref },
    };
}
/** The no-manager shape when the memory engine is not composed. */
function noManager(id) {
    return {
        code: 'memory-not-available',
        message: 'this deployment composes no memory engine',
        details: { id },
    };
}
//# sourceMappingURL=index.js.map