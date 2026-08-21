import { Service } from "@deepseek-ai/cordis";
import z from "@deepseek-ai/schemastery";
import { DatabaseSync } from "node:sqlite";
import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
//#region lib/types/tasks/types.js
/**
* Task-entity vocabulary for the memory bundle.
*
* A Task is the DSH counterpart of the TencentDB Agent Memory concept "persistent
* business task" (design §3.4 / §7 F10): a durable work arrangement owned by the
* MAIN conversation dimension. A task carries a goal, a lifecycle
* (`running` → `completed`), and the set of responsible roles WITH their
* intra-task division of labour. Child (delegated) sessions are the task's
* execution units and never hold the task themselves — they attach to it through
* the association ledger (`TaskSession`), and the task id becomes a memory
* filtering dimension parallel to team/role/project (design §4.1).
*
* @module dsh-harness-memory-bundle/tasks/types
*/
/** The default: active tasks only. */
const DEFAULT_TASK_FILTER = { includeCompleted: false };
/** A task was not found. */
var UnknownTaskError = class extends Error {
	taskId;
	available;
	constructor(taskId, available) {
		super(`task "${taskId}" does not exist (available: ${available.length === 0 ? "none" : available.join(", ")})`);
		this.taskId = taskId;
		this.available = available;
		this.name = "UnknownTaskError";
	}
};
/** A create/update payload was invalid. */
var InvalidTaskInputError = class extends Error {
	constructor(reason) {
		super(`invalid task input: ${reason}`);
		this.name = "InvalidTaskInputError";
	}
};
//#endregion
//#region lib/types/tasks/paths.js
/**
* Self-contained harness-home path helpers for the task store.
*
* The task table lives under the harness home (`$DSH_HOME/.dsh/memory/tasks`,
* or the default `~/.dsh/memory/tasks`). The official package exporting these
* helpers, `@deepseek-ai/dsh-home-paths`, is only an optional peer dependency
* and is NOT present in the hot-mount (cordis loader) environment — so, exactly
* as the subagent and model-plan bundles do, this module re-implements the two
* helpers the store needs (`dshHomePath` and `expandHomePath`) with
* byte-for-byte identical behaviour, using only Node's own
* `node:os`/`node:path` modules.
*
* The memory bundle's skeleton will own a shared `src/home-path.ts`; this
* module is kept self-contained so the task store can be tested and run before
* the skeleton lands, and can later be switched to import the shared helper
* without behaviour change.
* @module dsh-harness-memory-bundle/tasks/paths
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
* `~/.dsh`. An empty or whitespace-only `$DSH_HOME` is treated as unset.
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
/** The default tasks database file under the harness home. */
const TASK_DB_FILE = "tasks.db";
/** The default absolute path of the tasks database. */
function taskDbPath() {
	return dshHomePath("memory", "tasks", TASK_DB_FILE);
}
/** Parse a roles JSON column, failing loud on corruption. */
function parseRoles(json) {
	try {
		const value = JSON.parse(json);
		if (!Array.isArray(value)) throw new Error("roles column is not an array");
		return value;
	} catch (error) {
		throw new Error(`task roles column holds invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
	}
}
/** Resolve the tasks database path, honouring an explicit override and `:memory:`. */
function resolveDbPath(explicit) {
	return explicit === void 0 || explicit === ":memory:" ? explicit ?? taskDbPath() : resolve(explicit);
}
/**
* The task store: CRUD, associations, filtering, and completion downweighting.
*/
var TaskStore = class TaskStore {
	db;
	stmts;
	/**
	* @param path - database path; `:memory:` for tests, undefined for the default
	*   harness-home path. Missing directories/files are created owner-only.
	*/
	constructor(path) {
		this.db = new DatabaseSync(path);
		this.configure(path);
		this.stmts = this.prepare();
	}
	/** Open a store. See {@link TaskStore.constructor}. */
	static open(path) {
		return new TaskStore(resolveDbPath(path));
	}
	/** Open an in-memory store for tests. */
	static openMemory() {
		return new TaskStore(":memory:");
	}
	configure(path) {
		this.db.exec("PRAGMA foreign_keys = ON");
		const { user_version: onDisk } = this.db.prepare("PRAGMA user_version").get();
		if (onDisk !== 0 && onDisk !== 1) throw new Error(`tasks database at "${path}" has schema version ${onDisk}, incompatible with this build (1)`);
		this.db.exec(`
      CREATE TABLE IF NOT EXISTS tasks (
        id          TEXT PRIMARY KEY,
        title       TEXT NOT NULL,
        goal        TEXT NOT NULL,
        status      TEXT NOT NULL CHECK (status IN ('running', 'completed')),
        roles_json  TEXT NOT NULL,
        created_at  TEXT NOT NULL,
        completed_at TEXT
      ) STRICT
    `);
		this.db.exec(`
      CREATE TABLE IF NOT EXISTS task_sessions (
        task_id     TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        session_id  TEXT NOT NULL,
        role_id     TEXT,
        kind        TEXT NOT NULL CHECK (kind IN ('session', 'delegation')),
        attached_at TEXT NOT NULL,
        PRIMARY KEY (task_id, session_id)
      ) STRICT
    `);
		this.db.exec("CREATE INDEX IF NOT EXISTS task_sessions_session ON task_sessions (session_id)");
		if (onDisk === 0) this.db.exec(`PRAGMA user_version = 1`);
	}
	prepare() {
		return {
			insert: this.db.prepare("INSERT INTO tasks (id, title, goal, status, roles_json, created_at, completed_at) VALUES (?, ?, ?, ?, ?, ?, ?)"),
			update: this.db.prepare("UPDATE tasks SET title = ?, goal = ?, roles_json = ? WHERE id = ?"),
			complete: this.db.prepare("UPDATE tasks SET status = ?, completed_at = ? WHERE id = ?"),
			find: this.db.prepare(`SELECT id, title, goal, status, roles_json AS rolesJson, created_at AS createdAt, completed_at AS completedAt
         FROM tasks WHERE id = ?`),
			listAll: this.db.prepare(`SELECT id, title, goal, status, roles_json AS rolesJson, created_at AS createdAt, completed_at AS completedAt
         FROM tasks ORDER BY created_at ASC`),
			listActive: this.db.prepare(`SELECT id, title, goal, status, roles_json AS rolesJson, created_at AS createdAt, completed_at AS completedAt
         FROM tasks WHERE status = 'running' ORDER BY created_at ASC`),
			insertSession: this.db.prepare(`INSERT INTO task_sessions (task_id, session_id, role_id, kind, attached_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(task_id, session_id) DO UPDATE SET role_id = excluded.role_id, kind = excluded.kind, attached_at = excluded.attached_at`),
			sessionsFor: this.db.prepare(`SELECT session_id AS sessionId, role_id AS roleId, kind, attached_at AS attachedAt
         FROM task_sessions WHERE task_id = ? ORDER BY attached_at ASC`),
			removeSession: this.db.prepare("DELETE FROM task_sessions WHERE task_id = ? AND session_id = ?")
		};
	}
	/**
	* Create a task.
	* @param input - title, goal, and optional responsible roles.
	* @returns the persisted task.
	* @throws InvalidTaskInputError on a missing title/goal.
	*/
	create(input) {
		const title = input.title.trim();
		const goal = input.goal.trim();
		if (title.length === 0) throw new InvalidTaskInputError("title must not be empty");
		if (goal.length === 0) throw new InvalidTaskInputError("goal must not be empty");
		const roles = validateRoles(input.roles);
		const id = randomUUID();
		const now = (/* @__PURE__ */ new Date()).toISOString();
		this.db.exec("BEGIN");
		try {
			this.stmts.insert.run(id, title, goal, "running", JSON.stringify(roles), now, null);
			this.db.exec("COMMIT");
		} catch (error) {
			this.db.exec("ROLLBACK");
			throw error;
		}
		return this.hydrate({
			id,
			title,
			goal,
			status: "running",
			rolesJson: JSON.stringify(roles),
			createdAt: now,
			completedAt: null
		}, []);
	}
	/**
	* Update a task's title/goal/roles.
	* @param id - the task id.
	* @param input - any subset of the mutable fields.
	* @throws UnknownTaskError when the task does not exist.
	*/
	update(id, input) {
		const row = this.requireRow(id);
		const title = input.title === void 0 ? row.title : input.title.trim();
		const goal = input.goal === void 0 ? row.goal : input.goal.trim();
		if (title.length === 0) throw new InvalidTaskInputError("title must not be empty");
		if (goal.length === 0) throw new InvalidTaskInputError("goal must not be empty");
		const roles = input.roles === void 0 ? parseRoles(row.rolesJson) : validateRoles(input.roles);
		this.stmts.update.run(title, goal, JSON.stringify(roles), id);
		const updated = {
			...row,
			title,
			goal,
			rolesJson: JSON.stringify(roles)
		};
		return this.hydrate(updated, this.sessionsForId(id));
	}
	/**
	* Mark a task completed (idempotent).
	* @param id - the task id.
	* @returns the updated task.
	* @throws UnknownTaskError when the task does not exist.
	*/
	complete(id) {
		const row = this.requireRow(id);
		if (row.status === "running") {
			const now = (/* @__PURE__ */ new Date()).toISOString();
			this.stmts.complete.run("completed", now, id);
			const updated = {
				...row,
				status: "completed",
				completedAt: now
			};
			return this.hydrate(updated, this.sessionsForId(id));
		}
		return this.hydrate(row, this.sessionsForId(id));
	}
	/**
	* List tasks. By default completed tasks are EXCLUDED (the downweighting rule);
	* pass `includeCompleted: true` to surface them explicitly.
	* @param filter - optional list filter.
	*/
	list(filter = DEFAULT_TASK_FILTER) {
		return (filter.includeCompleted ?? false ? this.stmts.listAll : this.stmts.listActive).all().map((row) => this.hydrate(row, this.sessionsForId(row.id)));
	}
	/**
	* Read one task.
	* @param id - the task id.
	* @throws UnknownTaskError when the task does not exist.
	*/
	read(id) {
		const row = this.requireRow(id);
		return this.hydrate(row, this.sessionsForId(id));
	}
	/**
	* The ids of tasks the memory engine should treat as active for filtering —
	* completed tasks are excluded by default, so a completed task's memories are
	* downweighted (they still exist, but are not offered as active filters).
	*/
	activeTaskIds() {
		return this.stmts.listActive.all().map((row) => row.id);
	}
	/**
	* Whether a task is completed — the memory engine downweights L0/L1 for a
	* completed task by default and surfaces them only on an explicit query.
	* @param id - the task id.
	* @returns true when the task exists and is completed; false when running or missing.
	*/
	isCompleted(id) {
		const row = this.stmts.find.get(id);
		return row !== void 0 && row.status === "completed";
	}
	/**
	* Associate a session with a task (会话挂任务 or 委派挂任务).
	* @param taskId - the task id.
	* @param sessionId - the session to attach.
	* @param roleId - the role that ran the session (delegation attaches it).
	* @param kind - how the association was made.
	* @throws UnknownTaskError when the task does not exist.
	*/
	attachSession(taskId, sessionId, roleId, kind) {
		const row = this.requireRow(taskId);
		const trimmed = sessionId.trim();
		if (trimmed.length === 0) throw new InvalidTaskInputError("sessionId must not be empty");
		const now = (/* @__PURE__ */ new Date()).toISOString();
		this.stmts.insertSession.run(row.id, trimmed, roleId ?? null, kind, now);
		return this.hydrate(row, this.sessionsForId(row.id));
	}
	/** Remove a session association (used by tests and cleanup). */
	detachSession(taskId, sessionId) {
		this.stmts.removeSession.run(taskId, sessionId);
	}
	/** Close the database connection. */
	close() {
		this.db.close();
	}
	requireRow(id) {
		const row = this.stmts.find.get(id);
		if (row === void 0) throw new UnknownTaskError(id, this.stmts.listAll.all().map((r) => r.id));
		return row;
	}
	sessionsForId(taskId) {
		return this.stmts.sessionsFor.all(taskId).map((s) => ({
			sessionId: s.sessionId,
			...s.roleId === null ? {} : { roleId: s.roleId },
			kind: s.kind,
			attachedAt: s.attachedAt
		}));
	}
	hydrate(row, sessions) {
		return {
			id: row.id,
			title: row.title,
			goal: row.goal,
			status: row.status,
			roles: parseRoles(row.rolesJson),
			createdAt: row.createdAt,
			completedAt: row.completedAt,
			sessions
		};
	}
};
/** Validate the responsible-roles list, mapping bad shapes to InvalidTaskInputError. */
function validateRoles(roles) {
	if (roles === void 0) return [];
	for (const role of roles) {
		if (typeof role.roleId !== "string" || role.roleId.trim().length === 0) throw new InvalidTaskInputError("each role must have a non-empty roleId");
		if (typeof role.division !== "string" || role.division.trim().length === 0) throw new InvalidTaskInputError(`role "${role.roleId}" must have a non-empty division`);
	}
	return roles;
}
/** Ensure the tasks directory exists with owner-only permissions. */
async function ensureTasksDirectory() {
	await mkdir(dirname(resolveDbPath(void 0)), {
		recursive: true,
		mode: 448
	});
}
z.object({ dbPath: z.string().default(void 0) });
/**
* The task registry: wraps the SQLite {@link TaskStore} behind the cordis
* service boundary, so the wire and the main-agent tool share one store and
* the memory engine queries it through a stable interface.
*/
var Tasks = class extends Service {
	config;
	/** The backing store; also exposed so host code can close it. */
	store;
	constructor(ctx, config) {
		super(ctx, "tasks");
		this.config = config;
		this.store = TaskStore.open(config.dbPath);
		ensureTasksDirectory().catch(() => {});
		ctx.effect(() => {
			const store = this.store;
			return () => store.close();
		}, "dsh-memory-tasks: dispose store");
	}
	/** Create a task (管理界面 wire / 主代理 create_task 工具两入口共用). */
	create(input) {
		const task = this.store.create(input);
		this.ctx.emit("memory/task-changed", task.id, task.status);
		return task;
	}
	/** Update a task's title/goal/roles. */
	update(id, input) {
		return this.store.update(id, input);
	}
	/** Mark a task completed (idempotent). */
	complete(id) {
		const task = this.store.complete(id);
		this.ctx.emit("memory/task-changed", task.id, task.status);
		return task;
	}
	/** List tasks; completed tasks are excluded by default (downweighting). */
	list(filter) {
		return this.store.list(filter);
	}
	/** Read one task. */
	read(id) {
		return this.store.read(id);
	}
	/** The ids of active (non-completed) tasks — the memory engine's filter set. */
	activeTaskIds() {
		return this.store.activeTaskIds();
	}
	/** Whether a task is completed — the memory engine downweights completed-task L0/L1. */
	isCompleted(id) {
		return this.store.isCompleted(id);
	}
	/**
	* Associate a session with a task (委派挂任务 / 会话挂任务).
	* @param taskId - the task id.
	* @param sessionId - the associated session.
	* @param roleId - the role that ran the session, when known.
	* @param kind - how the association was made.
	*/
	attachSession(taskId, sessionId, roleId, kind = "session") {
		return this.store.attachSession(taskId, sessionId, roleId, kind);
	}
	/** Remove a session association. */
	detachSession(taskId, sessionId) {
		this.store.detachSession(taskId, sessionId);
	}
};
//#endregion
//#region lib/types/compaction/types.js
/**
* Session-internal hierarchical compaction subsystem — shared types, data
* model, and the injected dependency interfaces.
*
* This is the self-built (non-vendor) compaction mechanism for §4.3 of the
* memory-system design: when the session's raw history crosses the compression
* line, the old raw text is folded into layered summaries (near = detailed,
* far = coarse). The summaries plus cross-session memory share one injection
* cap; when that cap is hit, summaries are recursively coarsened — information
* is never dropped, only granularity is lost. Each layer is persisted so a
* resumed session can reuse it and a coarser layer can be refined back from
* storage.
*
* The core is intentionally a PURE data model over plain message/token data
* (no cordis/Session runtime), so every policy is unit-testable in isolation.
* The volatile seam (an LLM summarizer) and the durable seams (summary storage,
* raw-text store) are injected interfaces.
*
* @module dsh-harness-memory-bundle/compaction/types
*/
/** Defaults per the design (independent ratios, no mutual derivation). */
const DEFAULT_COMPACTION_CONFIG = {
	compressionLineRatio: .8,
	retentionRatio: .16,
	injectionCapRatio: .2
};
/** Domain errors thrown by the compaction subsystem. */
var CompactionError = class extends Error {};
/** A config ratio is out of range or a window/context is unusable. */
var CompactionConfigError = class extends CompactionError {};
/** The compaction engine is asked to operate on an empty or invalid history. */
var NoCompressibleHistoryError = class extends CompactionError {};
/** A persisted layer could not be recovered (missing/corrupt), non-fatal. */
var LayerRecoveryError = class extends CompactionError {};
/** A requested raw/summary retrieval range has no stored coverage. */
var NoCoverageError = class extends CompactionError {};
/**
* Honest-boundary signal: summaries reached the coarsest useful layer but
* still exceed the injection cap. Per §4.3 we stop and rely on L0 storage plus
* the refine (recall) chain rather than distorting further.
*/
var CoarseningFloorError = class extends CompactionError {
	remainingTokens;
	capTokens;
	constructor(remainingTokens, capTokens) {
		super(`coarsening floor reached with ${remainingTokens} tokens still above the ${capTokens} injection cap; rely on L0 storage and the refine chain instead of further distortion`);
		this.remainingTokens = remainingTokens;
		this.capTokens = capTokens;
	}
};
//#endregion
//#region lib/types/compaction/select.js
/**
* Pure selection policies: which raw span to compress, how to partition it
* into hierarchical layers (near = detailed, far = coarse), and how to keep
* cuts on message/tool-pair boundaries.
*
* All functions here are pure over the plain `CompactionMessage` model — no
* cordis or Session runtime — so every policy is unit-testable.
*
* @module dsh-harness-memory-bundle/compaction/select
*/
/** Whether `messages[index]` is a safe cut: it does not split a tool pair. */
function isBalancedBoundary(messages, index) {
	if (index < 0 || index >= messages.length) return false;
	const message = messages[index];
	if (message.role === "tool" && message.toolResultForCallId !== void 0) return false;
	if (message.role === "assistant" && message.toolCallId !== void 0) return false;
	return true;
}
/**
* Select the compactable raw span: keep a recent tail of at least
* `retainTokens` verbatim (cut only at a balanced message boundary), and return
* everything before that tail as the compressible span.
*
* Matching the official `selectCompactableRange` semantics, we accumulate from
* the tail backward until we reach `retainTokens`, then back up to a balanced
* boundary so the compression never splits a tool-call/result pair.
* @param messages - ordered raw messages (surface order).
* @param retainTokens - minimum recent-tail token budget kept verbatim.
* @returns the inclusive message-index span [startIndex, endIndex] to compress,
*   or `null` when nothing may be compressed (empty, all retained, or the whole
*   history is one indivisible block).
*/
function selectCompressibleRange(messages, retainTokens) {
	if (messages.length === 0) return null;
	let accumulated = 0;
	let keepFromIndex = messages.length;
	for (let index = messages.length - 1; index >= 0; index -= 1) {
		accumulated += messages[index].tokens;
		keepFromIndex = index;
		if (accumulated >= retainTokens) break;
	}
	if (keepFromIndex === 0) return null;
	while (keepFromIndex > 0 && !isBalancedBoundary(messages, keepFromIndex - 1)) keepFromIndex -= 1;
	if (keepFromIndex === 0) return null;
	const startIndex = 0;
	const endIndex = keepFromIndex - 1;
	if (startIndex > endIndex) return null;
	return [startIndex, endIndex];
}
/**
* Partition a compressible message-index span into hierarchical layer bands,
* near = detailed (one message per final band, dense) and far = coarse (fewer,
* bigger bands). Higher `level` covers a larger (coarser) span.
*
* The partition is deterministic: near-end messages occupy the finest level
* (level 1, one message each conceptually) and bands grow coarser as the
* span's age increases. We derive the coarsest band first from the far end,
* then progressively finer bands toward the near end, so the boundary between
* fine and coarse is smooth rather than abrupt.
*
* @param messages - ordered raw messages.
* @param span - inclusive [startIndex, endIndex] from `selectCompressibleRange`.
* @param levels - number of summary layers to produce (>= 1). When the span is
*   too short to meaningfully subdivide, we degrade to a single level.
* @returns the ordered layer bands, coarsest (highest level) first.
*/
function partitionLayers(messages, span, levels) {
	const [startIndex, endIndex] = span;
	const count = endIndex - startIndex + 1;
	if (count <= 0) throw new NoCompressibleHistoryError("cannot partition an empty span");
	const effectiveLevels = Math.max(1, Math.floor(levels));
	if (effectiveLevels === 1 || count <= effectiveLevels) return [{
		startIndex,
		endIndex,
		tokens: sliceTokens(messages, startIndex, endIndex)
	}];
	const bands = [];
	let cursor = startIndex;
	for (let band = 0; band < effectiveLevels - 1; band += 1) {
		const remainingBands = effectiveLevels - band - 1;
		const remaining = endIndex - cursor + 1 - remainingBands;
		if (remaining <= 0) break;
		const share = Math.max(1, Math.ceil(remaining / (remainingBands + 1)));
		const bandEnd = cursor + share - 1;
		bands.push({
			startIndex: cursor,
			endIndex: bandEnd,
			tokens: sliceTokens(messages, cursor, bandEnd)
		});
		cursor = bandEnd + 1;
	}
	if (cursor <= endIndex) bands.push({
		startIndex: cursor,
		endIndex,
		tokens: sliceTokens(messages, cursor, endIndex)
	});
	return bands;
}
/** Sum message tokens over an inclusive index range. */
function sliceTokens(messages, startIndex, endIndex) {
	let total = 0;
	for (let index = startIndex; index <= endIndex; index += 1) total += messages[index].tokens;
	return total;
}
/**
* Convert the design's ratios into concrete token budgets against a window.
* @param windowTokens - the context window capacity (must be > 0).
* @param compressionLineRatio - fraction at which raw history triggers compression.
* @param retentionRatio - fraction of recent raw text kept verbatim.
* @returns the absolute token budgets.
* @throws {CompactionConfigError} when the window or ratios are unusable.
*/
function resolveBudgets(windowTokens, compressionLineRatio, retentionRatio) {
	if (!Number.isFinite(windowTokens) || windowTokens <= 0) throw new CompactionConfigError(`context window must be a positive finite number, got ${windowTokens}`);
	if (!Number.isFinite(compressionLineRatio) || compressionLineRatio <= 0 || compressionLineRatio > 1) throw new CompactionConfigError(`compressionLineRatio must be in (0,1], got ${compressionLineRatio}`);
	if (!Number.isFinite(retentionRatio) || retentionRatio < 0 || retentionRatio > 1) throw new CompactionConfigError(`retentionRatio must be in [0,1], got ${retentionRatio}`);
	if (retentionRatio > compressionLineRatio) throw new CompactionConfigError(`retentionRatio (${retentionRatio}) must not exceed compressionLineRatio (${compressionLineRatio})`);
	return {
		compressionLineTokens: Math.floor(windowTokens * compressionLineRatio),
		retentionTokens: Math.floor(windowTokens * retentionRatio)
	};
}
//#endregion
//#region lib/types/compaction/coarsen.js
/**
* Recursive coarsening: when layered summaries plus cross-session memory exceed
* the unified injection cap, merge the finest summary layer into the next
* coarser one — information is never dropped, only granularity is lost.
*
* Pure over `LayerSummary` data. Coarsening merges adjacent layers by joining
* their covered ranges and delegating the actual re-condensation to an injected
* `Summarizer`. A pair is merged only when the summarizer produces a genuinely
* smaller layer; otherwise that pair is skipped for the next-coarser one. When
* no further meaningful coarsening is possible yet the cap is still exceeded,
* we throw `CoarseningFloorError` — the honest §4.3 boundary, after which the
* caller relies on L0 storage plus the refine chain.
*
* @module dsh-harness-memory-bundle/compaction/coarsen
*/
/** Projected total token budget of the summaries the engine would present. */
function summaryBudget(layers) {
	return layers.reduce((total, layer) => total + layer.tokens, 0);
}
/**
* Select the two layers to coarsen: the finest condensation and the one
* immediately coarser. Returns `null` when fewer than two summary layers exist
* or when the only candidates are raw level-0 content (raw is never coarsened).
* @param layers - current summary layers, ordered by level ascending.
* @param excludedCoarse - coarse-layer indexes already known un-mergeable.
* @returns the [fineIndex, coarseIndex] pair to merge, or `null`.
*/
function pickCoarsenPair(layers, excludedCoarse) {
	if (layers.length < 2) return null;
	let coarseIndex = layers.length - 1;
	while (coarseIndex >= 1 && excludedCoarse?.has(coarseIndex)) coarseIndex -= 1;
	if (coarseIndex < 1) return null;
	let fineIndex = coarseIndex - 1;
	while (fineIndex >= 0 && layers[fineIndex].level === 0) fineIndex -= 1;
	if (fineIndex < 0) return null;
	if (layers[coarseIndex].level === 0) return null;
	return [fineIndex, coarseIndex];
}
/**
* Whether the combined summaries budget is within `capTokens`.
*/
function withinCap(summaries, capTokens) {
	return summaryBudget(summaries) <= capTokens;
}
/**
* Recursively coarsen until the summaries budget fits `capTokens`, or no
* mergeable pair remains.
*
* @param layers - current summary layers, ordered by level ascending.
* @param capTokens - the unified injection cap (summary + cross-session memory).
* @param summarize - injected re-condensation seam.
* @returns the coarsened layers ordered by level ascending.
* @throws {CoarseningFloorError} when the coarsest layer still exceeds the cap.
*/
async function recursiveCoarsen(layers, capTokens, summarize) {
	let current = [...layers];
	if (withinCap(current, capTokens)) return current;
	let refusedCoarse = /* @__PURE__ */ new Set();
	for (;;) {
		if (withinCap(current, capTokens)) return current;
		const pair = pickCoarsenPair(current, refusedCoarse);
		if (pair === null) throw new CoarseningFloorError(summaryBudget(current), capTokens);
		const [fineIndex, coarseIndex] = pair;
		const fine = current[fineIndex];
		const coarse = current[coarseIndex];
		const mergedRange = [Math.min(fine.range[0], coarse.range[0]), Math.max(fine.range[1], coarse.range[1])];
		const mergedLevel = Math.max(fine.level, coarse.level);
		const span = materializeSpan(fine, coarse);
		const produced = await summarize.summarize(span, mergedLevel);
		const combinedTokens = fine.tokens + coarse.tokens;
		if (produced === null || produced.tokens >= combinedTokens) {
			refusedCoarse.add(coarseIndex);
			continue;
		}
		const mergedLayer = {
			level: mergedLevel,
			range: mergedRange,
			text: produced.text,
			tokens: produced.tokens,
			generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
			...produced.model === void 0 ? {} : { model: produced.model },
			nonDistillable: true
		};
		current.splice(coarseIndex, 1);
		current.splice(fineIndex, 1);
		current.push(mergedLayer);
		current.sort((a, b) => a.level - b.level);
		refusedCoarse = /* @__PURE__ */ new Set();
	}
}
/**
* Materialize the raw messages covered by two layers as a single raw span for
* re-condensation, by feeding the summarizer the two prior summaries so the
* coarsening is itself a re-condensation of prior summaries.
*/
function materializeSpan(fine, coarse) {
	return {
		range: [Math.min(fine.range[0], coarse.range[0]), Math.max(fine.range[1], coarse.range[1])],
		messages: [{
			seq: fine.range[0],
			tokens: fine.tokens,
			text: fine.text,
			role: "user"
		}, {
			seq: coarse.range[0],
			tokens: coarse.tokens,
			text: coarse.text,
			role: "user"
		}]
	};
}
//#endregion
//#region lib/types/compaction/engine.js
/**
* Session-internal hierarchical compaction engine — the public API surface
* that T9 (unified injection) and T10 (tool recall/refine) build on.
*
* The engine wires the pure selection/partition/coarsen policies to the
* injected summarizer and storage seams, and exposes:
*   - `checkTrigger` — has raw history crossed the compression line?
*   - `compress`    — fold old raw history into layered summaries, persist each.
*   - `coarsen`     — recursively coarsen summaries under the injection cap.
*   - `retrieve`    — pull back a fine layer / raw text for a covered interval.
*
* The engine is deliberately NOT a cordis Service — it is a plain object
* constructed with injected seams, so it is trivially unit-testable and T9 can
* construct it inside its own agent/request wiring. (Skeleton: the host entry
* may later construct this engine; this module has no cordis dependency.)
*
* @module dsh-harness-memory-bundle/compaction/engine
*/
/**
* Plain-object engine over injected seams.
*/
var CompactionEngine = class {
	deps;
	config;
	constructor(deps) {
		this.deps = deps;
		this.config = {
			...DEFAULT_COMPACTION_CONFIG,
			...deps.config
		};
	}
	/** The absolute injection cap tokens for a given window. */
	injectionCapTokens(windowTokens) {
		return Math.floor(windowTokens * this.config.injectionCapRatio);
	}
	/**
	* Whether raw history has crossed the compression line.
	* @param historyTokens - current raw-history token count.
	* @param windowTokens  - context window capacity.
	*/
	checkTrigger(historyTokens, windowTokens) {
		const { compressionLineTokens } = resolveBudgets(windowTokens, this.config.compressionLineRatio, this.config.retentionRatio);
		return historyTokens >= compressionLineTokens;
	}
	/**
	* Compress old raw history into layered summaries (near = detailed, far =
	* coarse), retaining a recent tail verbatim, and persist every layer.
	* @param sessionId - the session's id (also its storage key).
	* @param history   - the session's ordered raw messages (surface order).
	* @param windowTokens - context window capacity for budget resolution.
	* @returns the produced layers and the compressed/retained split.
	*/
	async compress(sessionId, history, windowTokens) {
		const { retentionTokens } = resolveBudgets(windowTokens, this.config.compressionLineRatio, this.config.retentionRatio);
		const span = selectCompressibleRange(history, retentionTokens);
		if (span === null) throw new NoCompressibleHistoryError("no compressible raw span (history empty or fully retained)");
		const bands = partitionLayers(history, span, this.config.maxLevel ?? defaultLevels(span));
		const layers = [];
		for (let index = 0; index < bands.length; index += 1) {
			const band = bands[index];
			const bandMessages = history.slice(band.startIndex, band.endIndex + 1);
			const produced = await this.deps.summarizer.summarize({
				range: [bandMessages[0].seq, bandMessages[bandMessages.length - 1].seq],
				messages: bandMessages
			}, index + 1);
			if (produced === null) continue;
			const layer = {
				level: index + 1,
				range: [bandMessages[0].seq, bandMessages[bandMessages.length - 1].seq],
				text: produced.text,
				tokens: produced.tokens,
				generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
				...produced.model === void 0 ? {} : { model: produced.model },
				nonDistillable: true
			};
			layers.push(layer);
			await this.deps.storage.save(sessionId, layer);
		}
		return {
			layers,
			compressedRange: [history[0].seq, history[Math.max(0, span[1])].seq],
			retainedTokens: retentionTokens
		};
	}
	/**
	* Recursively coarsen summaries so summaries + cross-session memory fit the
	* injection cap, persisting any merged layers.
	* @throws {CoarseningFloorError} when the coarsest layer still exceeds the cap.
	*/
	async coarsen(sessionId, summaries, crossSessionMemoryTokens, windowTokens) {
		const cap = this.injectionCapTokens(windowTokens);
		const summaryCap = Math.max(0, cap - crossSessionMemoryTokens);
		if (withinCap(summaries, summaryCap)) return [...summaries];
		const coarsened = await recursiveCoarsen(summaries, summaryCap, this.deps.summarizer);
		await this.deps.storage.clear(sessionId);
		for (const layer of coarsened) await this.deps.storage.save(sessionId, layer);
		return coarsened;
	}
	/**
	* Retrieve the finest stored summary layers covering the message at `seq` —
	* the coarse→fine→L0 refine (recall) chain entry point.
	* @returns layers covering `seq`, ordered by level descending (finest first).
	* @throws {NoCoverageError} when no layer covers the requested seq.
	*/
	async retrieve(sessionId, seq) {
		const covering = (await this.deps.storage.load(sessionId)).filter((layer) => layer.range[0] <= seq && seq <= layer.range[1]).sort((a, b) => b.level - a.level);
		if (covering.length === 0) throw new NoCoverageError(`no summary layer covers seq ${seq} in session ${sessionId}`);
		return covering;
	}
};
/** Default layer count: grows with span size, capped for stability. */
function defaultLevels(span) {
	const count = span[1] - span[0] + 1;
	if (count <= 2) return 1;
	if (count <= 8) return 2;
	if (count <= 24) return 3;
	return 4;
}
//#endregion
//#region lib/types/compaction/summarizer.js
/**
* Summarizer seam and a default `ctx.llm.stream()`-backed implementation.
*
* The engine is unit-tested with a fake summarizer; the production default
* follows the official compaction prefix-reuse technique (see
* official/packages/compaction/compaction-basic/src/summarizer.ts): replay the
* conversation's own system prompt, tools, and leading messages, then append
* only the condensation instruction as the final user message, so the auxiliary
* call is a genuine prefix of the last routed request and reuses the provider's
* warm KV cache. The compression model may follow the current route (eating the
* prefix cache) or be pinned to a configured plan.
*
* @module dsh-harness-memory-bundle/compaction/summarizer
*/
/** Instruction delivered as the FINAL user message after the replayed span. */
const CONDENSE_INSTRUCTION = [
	"You are condensing an earlier span of a coding session into a terse engineering summary so another model can resume the work with no loss of essential context.",
	"",
	"Use concise bullets, not prose. Preserve exact file paths, identifiers, numeric values, function signatures, command strings, and error strings verbatim.",
	"Capture: the original request and intent, key technical concepts, files and code, errors and fixes, pending jobs, current work, and the single next step.",
	"Write \"(none)\" for any empty section; never drop a section.",
	"Do not mention this condensation request.",
	"Output only the summary text — no tool calls, no other action."
].join("\n");
/**
* Default summarizer backed by a streaming LLM seam. Constructed with an
* `llm.stream` callable and a route-resolver that supplies provider/model and
* (optionally) the replayed system/tools prefix for cache alignment.
*/
var LlmSummarizer = class {
	llm;
	resolveOptions;
	constructor(llm, resolveOptions) {
		this.llm = llm;
		this.resolveOptions = resolveOptions;
	}
	async summarize(span, _fromLevel, ctx) {
		const options = this.resolveOptions(ctx);
		if (options.provider.length === 0 || options.model.length === 0) throw new CompactionConfigError("summarizer: no provider/model resolved for compression");
		const replay = span.messages.map((message) => ({
			role: message.role === "assistant" ? "assistant" : message.role === "tool" ? "tool" : "user",
			content: message.text
		}));
		const request = {
			...options,
			messages: [...replay, {
				role: "user",
				content: CONDENSE_INSTRUCTION
			}]
		};
		let text = "";
		for await (const chunk of this.llm.stream(request)) {
			const piece = chunk?.text;
			if (typeof piece === "string") text += piece;
		}
		if (text.trim().length === 0) return null;
		return {
			text,
			tokens: Math.max(1, Math.ceil(text.length / 4)),
			model: options.model
		};
	}
};
/**
* Build a prefix-cache-aligned summarizer from an `llm.stream` callable plus a
* function that resolves the effective compression route (follow the current
* route, or a pinned plan). The route resolver returns the provider/model and
* the cache-aligned prefix (system/tools), matching `resolveOptions`.
*/
function createPrefixAlignedSummarizer(llm, resolveRoute) {
	return new LlmSummarizer(llm, resolveRoute);
}
//#endregion
//#region lib/types/compaction/storage.js
/**
* Per-layer summary persistence to `~/.dsh/memory/summaries/{sessionId}/`.
*
* Each summary layer is written as its own file (level + covered range in the
* name) so a resumed session can reuse it directly and the refine (recall)
* chain can pull back a finer layer by range. Writes are atomic (write-then-
* rename) so a crash never leaves a half-written layer. Recovery tolerates a
* missing/corrupt layer by skipping it and keeping the rest.
*
* Uses only `node:fs`/`node:path`/`node:os` — self-contained, matching the
* bundle's home-path convention (the hot-mount environment may not carry
* `@deepseek-ai/dsh-home-paths`).
*
* @module dsh-harness-memory-bundle/compaction/storage
*/
/** Root under which all session summaries live. */
const SUMMARIES_ROOT = ".dsh/memory/summaries";
/** Resolve the absolute summaries directory for one session id. */
function summariesRoot(base) {
	return join(base ?? homedir(), SUMMARIES_ROOT);
}
/**
* Sanitize a session id into a safe directory name, rejecting path escapes.
* @throws when the id could traverse the filesystem (path injection).
*/
function sanitizeSessionId(sessionId) {
	if (sessionId.length === 0) throw new LayerRecoveryError("summary storage: empty session id");
	if (sessionId.includes("/") || sessionId.includes("\\") || sessionId.includes("..") || sessionId === "." || sessionId === "..") throw new LayerRecoveryError(`summary storage: session id "${sessionId}" is not a safe directory name`);
	return sessionId;
}
/** Filename for one summary layer, embedding level and covered seq range. */
function layerFileName(layer) {
	return `l${layer.level}.${layer.range[0]}-${layer.range[1]}.json`;
}
/** Validate a parsed stored layer before it is trusted as a `LayerSummary`. */
function parseStoredLayer(raw) {
	if (typeof raw !== "object" || raw === null) return void 0;
	const layer = raw;
	if (typeof layer.level !== "number" || !Array.isArray(layer.range) || layer.range.length !== 2 || typeof layer.range[0] !== "number" || typeof layer.range[1] !== "number" || typeof layer.text !== "string" || typeof layer.tokens !== "number" || typeof layer.generatedAt !== "string") return void 0;
	return {
		level: layer.level,
		range: [layer.range[0], layer.range[1]],
		text: layer.text,
		tokens: layer.tokens,
		generatedAt: layer.generatedAt,
		...typeof layer.model === "string" ? { model: layer.model } : {},
		nonDistillable: layer.nonDistillable === true
	};
}
/**
* Filesystem-backed summary storage under a configurable base directory
* (defaults to the user home, i.e. `~/.dsh/memory/summaries`).
*/
var FileSummaryStorage = class {
	base;
	constructor(base) {
		this.base = base;
	}
	async save(sessionId, layer) {
		const dir = join(summariesRoot(this.base), sanitizeSessionId(sessionId));
		await mkdir(dir, { recursive: true });
		const payload = {
			level: layer.level,
			range: [layer.range[0], layer.range[1]],
			text: layer.text,
			tokens: layer.tokens,
			generatedAt: layer.generatedAt,
			...layer.model === void 0 ? {} : { model: layer.model },
			nonDistillable: layer.nonDistillable
		};
		const file = join(dir, layerFileName(layer));
		const temp = `${file}.${process.pid}.tmp`;
		await writeFile(temp, JSON.stringify(payload), "utf8");
		await rename(temp, file);
	}
	async load(sessionId) {
		const dir = join(summariesRoot(this.base), sanitizeSessionId(sessionId));
		let names;
		try {
			names = await readdir(dir);
		} catch {
			return [];
		}
		const layers = [];
		for (const name of names) {
			if (!name.endsWith(".json") || name.endsWith(".tmp")) continue;
			try {
				const layer = parseStoredLayer(JSON.parse(await readFile(join(dir, name), "utf8")));
				if (layer !== void 0) layers.push(layer);
			} catch {
				continue;
			}
		}
		return layers.sort((a, b) => a.level - b.level);
	}
	async clear(sessionId) {
		const dir = join(summariesRoot(this.base), sanitizeSessionId(sessionId));
		await rm(dir, {
			recursive: true,
			force: true
		});
	}
};
//#endregion
//#region lib/types/compaction/tag.js
/**
* Summary tagging: marks compaction-produced content as "not a memory
* distillation source".
*
* Per §4.3/§5, compressed summaries are the current session's context-management
* artifact, NOT long-term memory material. If an async distillation pipeline
* later scans the session it must skip summary layers — otherwise it would
* re-distill "a summary of a summary" (the exact double-distillation the design
* retires). This module centralizes the marker so the compaction engine stamps
* its products and any consumer can recognize them.
*
* @module dsh-harness-memory-bundle/compaction/tag
*/
/**
* Stable marker carried on every summary layer to forbid re-distillation.
* Mirrors the session-log "ignorable" semantics: a reader that understands it
* skips the content; a reader that does not treats it as ordinary content and
* changes nothing about other events.
*/
const NON_DISTILLABLE_SOURCE = "compaction-summary";
/** Alias exposed for consumers that read the marker from storage/metadata. */
const SUMMARY_SOURCE_TAG = NON_DISTILLABLE_SOURCE;
/**
* Build the metadata bag stamped onto a summary layer to identify it as a
* non-distillable compaction product.
* @param level - the summary layer's depth (0 is raw, never stamped).
* @returns a frozen metadata record, or `undefined` for raw (level 0) content.
*/
function summarySourceMetadata(level) {
	if (level <= 0) return void 0;
	return {
		source: NON_DISTILLABLE_SOURCE,
		level
	};
}
/**
* Whether a content/metadata bag identifies a non-distillable compaction
* product. Consumers (e.g. an async distillation pipeline) use this to skip
* summary layers.
* @param metadata - the content's metadata, or `undefined` for raw content.
*/
function isNonDistillable(metadata) {
	if (typeof metadata !== "object" || metadata === null) return false;
	return metadata.source === NON_DISTILLABLE_SOURCE;
}
//#endregion
export { CoarseningFloorError, CompactionConfigError, CompactionEngine, CompactionError, DEFAULT_COMPACTION_CONFIG, FileSummaryStorage, LayerRecoveryError, LlmSummarizer, NON_DISTILLABLE_SOURCE, NoCompressibleHistoryError, NoCoverageError, SUMMARY_SOURCE_TAG, TaskStore, Tasks, createPrefixAlignedSummarizer, isBalancedBoundary, isNonDistillable, layerFileName, partitionLayers, pickCoarsenPair, recursiveCoarsen, resolveBudgets, sanitizeSessionId, selectCompressibleRange, summariesRoot, summaryBudget, summarySourceMetadata, taskDbPath, withinCap };
