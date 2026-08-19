/**
 * Model-plan management wire layer (host half).
 *
 * The model-plan registry ships as a host service in `../index.ts`; this
 * module adds the browser management surface on the connection's dedicated
 * generic RPC channel `/model-plan`, mirroring the team-management wire in the
 * subagent bundle. One channel serves every endpoint (`list`, `read`,
 * `create`, `update`, `remove`, `select`, `readSelection`) with the same
 * semantics as the team surface: the request and response shapes are
 * zod-validated against {@link wireEndpoints}, the Host resolves and rewrites
 * plans itself (no path or file text crosses the wire), and the failure
 * vocabulary mirrors the plan registry's codes.
 *
 * The channel is loopback-pinned: managing plans is privileged (reading a
 * plan's params is reconnaissance, and create/update/remove/select rearrange
 * what a bound session uses), so an anonymous LAN caller must not reach it —
 * the same pin the team-management channel carries.
 * @module dsh-harness-model-plan-bundle/wire
 */
import { InvalidPlanIdError, PlanExistsError, PlanNotWritableError, PlanRouteInvalidError, } from "../index.js";
import { PlanLockedError, UnknownPlanError } from "../types.js";
import { wireEndpoints } from "./schema.js";
/** Absolute logical channel owning the model-plan management endpoints. */
export const MODEL_PLAN_CHANNEL = '/model-plan';
/** Loopback-pinned authority: managing plans is privileged. */
const AUTHORITY = 'loopback';
/**
 * Parse and dispatch one endpoint against the plan registry.
 * @param plans - the plan registry service (the deployment may compose none).
 * @param endpoint - the channel-relative endpoint name.
 * @param payload - the unvalidated request payload.
 * @param signal - caller/connection lifetime.
 * @returns the validated result, or the matching failure.
 */
export async function dispatchModelPlan(plans, endpoint, payload, signal) {
    // This channel's endpoints are all single-round-trip registry calls; none
    // aborts mid-flight, so the connection lifetime signal is deliberately unused
    // (kept for the shared rpc-handle signature).
    void signal;
    try {
        switch (endpoint) {
            case 'list':
                return await list(plans);
            case 'read':
                return await read(plans, parse(wireEndpoints.read.request, payload));
            case 'create':
                return await create(plans, parse(wireEndpoints.create.request, payload));
            case 'update':
                return await update(plans, parse(wireEndpoints.update.request, payload));
            case 'remove':
                return await remove(plans, parse(wireEndpoints.remove.request, payload));
            case 'select':
                return await select(plans, parse(wireEndpoints.select.request, payload));
            case 'readSelection':
                return await readSelection(plans, parse(wireEndpoints.readSelection.request, payload));
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
            message: `model-plan handler failure: ${error instanceof Error ? error.message : String(error)}`,
            details: {},
        });
    }
}
/**
 * Register the `/model-plan` channel once the connection service becomes
 * available.
 * @param ctx - the host plugin context.
 */
export function registerModelPlanWire(ctx) {
    ctx.inject(['connection'], (connectionCtx) => {
        const connection = connectionCtx.connection;
        connectionCtx.effect(() => connection.rpc.handle(MODEL_PLAN_CHANNEL, (endpoint, payload, signal) => dispatchModelPlan(connectionCtx.get('modelPlans'), endpoint, payload, signal), { authority: AUTHORITY }), 'dsh-model-plan: /model-plan rpc channel');
    });
}
/**
 * Cordis plugin body for the `/model-plan` channel. Mounted as a host row in
 * the profile's cordis.patch.yml, registering the wire without coupling it to
 * the plan registry's constructor.
 * @param ctx - the host plugin context.
 */
export function apply(ctx) {
    registerModelPlanWire(ctx);
}
/** A deployment with no plan registry answers an empty roster, not an error. */
async function list(plans) {
    if (plans === undefined) {
        return ok({ plans: [], authorable: false });
    }
    const roster = await plans.list();
    return ok({
        plans: roster.map(plan => planEntry(plan)),
        authorable: plans.authorable,
    });
}
async function read(plans, request) {
    if (plans === undefined)
        return fail(noPlans(request.id));
    try {
        const plan = await plans.resolve(request.id);
        return ok({ plan: planEntry(plan) });
    }
    catch (error) {
        return fail(planFailure(request.id, error));
    }
}
async function create(plans, request) {
    if (plans === undefined)
        return fail(noPlans(request.id));
    try {
        await plans.create(request.id, {
            provider: request.provider,
            model: request.model,
            ...request.params === undefined ? {} : { params: toParams(request.params) },
            ...request.default === undefined ? {} : { default: request.default },
        });
        return ok({ id: request.id });
    }
    catch (error) {
        return fail(planFailure(request.id, error));
    }
}
async function update(plans, request) {
    if (plans === undefined)
        return fail(noPlans(request.id));
    try {
        await plans.update(request.id, {
            ...request.provider === undefined ? {} : { provider: request.provider },
            ...request.model === undefined ? {} : { model: request.model },
            ...request.params === undefined ? {} : { params: toParams(request.params) },
            ...request.default === undefined ? {} : { default: request.default },
        });
        return ok({ id: request.id });
    }
    catch (error) {
        return fail(planFailure(request.id, error));
    }
}
async function remove(plans, request) {
    if (plans === undefined)
        return fail(noPlans(request.id));
    try {
        await plans.remove(request.id);
        return ok({});
    }
    catch (error) {
        return fail(planFailure(request.id, error));
    }
}
async function select(plans, request) {
    if (plans === undefined)
        return fail(noPlans(request.sessionId));
    try {
        const state = await plans.select(request.sessionId, request.planId, request.overrides === undefined ? undefined : toParams(request.overrides));
        return ok({
            planId: request.planId,
            overrides: state.overrides,
        });
    }
    catch (error) {
        return fail(selectionFailure(request.sessionId, error));
    }
}
async function readSelection(plans, request) {
    if (plans === undefined)
        return fail(noPlans(request.sessionId));
    try {
        const state = await plans.readSelection(request.sessionId);
        return ok({
            ...state.planId === undefined ? {} : { planId: state.planId },
            overrides: state.overrides,
        });
    }
    catch (error) {
        return fail(selectionFailure(request.sessionId, error));
    }
}
/**
 * Narrow a wire params record onto the registry's `PlanParams` vocabulary. The
 * zod record schema widens keys to `string | number | symbol`, which the
 * registry's string-keyed bag does not accept; the wire already validated the
 * values are JSON, so this is a compile-time narrowing at the dispatch seam.
 */
function toParams(bag) {
    return bag;
}
/** One plan's roster/detail entry on the wire. */
function planEntry(plan) {
    return {
        id: plan.id,
        provider: plan.provider,
        model: plan.model,
        params: plan.params,
        trust: plan.trust,
        isDefault: plan.isDefault,
        ...plan.broken === undefined ? {} : { broken: plan.broken },
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
        message: `model-plan channel does not serve endpoint "${endpoint}"`,
        details: { issues: [] },
    };
}
/** The not-found shape when no plan registry is composed. */
function noPlans(id) {
    return {
        code: 'model-plan-not-found',
        message: 'this deployment composes no model plans',
        details: { plan: id, available: [] },
    };
}
/** Map one authoring/roster failure onto the wire codes. */
function planFailure(plan, error) {
    if (error instanceof UnknownPlanError) {
        return {
            code: 'model-plan-not-found',
            message: error.message,
            details: { plan: error.planId, available: [...error.available] },
        };
    }
    if (error instanceof PlanNotWritableError) {
        return {
            code: 'model-plan-read-only',
            message: error.message,
            details: { plan, reason: error.message },
        };
    }
    if (error instanceof InvalidPlanIdError) {
        return {
            code: 'model-plan-invalid',
            message: error.message,
            details: { plan, reason: error.message },
        };
    }
    if (error instanceof PlanExistsError) {
        return {
            code: 'model-plan-exists',
            message: error.message,
            details: { plan, reason: error.message },
        };
    }
    if (error instanceof PlanRouteInvalidError) {
        return {
            code: 'model-plan-invalid',
            message: error.message,
            details: { plan, reason: error.message },
        };
    }
    return { code: 'internal', message: `plan "${plan}": ${String(error)}`, details: {} };
}
/** Map one selection failure onto the wire vocabulary. */
function selectionFailure(sessionId, error) {
    if (error instanceof UnknownPlanError) {
        return {
            code: 'model-plan-not-found',
            message: error.message,
            details: { plan: error.planId, available: [...error.available] },
        };
    }
    // A started session cannot change its plan binding — the same blank-window
    // lock the team mode and the agent preset carry. Typed, so the code is pinned
    // by `instanceof`, never by matching a message string.
    if (error instanceof PlanLockedError) {
        return {
            code: 'model-plan-locked',
            message: error.message,
            details: { sessionId },
        };
    }
    const message = error instanceof Error ? error.message : String(error);
    return { code: 'internal', message: `session "${sessionId}": ${message}`, details: { sessionId } };
}
//# sourceMappingURL=index.js.map