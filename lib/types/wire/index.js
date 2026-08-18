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
 * @param host - host facts the shutdown endpoint reads (`appExit`).
 * @returns the validated result, or the matching failure.
 */
export async function dispatchHarnessHot(service, endpoint, payload, signal, host = {}) {
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
            case 'shutdown':
                return await shutdown(service, parse(wireEndpoints.shutdown.request, payload), signal, host.appExit);
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
            details: { causes: flattenErrorMessages(error) },
        });
    }
}
/**
 * Recursively flatten a thrown value's message tree into one line per leaf.
 *
 * A single failing hot mount surfaces as one `AggregateError` whose own
 * message ("loader entries failed to apply") names none of the rows that
 * failed; without flattening, the operator sees only the wrapper. Each nested
 * `AggregateError`/`cause` chain is walked depth-first so every leaf reason is
 * reported, mirroring the loader's own `mountDetail` rendering in
 * `agent-presets` so the two failure surfaces agree.
 * @param error - the value the handler rejected with.
 * @returns one message line per leaf error (an empty array for a non-Error
 * value, whose text is captured by the caller's `message` prefix).
 */
export function flattenErrorMessages(error) {
    const out = [];
    walkError(error, out, 0);
    return out;
}
/** Depth-first emit every leaf's message; stop below a sane nesting ceiling. */
function walkError(error, out, depth) {
    if (depth > 8)
        return;
    if (!(error instanceof Error))
        return;
    const children = error instanceof AggregateError
        ? error.errors
        : error.cause === undefined
            ? []
            : [error.cause];
    if (children.length === 0) {
        out.push(error.message);
        return;
    }
    for (const child of children)
        walkError(child, out, depth + 1);
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
 * Request bounded process shutdown: inject the deployment's `appExit` service
 * and call it once the RPC response has been handed back to the connection
 * layer. The launcher wires `appExit` to its bounded-shutdown controller, so
 * the process disposes its whole tree and exits — the standard way to stop any
 * instance carrying this bundle.
 * @param service - the `harnessHot` service (unused by shutdown; present for a
 * uniform dispatch surface).
 * @param request - the shutdown request (empty).
 * @param signal - caller/connection lifetime.
 * @param appExit - the host's bounded exit request.
 * @returns ok when shutdown was requested, or a failure when no exit service
 * is available.
 */
async function shutdown(_service, _request, signal, appExit) {
    if (appExit === undefined) {
        return fail({
            code: 'no-exit-service',
            message: 'this deployment does not provide an appExit service — cannot shut down',
            details: {},
        });
    }
    signal.throwIfAborted();
    // Defer the exit request past the current task so the server-response
    // envelope is flushed to the caller before the process begins its bounded
    // shutdown.
    setTimeout(() => { appExit(0); }, 0);
    return ok({ shuttingDown: true });
}
/**
 * Register the `/harness-hot` channel once the connection service becomes
 * available. Called by the profile bundle that composes a web deployment.
 * @param ctx - the host plugin context.
 */
export function registerHarnessHotWire(ctx) {
    ctx.inject(['connection'], (connectionCtx) => {
        const connection = connectionCtx.connection;
        connectionCtx.effect(() => connection.rpc.handle(HARNESS_HOT_CHANNEL, (endpoint, payload, signal) => dispatchHarnessHot(connectionCtx.get('harnessHot'), endpoint, payload, signal, { appExit: connectionCtx.get('appExit') }), { authority: AUTHORITY }), 'dsh-harness-hot: /harness-hot rpc channel');
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