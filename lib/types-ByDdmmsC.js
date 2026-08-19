import { PLAN_ID, UnknownPlanError } from "./types.js";
import { createMergeHandler } from "./merge.js";
import { currentPlanSelection, planLocked } from "./selection.js";
import { Service } from "@deepseek-ai/cordis";
import z from "@deepseek-ai/schemastery";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { mkdir, readFile, readdir, rm } from "node:fs/promises";
import { writeFileAtomic } from "@deepseek-ai/dsh-atomic-write";
import yaml from "js-yaml";
//#region lib/types/home-path.js
/**
* Self-contained harness-home path helpers.
*
* The model-plan user root is authored under the harness home
* (`$DSH_HOME/.dsh/model-plans`, or the default `~/.dsh/model-plans`). The
* official package exporting these helpers, `@deepseek-ai/dsh-home-paths`, is
* only an optional peer dependency and is NOT present in the hot-mount (cordis
* loader) environment — so, exactly as the subagent bundle does, this module
* re-implements the two helpers the bundle needs (`dshHomePath` and
* `expandHomePath`) with byte-for-byte identical behaviour, using only Node's
* own `node:os`/`node:path` modules. Nothing here imports from outside this
* package, so the compiled entries resolve on any environment where this
* bundle itself resolves.
*
* @module dsh-harness-model-plan-bundle/home-path
*/
/** Directory name for the default DeepSeek Harness home under the OS home. */
const DSH_HOME_DIR_NAME = ".dsh";
/** Environment variable that overrides the default DeepSeek Harness home. */
const DSH_HOME_ENV = "DSH_HOME";
/**
* Resolve the default DeepSeek Harness home using Node's platform path rules.
* @returns the absolute default harness home path.
*/
function defaultDshHome() {
	return join(homedir(), DSH_HOME_DIR_NAME);
}
/**
* Expand supported tilde prefixes against the operating-system home.
* @param path - configured path that may begin with `~`, `~/`, or `~\`.
* @returns the expanded path, or the original value when no supported prefix is present.
*/
function expandHomePath(path) {
	if (path === "~") return homedir();
	if (path.startsWith("~/") || path.startsWith("~\\")) return join(homedir(), path.slice(2));
	return path;
}
/**
* Resolve the single-root DeepSeek Harness home.
*
* Precedence, highest first: an explicit configured path, `$DSH_HOME`, then
* `~/.dsh`. The harness keeps all user data under one root. An empty or
* whitespace-only `$DSH_HOME` is treated as unset, so a blank override never
* resolves the home to the current working directory.
* @param configured - explicit harness-home override, which has highest precedence.
* @param env - environment mapping used to read `DSH_HOME`.
* @returns the normalized absolute harness home path.
*/
function resolveDshHome(configured, env = process.env) {
	const fromEnv = env[DSH_HOME_ENV];
	const selected = configured ?? (fromEnv !== void 0 && fromEnv.trim().length > 0 ? fromEnv : defaultDshHome());
	return resolve(expandHomePath(selected));
}
/**
* Join path segments onto the resolved DeepSeek Harness home.
* @param segments - path segments appended to the Harness home; an empty list returns the home itself.
* @returns the normalized absolute joined path.
*/
function dshHomePath(...segments) {
	return join(resolveDshHome(), ...segments);
}
//#endregion
//#region lib/types/metadata.js
/** A non-empty trimmed string, or undefined for anything else. */
function text(value) {
	if (typeof value !== "string") return void 0;
	const trimmed = value.trim();
	return trimmed === "" ? void 0 : trimmed;
}
/** A literal boolean, or undefined for anything else. */
function flag(value) {
	return typeof value === "boolean" ? value : void 0;
}
/** Read a plan's `params` bag as a JSON-safe record, or undefined when unusable. */
function paramsOf(value) {
	if (value === void 0) return { params: {} };
	if (typeof value !== "object" || value === null || Array.isArray(value)) return {
		params: {},
		broken: "the plan \"params\" must be a map of key=value entries"
	};
	return { params: value };
}
/**
* Parse a plan file's contents into its plan shape. Malformed shape is
* surfaced as a whole-plan `broken` reason.
* @param id - the plan id (the directory name).
* @param trust - the trust recorded from the root this plan was found under.
* @param path - the absolute path of the `plan.yml` file.
* @param content - the file's raw text.
* @returns the parsed plan, or a plan carrying a whole-plan `broken` reason.
*/
function parsePlan(id, trust, path, content) {
	let parsed;
	try {
		parsed = yaml.load(content);
	} catch {
		return {
			id,
			trust,
			path,
			provider: "",
			model: "",
			params: {},
			isDefault: false,
			broken: "the plan file is not valid YAML"
		};
	}
	if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {
		id,
		trust,
		path,
		provider: "",
		model: "",
		params: {},
		isDefault: false,
		broken: "the plan file must be a YAML map"
	};
	const record = parsed;
	const name = text(record.name);
	const provider = text(record.provider);
	const model = text(record.model);
	const isDefault = flag(record.default) ?? false;
	const paramsParsed = paramsOf(record.params);
	if (provider === void 0 || model === void 0) return {
		id,
		trust,
		path,
		provider: "",
		model: "",
		params: {},
		isDefault,
		broken: "the plan must pin both a \"provider\" and a \"model\""
	};
	return {
		id,
		...name === void 0 ? {} : { name },
		provider,
		model,
		params: paramsParsed?.params ?? {},
		trust,
		path,
		isDefault,
		...paramsParsed?.broken !== void 0 ? { broken: paramsParsed.broken } : {}
	};
}
//#endregion
//#region lib/types/discovery.js
/**
* Filesystem discovery of model plans.
*
* A plan is a directory holding a {@link PLAN_FILE} (`plan.yml`); the
* directory name is the plan id. Discovery re-reads the roots on every call so
* a plan authored while the process is running is visible without a restart.
* Each root holds one subdirectory per plan, mirroring the team/subagent
* discovery layout.
*
* Discovery owns whole-plan HEALTH: a directory whose `plan.yml` is missing or
* malformed is reported as a broken roster row rather than skipped, so the id
* stays visible and deletable.
* @module dsh-harness-model-plan-bundle/discovery
*/
/** The file that makes a directory a plan. */
const PLAN_FILE = "plan.yml";
/**
* Harness-home directory holding locally authored plans.
* Mirrors `USER_TEAM_DIR` (`teams`) in the subagent bundle: this package owns
* the writable plan root the same way, and the app supplies the SHIPPED root.
*/
const USER_PLAN_DIR = "model-plans";
/**
* Scan one root for plan directories.
*
* An absent root yields no plans rather than throwing (the user root does not
* exist until the first locally authored plan). Every directory whose name is
* a usable plan id is a roster row — broken when its `plan.yml` is missing or
* malformed. A directory named outside {@link PLAN_ID} is skipped.
* @param root - the directory and the trust its plans inherit.
* @returns the root's plans ordered by id.
*/
async function scanRoot(root) {
	const dir = resolve(expandHomePath(root.path));
	let children;
	try {
		children = await readdir(dir, { withFileTypes: true });
	} catch (error) {
		if (error.code === "ENOENT") return [];
		throw new Error(`model-plans: cannot read plan root ${dir}: ${String(error)}`, { cause: error });
	}
	const found = [];
	for (const child of children) {
		if (!child.isDirectory() || !PLAN_ID.test(child.name)) continue;
		found.push(await readPlan(child.name, root.trust, join(dir, child.name)));
	}
	return found.sort((left, right) => left.id.localeCompare(right.id));
}
/**
* Scan every root in precedence order.
* @param roots - roots in precedence order; an earlier root wins a duplicate id.
* @returns every discovered plan, first-root-wins per id.
*/
async function discoverPlans(roots) {
	const byId = /* @__PURE__ */ new Map();
	for (const root of roots) for (const plan of await scanRoot(root)) {
		if (byId.has(plan.id)) continue;
		byId.set(plan.id, plan);
	}
	return [...byId.values()];
}
/**
* Read and parse one plan directory's `plan.yml`.
* @param id - the plan id (the directory name).
* @param trust - the trust recorded from the root this plan was found under.
* @param directory - the plan directory.
* @returns the parsed plan, or a plan carrying a whole-plan `broken` reason
*   when the file is missing or unreadable.
*/
async function readPlan(id, trust, directory) {
	const path = join(directory, PLAN_FILE);
	let content;
	try {
		content = await readFile(path, "utf8");
	} catch {
		return {
			id,
			trust,
			path,
			provider: "",
			model: "",
			params: {},
			isDefault: false,
			broken: `the plan file ${PLAN_FILE} is missing — the directory still occupies the id; delete it or restore the file`
		};
	}
	return parsePlan(id, trust, path, content);
}
//#endregion
//#region lib/types/authoring.js
/**
* Reading, creating, editing, deleting, and defaulting locally authored model
* plans.
*
* Authoring is confined to a `user` root: the shipped `config/model-plans/`
* set is part of the deployment, and letting a browser rewrite it would turn
* "reset to a known plan" into something the same caller could have broken
* first.
*
* A plan is one directory holding a `plan.yml` carrying the plan's display
* metadata, its pinned route, its params bag, and an optional default marker.
* Creation writes a fresh `plan.yml`; updates rewrite the whole file; the
* default marker is a metadata-only write that flips the flags so at most one
* plan per trust is the default.
* @module dsh-harness-model-plan-bundle/authoring
*/
/** A plan id that cannot be used as a directory name under a root. */
var InvalidPlanIdError = class extends Error {
	planId;
	constructor(planId) {
		super(`model-plans: plan id ${JSON.stringify(planId)} must match ${String(PLAN_ID)} — the id is a directory name, so anything else could escape the plan root`);
		this.planId = planId;
	}
};
/** A create target that is already occupied — a create never overwrites. */
var PlanExistsError = class extends Error {
	planId;
	constructor(planId) {
		super(`model-plans: plan "${planId}" already exists — a create never overwrites; delete the existing plan first or choose another id`);
		this.planId = planId;
	}
};
/** Authoring was attempted where the deployment allows none. */
var PlanNotWritableError = class extends Error {
	planId;
	constructor(planId, reason) {
		super(`model-plans: plan "${planId}" cannot be written: ${reason}`);
		this.planId = planId;
	}
};
/** The route a plan must pin: both `provider` and `model` are required. */
var PlanRouteInvalidError = class extends Error {
	planId;
	constructor(planId, reason) {
		super(`model-plans: plan "${planId}" cannot be written: ${reason}`);
		this.planId = planId;
	}
};
/**
* The root locally authored plans are written to.
* @param roots - the configured roots in precedence order.
* @returns the absolute path of the first `user` root.
* @throws when the deployment configured no writable root.
*/
function writableRoot(roots) {
	const root = roots.find((candidate) => candidate.trust === "user");
	if (root === void 0) throw new PlanNotWritableError("", "this deployment configures no user-writable plan root");
	return resolve(expandHomePath(root.path));
}
/** Validate an id for use as a plan directory name (a containment boundary). */
function assertUsableId(id) {
	if (!PLAN_ID.test(id)) throw new InvalidPlanIdError(id);
}
/** A plan's route must pin a provider and a model (the merge routes on them). */
function assertRoute(planId, provider, model) {
	if (provider === void 0 || provider === "" || model === void 0 || model === "") throw new PlanRouteInvalidError(planId, "a plan must pin both a \"provider\" and a \"model\"");
}
/**
* Render a plan's fields back into `plan.yml` text.
*
* Absent fields are omitted rather than emitted as null/empty, so the stored
* file stays minimal and reads cleanly. The params bag is emitted under
* `params`; a falsey default is omitted (an absent marker means not-default).
* @param plan - the plan to render.
* @returns the `plan.yml` contents.
*/
function renderPlan(plan) {
	const document = {
		provider: plan.provider,
		model: plan.model
	};
	if (plan.name !== void 0) document.name = plan.name;
	if (Object.keys(plan.params).length > 0) document.params = plan.params;
	if (plan.isDefault) document.default = true;
	return yaml.dump(document, {
		lineWidth: -1,
		noRefs: true
	});
}
/** Whether anything occupies the path (a create's own backstop). */
async function occupied(path) {
	let present = true;
	try {
		await readFile(path, "utf8");
	} catch {
		present = false;
	}
	return present;
}
/**
* Create a locally authored plan from an initial set of fields.
*
* The new plan directory is created under the first `user` root and its
* `plan.yml` written atomically. The id becomes the directory name, so it is
* validated as a containment boundary before anything touches disk.
* @param roots - the configured roots; the first `user` one receives the plan.
* @param id - the new plan's id, which becomes its directory name.
* @param edits - the plan's fields (name/provider/model/params/default).
* @returns the absolute path of the new plan directory.
* @throws when the id is unusable or already occupied, the route is unusable,
* or the deployment configures no writable root.
*/
async function createPlan(roots, id, edits) {
	assertUsableId(id);
	assertRoute(id, edits.provider, edits.model);
	const dir = join(writableRoot(roots), id);
	const file = join(dir, PLAN_FILE);
	if (await occupied(file)) throw new PlanExistsError(id);
	const provider = edits.provider;
	const model = edits.model;
	try {
		await mkdir(dir, { recursive: true });
		await writeFileAtomic(file, renderPlan({
			...edits.name === void 0 ? {} : { name: edits.name },
			provider,
			model,
			params: edits.params ?? {},
			isDefault: edits.default === true
		}), {
			mode: 384,
			dirMode: 448
		});
	} catch (error) {
		await rm(dir, {
			recursive: true,
			force: true
		});
		throw error;
	}
	return dir;
}
/**
* Rewrite one locally authored plan's `plan.yml` as a WHOLE.
*
* A shipped plan is refused, exactly like delete — its install is not the
* user's to manage. The plan's file is confined to the writable root by a
* path-prefix check on top of trust, so an id that collides with a path
* outside the root can never be rewritten.
* @param roots - the configured roots.
* @param plan - the resolved plan to edit.
* @param edits - the complete fields to store.
* @throws when the plan ships with the deployment or lies outside the writable
* root, or the route is unusable.
*/
async function updatePlan(roots, plan, edits) {
	if (plan.trust !== "user") throw new PlanNotWritableError(plan.id, "it ships with the deployment");
	const dir = join(writableRoot(roots), plan.id);
	if (!isAbsolute(plan.path) || !plan.path.startsWith(dir)) throw new PlanNotWritableError(plan.id, "it does not live under the writable plan root");
	const provider = edits.provider ?? plan.provider;
	const model = edits.model ?? plan.model;
	assertRoute(plan.id, provider, model);
	await writeFileAtomic(plan.path, renderPlan({
		...edits.name !== void 0 ? { name: edits.name } : plan.name !== void 0 ? { name: plan.name } : {},
		provider,
		model,
		params: edits.params ?? plan.params,
		isDefault: edits.default ?? plan.isDefault
	}), {
		mode: 384,
		dirMode: 448
	});
}
/**
* Delete a locally authored plan.
*
* A shipped plan is refused: it belongs to the deployment. A plan whose id a
* live session bound is NOT refused — the reference semantics mean the next
* request simply fails to resolve the deleted plan, which the merge
* interceptor logs and falls back on.
* @param roots - the configured roots.
* @param plan - the resolved plan to remove.
* @throws when the plan ships with the deployment or lies outside the writable
* root.
*/
async function deletePlan(roots, plan) {
	if (plan.trust !== "user") throw new PlanNotWritableError(plan.id, "it ships with the deployment");
	const dir = join(writableRoot(roots), plan.id);
	if (!isAbsolute(plan.path) || !plan.path.startsWith(dir)) throw new PlanNotWritableError(plan.id, "it does not live under the writable plan root");
	await rm(dir, {
		recursive: true,
		force: true
	});
}
/**
* Flip one locally authored plan's default marker to `true`, clearing any
* other plan in the SAME trust that was the default (a trust has at most one
* default). A shipped plan is refused — the deployment owns its defaults.
* @param roots - the configured roots.
* @param plan - the resolved plan to make the default.
* @throws when the plan ships with the deployment or lies outside the writable
* root.
*/
async function setPlanDefault(roots, plan) {
	if (plan.trust !== "user") throw new PlanNotWritableError(plan.id, "it ships with the deployment");
	const dir = join(writableRoot(roots), plan.id);
	if (!isAbsolute(plan.path) || !plan.path.startsWith(dir)) throw new PlanNotWritableError(plan.id, "it does not live under the writable plan root");
	const rootDir = writableRoot(roots);
	let children = [];
	try {
		children = await readdir(rootDir, { withFileTypes: true });
	} catch {
		children = [];
	}
	for (const child of children) {
		if (!child.isDirectory() || !PLAN_ID.test(child.name)) continue;
		if (child.name === plan.id) continue;
		const sibling = await readPlan(child.name, "user", join(rootDir, child.name));
		if (sibling.broken === void 0 && sibling.isDefault) await writeFileAtomic(sibling.path, renderPlan({
			...sibling.name === void 0 ? {} : { name: sibling.name },
			provider: sibling.provider,
			model: sibling.model,
			params: sibling.params,
			isDefault: false
		}), {
			mode: 384,
			dirMode: 448
		});
	}
	const current = await readPlan(plan.id, "user", dirname(plan.path));
	await writeFileAtomic(plan.path, renderPlan({
		...current.name === void 0 ? {} : { name: current.name },
		provider: current.broken === void 0 ? current.provider : plan.provider,
		model: current.broken === void 0 ? current.model : plan.model,
		params: current.broken === void 0 ? current.params : plan.params,
		isDefault: true
	}), {
		mode: 384,
		dirMode: 448
	});
}
//#endregion
//#region lib/types/index.js
/**
* dsh-harness-model-plan-bundle — the Harness-owned "模型方案" (model-plan)
* capability as a profile bundle. The package's substance is
* `cordis.patch.yml`, declared by the `dsh.bundle.patch` manifest field and
* resolved by the profile composer through that field; this host half
* registers the `modelPlans` service (the registry, the per-session selection
* ledger, and the merge interceptor) and the `/model-plan` management wire.
* @module dsh-harness-model-plan-bundle
*/
/**
* Registry over the deployment's model plans, plus the per-session selection
* ledger and the merge interceptor.
*
* Discovery is unmemoized: `list()` and `resolve()` re-read the roots on every
* call so a plan authored while the process runs is visible immediately, and
* the merge interceptor re-resolves the bound plan on every request so editing
* a plan's file changes what a bound session uses on its NEXT request
* (reference semantics — never retrofits the past).
*/
var ModelPlans = class extends Service {
	config;
	/** Runtime schema for the plan registry. */
	static Config = z.object({
		roots: z.array(z.object({
			path: z.string().required(),
			trust: z.union(["system", "user"]).default("user")
		})).default([]),
		includeUserRoot: z.boolean().default(true)
	});
	/** The roots discovery actually scans: configured roots, then the harness-home user root. */
	resolvedRoots;
	constructor(ctx, config) {
		super(ctx, "modelPlans");
		this.config = config;
		this.resolvedRoots = config.includeUserRoot ? [...config.roots, {
			path: dshHomePath(USER_PLAN_DIR),
			trust: "user"
		}] : [...config.roots];
		ctx.on("agent/created", (payload) => {
			payload.agent.ctx.on("agent/request", createMergeHandler({
				selectionOf: (events) => currentPlanSelection(events),
				resolvePlan: (id) => this.resolveForMerge(id),
				logger: this.ctx.logger
			}));
		});
	}
	/**
	* Every plan the configured roots currently supply.
	* @returns the plans, first-root-wins per id.
	*/
	async list() {
		return discoverPlans(this.resolvedRoots);
	}
	/**
	* Whether this deployment composes a writable user root (the management
	* surface's authoring gate).
	*/
	get authorable() {
		return this.resolvedRoots.some((root) => root.trust === "user");
	}
	/**
	* Resolve one plan by id.
	*
	* A broken plan resolves — deleting one, reading one, and reporting one all
	* need the row — and the selection/merge paths refuse it AFTER resolution.
	* @param id - the plan id.
	* @returns the resolved plan.
	* @throws when no configured root supplies that id.
	*/
	async resolve(id) {
		const plans = await this.list();
		const found = plans.find((plan) => plan.id === id);
		if (found === void 0) throw new UnknownPlanError(id, plans.map((plan) => plan.id));
		return found;
	}
	/**
	* Resolve a plan for the MERGE interceptor: only the fields it needs, with
	* the plan's CURRENT file contents (reference semantics), and only when the
	* plan is usable. A missing or broken bound plan yields `undefined` — the
	* interceptor then logs and falls back to the official route rather than
	* failing the request.
	* @param id - the plan id.
	* @returns the plan's current route and params, or undefined when unusable.
	*/
	async resolveForMerge(id) {
		const plan = await this.resolve(id).catch(() => void 0);
		if (plan === void 0 || plan.broken !== void 0) return void 0;
		return {
			provider: plan.provider,
			model: plan.model,
			params: plan.params
		};
	}
	/**
	* Create a locally authored plan.
	* @param id - the new plan's id (its directory name).
	* @param edits - the plan's initial fields.
	* @returns the absolute path of the new plan directory.
	*/
	async create(id, edits) {
		return createPlan(this.resolvedRoots, id, edits);
	}
	/**
	* Rewrite one locally authored plan.
	* @param id - the plan id.
	* @param edits - any subset of the plan's fields to replace.
	* @throws when the plan ships with the deployment, is unknown, or the route is unusable.
	*/
	async update(id, edits) {
		const plan = await this.resolve(id);
		await updatePlan(this.resolvedRoots, plan, edits);
	}
	/**
	* Delete a locally authored plan.
	* @param id - the plan id.
	* @throws when the plan ships with the deployment or is unknown.
	*/
	async remove(id) {
		const plan = await this.resolve(id);
		await deletePlan(this.resolvedRoots, plan);
	}
	/**
	* Make one locally authored plan the deployment default, clearing any other
	* user default.
	* @param id - the plan id.
	* @throws when the plan ships with the deployment or is unknown.
	*/
	async setDefault(id) {
		const plan = await this.resolve(id);
		if (plan.broken !== void 0) throw new Error(`model-plans: plan "${id}" cannot be the default: ${plan.broken}`);
		await setPlanDefault(this.resolvedRoots, plan);
	}
	/**
	* Bind a session to a plan, recording the durable selection.
	*
	* The session is bound to a PLAN, never a bare model. The durable truth is a
	* log-only `model-plan/select` event marked `ignorable: true`; the merge
	* interceptor folds it on the session's next request. An optional session
	* `overrides` bag rides ABOVE the plan's own params in the merge priority.
	*
	* The binding (like the team mode and the agent preset) is locked once a turn
	* has run — the request the model already saw was produced under the previous
	* route, and swapping mid-flight would strand the logged call.
	* @param sessionId - the session to bind.
	* @param planId - the plan to bind.
	* @param overrides - session-level temporary params riding above the plan's.
	* @throws when the session has no live agent, has already started, or names a
	* broken/unknown plan.
	*/
	async select(sessionId, planId, overrides) {
		const session = this.ctx.get("sessions")?.get(sessionId);
		if (session === void 0) throw new Error(`model-plans: no live session "${sessionId}"; cannot bind a plan to it`);
		if (planLocked(session.events)) throw new Error(`model-plans: session "${sessionId}" has already started; its plan binding is fixed`);
		const plan = await this.resolve(planId);
		if (plan.broken !== void 0) throw new Error(`model-plans: plan "${planId}" cannot be bound: ${plan.broken}`);
		session.append.bind(session)("model-plan/select", {
			planId,
			...overrides === void 0 ? {} : { overrides }
		}, true);
		const state = currentPlanSelection(session.events);
		this.ctx.emit("model-plan/selected", sessionId, state);
		return state;
	}
	/**
	* Read a session's current folded plan selection.
	* @param sessionId - the session to read.
	* @returns the session's folded selection state (plan id + overrides), or
	* the empty selection when the session binds no plan.
	*/
	async readSelection(sessionId) {
		const session = this.ctx.get("sessions")?.get(sessionId);
		if (session === void 0) return { overrides: {} };
		return currentPlanSelection(session.events);
	}
};
//#endregion
export { PlanRouteInvalidError as a, setPlanDefault as c, PLAN_FILE as d, USER_PLAN_DIR as f, PlanNotWritableError as i, updatePlan as l, scanRoot as m, InvalidPlanIdError as n, createPlan as o, discoverPlans as p, PlanExistsError as r, deletePlan as s, ModelPlans as t, writableRoot as u };
