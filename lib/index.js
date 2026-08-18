import { RestartRequiredError, parsePatch } from "./patch.js";
import { ActivationTimeout, HOT_DIR, HOT_MOUNT_TIMEOUT_MS, HOT_ROW_PREFIX, HotManager, clearPackageLoadCache } from "./hot.js";
import { fileURLToPath } from "node:url";
import { Service, getTraceable } from "@deepseek-ai/cordis";
import { z } from "zod";
//#region lib/types/service.js
/**
* The `ctx.harnessHot` capability seam: a cordis Service exposing the harness
* hot mount/unmount/upgrade/list surface, backed by a {@link HotManager}.
*
* The service derives the active profile directory from the loader's `baseUrl`
* (which `bootApp` pins to the profile directory); a caller may override it
* per call when the deployment owns the profile location (e.g. an explicit
* `profileDir`), matching how the market's hosts do.
*
* The manager wipes its hot-input directory when the service starts, so a
* crash can never leave a file that collides with the bundle layer at the next
* boot.
* @module dsh-harness-hot-bundle/service
*/
/** Zod schema validating the row config at the plugin boundary. */
const harnessHotConfigSchema = z.object({ autoMount: z.array(z.string().min(1)).optional() });
/**
* Resolve the active profile directory. The loader's `baseUrl` is pinned to
* the profile directory by `bootApp`; when that is unavailable (no loader, or
* a baseUrl outside the expected shape) return null so the caller must pass an
* explicit `profileDir`.
*/
function deriveProfileDir(ctx) {
	const baseUrl = ctx.baseUrl;
	if (typeof baseUrl !== "string" || baseUrl === "") return null;
	try {
		const path = fileURLToPath(baseUrl);
		return path.endsWith("/") || path.endsWith("\\") ? path.slice(0, -1) : path;
	} catch {
		return null;
	}
}
/**
* The harness hot surface (`ctx.harnessHot`).
*/
var HarnessHot = class extends Service {
	static inject = ["loader"];
	defaultProfileDir;
	manager;
	autoMount;
	constructor(ctx, config) {
		super(ctx, "harnessHot");
		this.defaultProfileDir = deriveProfileDir(ctx);
		this.manager = new HotManager(this.defaultProfileDir ?? process.cwd());
		this.autoMount = Object.freeze([...config?.autoMount ?? []]);
		this.manager.cleanHotDir();
	}
	/**
	* Mount every configured package as the service activates. Runs as the
	* class-plugin init hook (the fiber awaits it), so this row settles only
	* once the whole list has been attempted; one package's failure is logged
	* and skipped rather than failing the tree.
	*/
	async [Service.init]() {
		for (const packageName of this.autoMount) try {
			await this.mount({ package: packageName });
		} catch (error) {
			this.logger()?.warn?.(`[dsh-harness-hot] auto-mount of ${packageName} failed: ${error instanceof Error ? error.message : String(error)}`);
		}
	}
	/** The deployment's logger service, when one is composed. */
	logger() {
		return this.ctx.get("logger");
	}
	/** The profile directory this service derives, or null when unavailable. */
	get profileDir() {
		return this.defaultProfileDir;
	}
	resolveManager(profileDir) {
		if (profileDir === void 0) {
			if (this.defaultProfileDir === null) throw new Error("harness-hot: no profile directory available — pass an explicit profileDir");
			return this.manager;
		}
		if (profileDir === this.defaultProfileDir) return this.manager;
		return new HotManager(profileDir);
	}
	/**
	* Hot-mount a package into the running composition.
	* @param target - the package to mount and an optional profile override.
	* @returns the mount record.
	* @throws a `RestartRequiredError` when the patch cannot hot-mount, or an
	* activation/timeout error when the subtree fails to settle.
	*/
	async mount(target) {
		return await this.resolveManager(target.profileDir).mount(this.withStaticRows(this.hostCtx()), target.package);
	}
	/**
	* Hot-unmount a package, removing it from the running composition.
	* @param packageName - the package to unmount.
	* @returns the disposed record, or null when nothing was mounted.
	*/
	async unmount(packageName) {
		return await this.manager.unmount(packageName, this.withStaticRows(this.hostCtx()));
	}
	/**
	* Hot-upgrade a same-name package by evicting its module cache and re-mounting.
	* @param target - the package to upgrade and an optional profile override.
	* @returns the new mount record.
	* @throws when the deployment does not expose module-loader internals.
	*/
	async upgrade(target) {
		const ctx = this.hostCtx();
		return await this.resolveManager(target.profileDir).upgrade(this.withStaticRows(ctx), ctx.loader, target.package);
	}
	/**
	* The host context WITHOUT the cordis shadow the wire's traceable call
	* wraps this service instance in.
	*
	* The `/harness-hot` channel calls `service.mount()` through a traceable
	* wrapper, whose method invocation swaps `this` onto a shadow context (a
	* `ctx.extend({ [shadow]: origin })` child). That shadow propagates through
	* every `ctx.extend()` the Include subtree performs, so a live re-mount's
	* entry fibers resolve their context against the `harnessHot` service fiber
	* instead of their own — and a provider row (`spawn`/`fork`/`tool`) that
	* injects `subagents` then fails with "cannot get property \"subagents\"
	* without inject" (the shadow fiber never declares that inject). Boot does
	* not hit this because `autoMount` runs inside `[Service.init]` where the
	* service context carries no shadow. Stripping the shadow restores the
	* plain service context, making a hot re-mount identical to the boot mount.
	*/
	hostCtx() {
		return getTraceable(this.ctx, this.ctx);
	}
	/**
	* The root (boot) tree's entry group holding the static rows. The bootstrap
	* include is mounted under the fixed id `'include'` (see app-boot's
	* `mountRootInclude`), so its `subgroup` is the root entry group whose
	* `data` lists every static row.
	*/
	staticRootGroup(ctx) {
		const loader = ctx.get("loader");
		if (loader === void 0) return void 0;
		return (loader.store?.["include"])?.subgroup;
	}
	/**
	* Build the static-row adapter for a host context: runtime-disable/restore
	* a static root-tree row in memory only — the loader's `Entry.update` disposes
	* the fiber without persisting, and we mirror the disabled flag onto the root
	* group's `data` array so a later recomposition does not resurrect the static
	* copy while the hot row owns its registration.
	*/
	staticRowsAdapter(ctx) {
		const loader = ctx.get("loader");
		const rootGroup = this.staticRootGroup(ctx);
		const findRow = (id) => rootGroup?.data.find((row) => row.id === id);
		const findEntry = (id) => {
			if (loader === void 0) return void 0;
			try {
				return loader.resolve(id);
			} catch {
				return;
			}
		};
		return {
			has: (id) => findRow(id) !== void 0,
			disable: async (id) => {
				const row = findRow(id);
				if (row === void 0) return;
				row.disabled = true;
				const entry = findEntry(id);
				if (entry?.fiber) await entry.update({ disabled: true });
			},
			restore: async (id) => {
				const row = findRow(id);
				if (row === void 0) return;
				row.disabled = false;
				const entry = findEntry(id);
				if (entry) await entry.update({ disabled: false });
			}
		};
	}
	/** The host context carrying the static-row adapter the hot core needs. */
	withStaticRows(ctx) {
		return Object.assign(ctx, { staticRows: this.staticRowsAdapter(ctx) });
	}
	/** The current hot-mount list, in mount order. */
	list() {
		return this.manager.list();
	}
};
//#endregion
//#region lib/types/wire/schema.js
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
/** One hot-mount row reported by `list`. */
const wireMountRowSchema = z.object({
	package: z.string(),
	rowIds: z.array(z.string()),
	mountedAt: z.number()
});
/** mount request payload. */
const wireMountRequestSchema = z.object({
	package: z.string().min(1),
	profileDir: z.string().optional()
});
/** mount response value. */
const wireMountValueSchema = z.object({
	package: z.string(),
	rowIds: z.array(z.string()),
	mountedAt: z.number()
});
/** unmount request payload. */
const wireUnmountRequestSchema = z.object({ package: z.string().min(1) });
/** unmount response value (null when nothing was mounted). */
const wireUnmountValueSchema = z.object({
	package: z.string(),
	rowIds: z.array(z.string()),
	mountedAt: z.number()
}).nullable();
/** upgrade request payload. */
const wireUpgradeRequestSchema = z.object({
	package: z.string().min(1),
	profileDir: z.string().optional()
});
/** upgrade response value. */
const wireUpgradeValueSchema = z.object({
	package: z.string(),
	rowIds: z.array(z.string()),
	mountedAt: z.number()
});
/** list request payload. */
const wireListRequestSchema = z.object({});
/** list response value. */
const wireListValueSchema = z.array(wireMountRowSchema);
/** shutdown request payload (empty). */
const wireShutdownRequestSchema = z.object({});
/** shutdown response value. */
const wireShutdownValueSchema = z.object({ shuttingDown: z.boolean() });
/** The full harness-hot surface: endpoint name → request/value schemas. */
const wireEndpoints = {
	mount: {
		request: wireMountRequestSchema,
		value: wireMountValueSchema
	},
	unmount: {
		request: wireUnmountRequestSchema,
		value: wireUnmountValueSchema
	},
	upgrade: {
		request: wireUpgradeRequestSchema,
		value: wireUpgradeValueSchema
	},
	list: {
		request: wireListRequestSchema,
		value: wireListValueSchema
	},
	shutdown: {
		request: wireShutdownRequestSchema,
		value: wireShutdownValueSchema
	}
};
//#endregion
//#region lib/types/wire/index.js
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
/** Absolute logical channel owning the harness-hot endpoints. */
const HARNESS_HOT_CHANNEL = "/harness-hot";
/** Loopback-pinned authority: hot-mounting/upgrading is privileged. */
const AUTHORITY = "loopback";
/**
* Parse and dispatch one endpoint against the harness-hot service.
* @param service - the `harnessHot` service (the deployment may compose none).
* @param endpoint - the channel-relative endpoint name.
* @param payload - the unvalidated request payload.
* @param signal - caller/connection lifetime.
* @param host - host facts the shutdown endpoint reads (`appExit`).
* @returns the validated result, or the matching failure.
*/
async function dispatchHarnessHot(service, endpoint, payload, signal, host = {}) {
	try {
		if (service === void 0) return fail({
			code: "hot-not-found",
			message: "this deployment composes no harnessHot service",
			details: {}
		});
		switch (endpoint) {
			case "mount": return await mount(service, parse(wireEndpoints.mount.request, payload), signal);
			case "unmount": return await unmount(service, parse(wireEndpoints.unmount.request, payload), signal);
			case "upgrade": return await upgrade(service, parse(wireEndpoints.upgrade.request, payload), signal);
			case "list": return await list(service, signal);
			case "shutdown": return await shutdown(service, parse(wireEndpoints.shutdown.request, payload), signal, host.appExit);
			default: return fail(badEndpointError(endpoint));
		}
	} catch (error) {
		if (error instanceof BadRequestError) return fail({
			code: "bad-request",
			message: `invalid payload for ${endpoint}`,
			details: { issues: error.issues }
		});
		if (error instanceof RestartRequiredError) return fail({
			code: "hot-restart-required",
			message: error.message,
			details: { reason: error.message }
		});
		return fail({
			code: "internal",
			message: `harness-hot handler failure: ${error instanceof Error ? error.message : String(error)}`,
			details: { causes: flattenErrorMessages(error) }
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
function flattenErrorMessages(error) {
	const out = [];
	walkError(error, out, 0);
	return out;
}
/** Depth-first emit each error's own message; stop below a sane nesting ceiling. */
function walkError(error, out, depth) {
	if (depth > 8) return;
	if (!(error instanceof Error)) return;
	const children = error instanceof AggregateError ? error.errors : error.cause === void 0 ? [] : [error.cause];
	out.push(error.message);
	for (const child of children) walkError(child, out, depth + 1);
}
/** Hot-mount one package. */
async function mount(service, request, signal) {
	const record = await service.mount({
		package: request.package,
		...request.profileDir === void 0 ? {} : { profileDir: request.profileDir }
	});
	signal.throwIfAborted();
	return ok({
		package: record.package,
		rowIds: record.rowIds,
		mountedAt: record.mountedAt
	});
}
/** Hot-unmount one package. */
async function unmount(service, request, signal) {
	const record = await service.unmount(request.package);
	signal.throwIfAborted();
	if (record === null) return ok(null);
	return ok({
		package: record.package,
		rowIds: record.rowIds,
		mountedAt: record.mountedAt
	});
}
/** Hot-upgrade one package. */
async function upgrade(service, request, signal) {
	const record = await service.upgrade({
		package: request.package,
		...request.profileDir === void 0 ? {} : { profileDir: request.profileDir }
	});
	signal.throwIfAborted();
	return ok({
		package: record.package,
		rowIds: record.rowIds,
		mountedAt: record.mountedAt
	});
}
/** List the current hot mounts. */
async function list(service, signal) {
	const records = service.list();
	signal.throwIfAborted();
	return ok(records.map((record) => ({
		package: record.package,
		rowIds: record.rowIds,
		mountedAt: record.mountedAt
	})));
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
	if (appExit === void 0) return fail({
		code: "no-exit-service",
		message: "this deployment does not provide an appExit service — cannot shut down",
		details: {}
	});
	signal.throwIfAborted();
	setTimeout(() => {
		appExit(0);
	}, 0);
	return ok({ shuttingDown: true });
}
/**
* Register the `/harness-hot` channel once the connection service becomes
* available. Called by the profile bundle that composes a web deployment.
* @param ctx - the host plugin context.
*/
function registerHarnessHotWire(ctx) {
	ctx.inject(["connection"], (connectionCtx) => {
		const connection = connectionCtx.connection;
		connectionCtx.effect(() => connection.rpc.handle(HARNESS_HOT_CHANNEL, (endpoint, payload, signal) => dispatchHarnessHot(connectionCtx.get("harnessHot"), endpoint, payload, signal, { appExit: connectionCtx.get("appExit") }), { authority: AUTHORITY }), "dsh-harness-hot: /harness-hot rpc channel");
	});
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
		message: `harness-hot channel does not serve endpoint "${endpoint}"`,
		details: { issues: [] }
	};
}
//#endregion
//#region lib/types/index.js
/**
* dsh-harness-hot-bundle — the Harness-owned hot mount/upgrade surface as a
* profile bundle. The package's substance is `cordis.patch.yml` (declared by
* the `dsh.bundle.patch` manifest field) plus the host `harnessHot` service
* and its loopback-pinned `/harness-hot` RPC channel. Pure host package: there
* is no browser half.
*
* The mounted `harness-hot` host row provides `ctx.harnessHot` (mount/unmount/
* upgrade/list) and registers the `/harness-hot` connection channel through
* which a client calls it.
* @module dsh-harness-hot-bundle
*/
/**
* Host plugin body: provide the `harnessHot` service and register the
* `/harness-hot` loopback channel. The row's config carries the autoMount
* list — packages the service hot-mounts as it activates, so a business
* plugin lives entirely on this surface (no static bundle row) yet still
* comes back after every restart.
* @param ctx - the host plugin context.
* @param config - the row config (`autoMount` list); invalid shapes fail loud.
*/
function apply(ctx, config) {
	ctx.plugin(HarnessHot, parseRowConfig(config));
	registerHarnessHotWire(ctx);
}
/** Validate the loader row config at the plugin boundary. */
function parseRowConfig(config) {
	if (config === void 0 || config === null) return {};
	return harnessHotConfigSchema.parse(config);
}
//#endregion
export { ActivationTimeout, HARNESS_HOT_CHANNEL, HOT_DIR, HOT_MOUNT_TIMEOUT_MS, HOT_ROW_PREFIX, HarnessHot, HotManager, RestartRequiredError, apply, clearPackageLoadCache, deriveProfileDir, dispatchHarnessHot, harnessHotConfigSchema, parsePatch, registerHarnessHotWire };
