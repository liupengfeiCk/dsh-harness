import { a as PlanRouteInvalidError, i as PlanNotWritableError, n as InvalidPlanIdError, r as PlanExistsError } from "../types-ByDdmmsC.js";
import { UnknownPlanError } from "../types.js";
import { z } from "zod";
//#region lib/types/wire/schema.js
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
/** A JSON value carried by the params bag on the wire. */
const jsonValueSchema = z.lazy(() => z.union([
	z.string(),
	z.number(),
	z.boolean(),
	z.null(),
	z.array(jsonValueSchema),
	z.record(z.string(), jsonValueSchema)
]));
/**
* A bag of arbitrary key=value plan params on the wire. Carried as a plain
* record of JSON values; callers narrow it to `PlanParams` (string keys) at
* the dispatch boundary.
*/
const wireParamsSchema = z.record(z.string(), jsonValueSchema);
/** A plan's trust on the wire, mirroring `PlanTrust`. */
const wireTrustSchema = z.union([z.literal("system"), z.literal("user")]);
/** One plan roster row. */
const wirePlanEntrySchema = z.object({
	id: z.string().min(1),
	name: z.string().optional(),
	provider: z.string(),
	model: z.string(),
	params: wireParamsSchema,
	trust: wireTrustSchema,
	isDefault: z.boolean(),
	broken: z.string().optional()
});
/** modelPlan.list request payload (no fields). */
const wireListRequestSchema = z.object({});
/** modelPlan.list response value. */
const wireListValueSchema = z.object({
	plans: z.array(wirePlanEntrySchema),
	authorable: z.boolean()
});
/** modelPlan.read request payload. */
const wireReadRequestSchema = z.object({ id: z.string().min(1) });
/** modelPlan.read response value. */
const wireReadValueSchema = z.object({ plan: wirePlanEntrySchema });
/** modelPlan.create request payload: a new id plus its initial fields. */
const wireCreateRequestSchema = z.object({
	id: z.string().min(1),
	name: z.string().optional(),
	provider: z.string(),
	model: z.string(),
	params: wireParamsSchema.optional(),
	default: z.boolean().optional()
});
/** modelPlan.create response value. */
const wireCreateValueSchema = z.object({ id: z.string() });
/** modelPlan.update request payload: any subset of the plan's fields. */
const wireUpdateRequestSchema = z.object({
	id: z.string().min(1),
	name: z.string().optional(),
	provider: z.string().optional(),
	model: z.string().optional(),
	params: wireParamsSchema.optional(),
	default: z.boolean().optional()
});
/** modelPlan.update response value. */
const wireUpdateValueSchema = z.object({ id: z.string() });
/** modelPlan.remove request payload. */
const wireRemoveRequestSchema = z.object({ id: z.string().min(1) });
/** modelPlan.remove response value (empty). */
const wireRemoveValueSchema = z.object({});
/** modelPlan.select request payload: the session to bind, the plan, and an optional session overrides bag. */
const wireSelectRequestSchema = z.object({
	sessionId: z.string().min(1),
	planId: z.string().min(1),
	/** Session-level temporary params riding above the plan's own params. */
	overrides: wireParamsSchema.optional()
});
/** modelPlan.select response value: the folded selection now active. */
const wireSelectValueSchema = z.object({
	planId: z.string(),
	overrides: wireParamsSchema
});
/** modelPlan.readSelection request payload. */
const wireReadSelectionRequestSchema = z.object({ sessionId: z.string().min(1) });
/** modelPlan.readSelection response value: the session's current folded selection. */
const wireReadSelectionValueSchema = z.object({
	planId: z.string().optional(),
	overrides: wireParamsSchema
});
/** The full management surface: endpoint name → request/value schemas. */
const wireEndpoints = {
	list: {
		request: wireListRequestSchema,
		value: wireListValueSchema
	},
	read: {
		request: wireReadRequestSchema,
		value: wireReadValueSchema
	},
	create: {
		request: wireCreateRequestSchema,
		value: wireCreateValueSchema
	},
	update: {
		request: wireUpdateRequestSchema,
		value: wireUpdateValueSchema
	},
	remove: {
		request: wireRemoveRequestSchema,
		value: wireRemoveValueSchema
	},
	select: {
		request: wireSelectRequestSchema,
		value: wireSelectValueSchema
	},
	readSelection: {
		request: wireReadSelectionRequestSchema,
		value: wireReadSelectionValueSchema
	}
};
//#endregion
//#region lib/types/wire/index.js
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
/** Absolute logical channel owning the model-plan management endpoints. */
const MODEL_PLAN_CHANNEL = "/model-plan";
/** Loopback-pinned authority: managing plans is privileged. */
const AUTHORITY = "loopback";
/**
* Parse and dispatch one endpoint against the plan registry.
* @param plans - the plan registry service (the deployment may compose none).
* @param endpoint - the channel-relative endpoint name.
* @param payload - the unvalidated request payload.
* @param signal - caller/connection lifetime.
* @returns the validated result, or the matching failure.
*/
async function dispatchModelPlan(plans, endpoint, payload, signal) {
	try {
		switch (endpoint) {
			case "list": return await list(plans);
			case "read": return await read(plans, parse(wireEndpoints.read.request, payload));
			case "create": return await create(plans, parse(wireEndpoints.create.request, payload));
			case "update": return await update(plans, parse(wireEndpoints.update.request, payload));
			case "remove": return await remove(plans, parse(wireEndpoints.remove.request, payload));
			case "select": return await select(plans, parse(wireEndpoints.select.request, payload));
			case "readSelection": return await readSelection(plans, parse(wireEndpoints.readSelection.request, payload));
			default: return fail(badEndpointError(endpoint));
		}
	} catch (error) {
		if (error instanceof BadRequestError) return fail({
			code: "bad-request",
			message: `invalid payload for ${endpoint}`,
			details: { issues: error.issues }
		});
		return fail({
			code: "internal",
			message: `model-plan handler failure: ${error instanceof Error ? error.message : String(error)}`,
			details: {}
		});
	}
}
/**
* Register the `/model-plan` channel once the connection service becomes
* available.
* @param ctx - the host plugin context.
*/
function registerModelPlanWire(ctx) {
	ctx.inject(["connection"], (connectionCtx) => {
		const connection = connectionCtx.connection;
		connectionCtx.effect(() => connection.rpc.handle(MODEL_PLAN_CHANNEL, (endpoint, payload, signal) => dispatchModelPlan(connectionCtx.get("modelPlans"), endpoint, payload, signal), { authority: AUTHORITY }), "dsh-model-plan: /model-plan rpc channel");
	});
}
/**
* Cordis plugin body for the `/model-plan` channel. Mounted as a host row in
* the profile's cordis.patch.yml, registering the wire without coupling it to
* the plan registry's constructor.
* @param ctx - the host plugin context.
*/
function apply(ctx) {
	registerModelPlanWire(ctx);
}
/** A deployment with no plan registry answers an empty roster, not an error. */
async function list(plans) {
	if (plans === void 0) return ok({
		plans: [],
		authorable: false
	});
	return ok({
		plans: (await plans.list()).map((plan) => planEntry(plan)),
		authorable: plans.authorable
	});
}
async function read(plans, request) {
	if (plans === void 0) return fail(noPlans(request.id));
	try {
		return ok({ plan: planEntry(await plans.resolve(request.id)) });
	} catch (error) {
		return fail(planFailure(request.id, error));
	}
}
async function create(plans, request) {
	if (plans === void 0) return fail(noPlans(request.id));
	try {
		await plans.create(request.id, {
			...request.name === void 0 ? {} : { name: request.name },
			provider: request.provider,
			model: request.model,
			...request.params === void 0 ? {} : { params: toParams(request.params) },
			...request.default === void 0 ? {} : { default: request.default }
		});
		return ok({ id: request.id });
	} catch (error) {
		return fail(planFailure(request.id, error));
	}
}
async function update(plans, request) {
	if (plans === void 0) return fail(noPlans(request.id));
	try {
		await plans.update(request.id, {
			...request.name === void 0 ? {} : { name: request.name },
			...request.provider === void 0 ? {} : { provider: request.provider },
			...request.model === void 0 ? {} : { model: request.model },
			...request.params === void 0 ? {} : { params: toParams(request.params) },
			...request.default === void 0 ? {} : { default: request.default }
		});
		return ok({ id: request.id });
	} catch (error) {
		return fail(planFailure(request.id, error));
	}
}
async function remove(plans, request) {
	if (plans === void 0) return fail(noPlans(request.id));
	try {
		await plans.remove(request.id);
		return ok({});
	} catch (error) {
		return fail(planFailure(request.id, error));
	}
}
async function select(plans, request) {
	if (plans === void 0) return fail(noPlans(request.sessionId));
	try {
		const state = await plans.select(request.sessionId, request.planId, request.overrides === void 0 ? void 0 : toParams(request.overrides));
		return ok({
			planId: request.planId,
			overrides: state.overrides
		});
	} catch (error) {
		return fail(selectionFailure(request.sessionId, error));
	}
}
async function readSelection(plans, request) {
	if (plans === void 0) return fail(noPlans(request.sessionId));
	try {
		const state = await plans.readSelection(request.sessionId);
		return ok({
			...state.planId === void 0 ? {} : { planId: state.planId },
			overrides: state.overrides
		});
	} catch (error) {
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
		...plan.name === void 0 ? {} : { name: plan.name },
		provider: plan.provider,
		model: plan.model,
		params: plan.params,
		trust: plan.trust,
		isDefault: plan.isDefault,
		...plan.broken === void 0 ? {} : { broken: plan.broken }
	};
}
/** Parse one endpoint's payload; a malformed shape throws BadRequestError. */
function parse(schema, payload) {
	const parsed = schema.safeParse(payload);
	if (!parsed.success) throw new BadRequestError(parsed.error.issues);
	return parsed.data;
}
/** A malformed endpoint payload; thrown inside parse and folded by dispatch. */
var BadRequestError = class extends Error {
	issues;
	constructor(issues) {
		super("invalid payload");
		this.issues = issues;
	}
};
/** Success branch of a wire result. */
function ok(value) {
	return {
		ok: true,
		value
	};
}
/** Failure branch of a wire result. */
function fail(error) {
	return {
		ok: false,
		error
	};
}
/** Fail-closed code for an endpoint this channel does not serve. */
function badEndpointError(endpoint) {
	return {
		code: "bad-request",
		message: `model-plan channel does not serve endpoint "${endpoint}"`,
		details: { issues: [] }
	};
}
/** The not-found shape when no plan registry is composed. */
function noPlans(id) {
	return {
		code: "model-plan-not-found",
		message: "this deployment composes no model plans",
		details: {
			plan: id,
			available: []
		}
	};
}
/** Map one authoring/roster failure onto the wire codes. */
function planFailure(plan, error) {
	if (error instanceof UnknownPlanError) return {
		code: "model-plan-not-found",
		message: error.message,
		details: {
			plan: error.planId,
			available: [...error.available]
		}
	};
	if (error instanceof PlanNotWritableError) return {
		code: "model-plan-read-only",
		message: error.message,
		details: {
			plan,
			reason: error.message
		}
	};
	if (error instanceof InvalidPlanIdError) return {
		code: "model-plan-invalid",
		message: error.message,
		details: {
			plan,
			reason: error.message
		}
	};
	if (error instanceof PlanExistsError) return {
		code: "model-plan-exists",
		message: error.message,
		details: {
			plan,
			reason: error.message
		}
	};
	if (error instanceof PlanRouteInvalidError) return {
		code: "model-plan-invalid",
		message: error.message,
		details: {
			plan,
			reason: error.message
		}
	};
	return {
		code: "internal",
		message: `plan "${plan}": ${String(error)}`,
		details: {}
	};
}
/** Map one selection failure onto the wire vocabulary. */
function selectionFailure(sessionId, error) {
	if (error instanceof UnknownPlanError) return {
		code: "model-plan-not-found",
		message: error.message,
		details: {
			plan: error.planId,
			available: [...error.available]
		}
	};
	const message = error instanceof Error ? error.message : String(error);
	if (message.includes("already started")) return {
		code: "model-plan-locked",
		message,
		details: { sessionId }
	};
	return {
		code: "internal",
		message: `session "${sessionId}": ${message}`,
		details: { sessionId }
	};
}
//#endregion
export { MODEL_PLAN_CHANNEL, apply, dispatchModelPlan, registerModelPlanWire };
