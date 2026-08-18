/**
 * The `/harness-hot` wire layer (host half).
 *
 * Hot-mounting, upgrading, or unmounting a plugin rewrites what the RUNNING
 * composition offers — a privileged operation. The channel is therefore
 * loopback-pinned (`authority: 'loopback'`), exactly like the withdrawn
 * apiproxy `agentPreset.*` methods and the harness agent-preset-edit wire. The
 * channel serves four endpoints — `mount`, `unmount`, `upgrade`, `list` —
 * validated against {@link wireEndpoints}; the Host resolves the profile and
 * rewrites the running tree itself, so no file path crosses the wire.
 *
 * The Host half is registered separately from the (pure) hot engine: the
 * channel must ride where the `harnessHot` service lives, so the bundle that
 * composes a web profile calls {@link registerHarnessHotWire} once the
 * connection service is available.
 * @module dsh-harness-hot-bundle/wire
 */
import { RestartRequiredError } from "../patch.js";
import { wireEndpoints, } from "./schema.js";
/** Absolute logical channel owning the harness-hot endpoints. */
export const HARNESS_HOT_CHANNEL = '/harness-hot';
/** Loopback-pinned authority: hot-mounting/upgrading is privileged. */
const AUTHORITY = 'loopback';
/**
 * Parse and dispatch one endpoint against the harness-hot service.
 * @param service - the `harnessHot` service (the deployment may compose none).
 * @param endpoint - the channel-relative endpoint name.
 * @param payload - the unvalidated request payload.
 * @param signal - caller/connection lifetime.
 * @returns the validated result, or the matching failure.
 */
export async function dispatchHarnessHot(service, endpoint, payload, signal) {
    try {
        if (service === undefined) {
            return fail({
                code: 'hot-not-found',
                message: 'this deployment composes no harnessHot service',
                details: {},
            });
        }
        switch (endpoint) {
            case 'mount':
                return await mount(service, parse(wireEndpoints.mount.request, payload), signal);
            case 'unmount':
                return await unmount(service, parse(wireEndpoints.unmount.request, payload), signal);
            case 'upgrade':
                return await upgrade(service, parse(wireEndpoints.upgrade.request, payload), signal);
            case 'list':
                return await list(service, signal);
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
        if (error instanceof RestartRequiredError) {
            return fail({
                code: 'hot-restart-required',
                message: error.message,
                details: { reason: error.message },
            });
        }
        return fail({
            code: 'internal',
            message: `harness-hot handler failure: ${error instanceof Error ? error.message : String(error)}`,
            details: {},
        });
    }
}
/** Hot-mount one package. */
async function mount(service, request, signal) {
    const record = await service.mount({ package: request.package, ...request.profileDir === undefined ? {} : { profileDir: request.profileDir } });
    signal.throwIfAborted();
    return ok({ package: record.package, rowIds: record.rowIds, mountedAt: record.mountedAt });
}
/** Hot-unmount one package. */
async function unmount(service, request, signal) {
    const record = await service.unmount(request.package);
    signal.throwIfAborted();
    if (record === null)
        return ok(null);
    return ok({ package: record.package, rowIds: record.rowIds, mountedAt: record.mountedAt });
}
/** Hot-upgrade one package. */
async function upgrade(service, request, signal) {
    const record = await service.upgrade({ package: request.package, ...request.profileDir === undefined ? {} : { profileDir: request.profileDir } });
    signal.throwIfAborted();
    return ok({ package: record.package, rowIds: record.rowIds, mountedAt: record.mountedAt });
}
/** List the current hot mounts. */
async function list(service, signal) {
    const records = service.list();
    signal.throwIfAborted();
    return ok(records.map(record => ({ package: record.package, rowIds: record.rowIds, mountedAt: record.mountedAt })));
}
/**
 * Register the `/harness-hot` channel once the connection service becomes
 * available. Called by the profile bundle that composes a web deployment.
 * @param ctx - the host plugin context.
 */
export function registerHarnessHotWire(ctx) {
    ctx.inject(['connection'], (connectionCtx) => {
        const connection = connectionCtx.connection;
        connectionCtx.effect(() => connection.rpc.handle(HARNESS_HOT_CHANNEL, (endpoint, payload, signal) => dispatchHarnessHot(connectionCtx.get('harnessHot'), endpoint, payload, signal), { authority: AUTHORITY }), 'dsh-harness-hot: /harness-hot rpc channel');
    });
}
/**
 * Cordis plugin body for the `/harness-hot` channel. Mounted as a host row in
 * the profile bundle alongside the `harnessHot` service, this registers the
 * wire without touching any official package.
 * @param ctx - the host plugin context.
 */
export function apply(ctx) {
    registerHarnessHotWire(ctx);
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
        message: `harness-hot channel does not serve endpoint "${endpoint}"`,
        details: { issues: [] },
    };
}
//# sourceMappingURL=index.js.map