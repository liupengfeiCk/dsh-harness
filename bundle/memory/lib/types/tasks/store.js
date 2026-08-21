/**
 * SQLite storage for the task entity.
 *
 * The store owns one `node:sqlite` `DatabaseSync` connection to
 * `~/.dsh/memory/tasks/tasks.db` (the memory bundle keeps its L0/L1 engine in
 * `~/.dsh/memory/memory.db`; this tasks store is a separate file and directory,
 * so the two never share a connection or a lock). Two tables hold the data:
 *
 * - `tasks` — one row per task (id/title/goal/status/rolesJson/createdAt/completedAt)
 * - `task_sessions` — the association ledger (委派挂任务 / 会话挂任务)
 *
 * Design notes (mirroring the harness `storage-sqlite` conventions):
 * - the physical schema version is stamped in `PRAGMA user_version`; any other
 *   non-current version rejects rather than migrating in place;
 * - `STRICT` tables; values that are JSON are stored as text;
 * - the completion downweighting rule is built into `list`/`activeTaskIds`:
 *   the default excludes completed tasks, and an explicit `includeCompleted`
 *   flag surfaces them.
 *
 * The store is a plain class with NO cordis dependency so it can be unit-tested
 * in isolation against `:memory:`. The `Tasks` service in `index.ts` wraps it.
 * @module dsh-harness-memory-bundle/tasks/store
 */
import { DatabaseSync } from 'node:sqlite';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DEFAULT_TASK_FILTER, InvalidTaskInputError, UnknownTaskError, } from "./types.js";
import { dshHomePath } from "./paths.js";
/** The on-disk physical layout version, stamped in `PRAGMA user_version`. */
export const TASK_SCHEMA_VERSION = 1;
/** The default tasks database file under the harness home. */
export const TASK_DB_FILE = 'tasks.db';
/** The default absolute path of the tasks database. */
export function taskDbPath() {
    return dshHomePath('memory', 'tasks', TASK_DB_FILE);
}
/** Parse a roles JSON column, failing loud on corruption. */
function parseRoles(json) {
    try {
        const value = JSON.parse(json);
        if (!Array.isArray(value))
            throw new Error('roles column is not an array');
        return value;
    }
    catch (error) {
        throw new Error(`task roles column holds invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
}
/** Resolve the tasks database path, honouring an explicit override and `:memory:`. */
function resolveDbPath(explicit) {
    return explicit === undefined || explicit === ':memory:' ? explicit ?? taskDbPath() : resolve(explicit);
}
/**
 * The task store: CRUD, associations, filtering, and completion downweighting.
 */
export class TaskStore {
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
        return new TaskStore(':memory:');
    }
    configure(path) {
        this.db.exec('PRAGMA foreign_keys = ON');
        const { user_version: onDisk } = this.db.prepare('PRAGMA user_version').get();
        if (onDisk !== 0 && onDisk !== TASK_SCHEMA_VERSION) {
            throw new Error(`tasks database at "${path}" has schema version ${onDisk}, incompatible with this build (${TASK_SCHEMA_VERSION})`);
        }
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
        this.db.exec('CREATE INDEX IF NOT EXISTS task_sessions_session ON task_sessions (session_id)');
        if (onDisk === 0) {
            // Stamp fresh databases LAST: the stamp asserts the layout is complete.
            this.db.exec(`PRAGMA user_version = ${TASK_SCHEMA_VERSION}`);
        }
    }
    prepare() {
        return {
            insert: this.db.prepare('INSERT INTO tasks (id, title, goal, status, roles_json, created_at, completed_at) VALUES (?, ?, ?, ?, ?, ?, ?)'),
            update: this.db.prepare('UPDATE tasks SET title = ?, goal = ?, roles_json = ? WHERE id = ?'),
            complete: this.db.prepare('UPDATE tasks SET status = ?, completed_at = ? WHERE id = ?'),
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
            removeSession: this.db.prepare('DELETE FROM task_sessions WHERE task_id = ? AND session_id = ?'),
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
        if (title.length === 0)
            throw new InvalidTaskInputError('title must not be empty');
        if (goal.length === 0)
            throw new InvalidTaskInputError('goal must not be empty');
        const roles = validateRoles(input.roles);
        const id = randomUUID();
        const now = new Date().toISOString();
        this.db.exec('BEGIN');
        try {
            this.stmts.insert.run(id, title, goal, 'running', JSON.stringify(roles), now, null);
            this.db.exec('COMMIT');
        }
        catch (error) {
            this.db.exec('ROLLBACK');
            throw error;
        }
        return this.hydrate({ id, title, goal, status: 'running', rolesJson: JSON.stringify(roles), createdAt: now, completedAt: null }, []);
    }
    /**
     * Update a task's title/goal/roles.
     * @param id - the task id.
     * @param input - any subset of the mutable fields.
     * @throws UnknownTaskError when the task does not exist.
     */
    update(id, input) {
        const row = this.requireRow(id);
        const title = input.title === undefined ? row.title : input.title.trim();
        const goal = input.goal === undefined ? row.goal : input.goal.trim();
        if (title.length === 0)
            throw new InvalidTaskInputError('title must not be empty');
        if (goal.length === 0)
            throw new InvalidTaskInputError('goal must not be empty');
        const roles = input.roles === undefined ? parseRoles(row.rolesJson) : validateRoles(input.roles);
        this.stmts.update.run(title, goal, JSON.stringify(roles), id);
        const updated = { ...row, title, goal, rolesJson: JSON.stringify(roles) };
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
        if (row.status === 'running') {
            const now = new Date().toISOString();
            this.stmts.complete.run('completed', now, id);
            const updated = { ...row, status: 'completed', completedAt: now };
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
        const includeCompleted = filter.includeCompleted ?? false;
        const rows = (includeCompleted ? this.stmts.listAll : this.stmts.listActive).all();
        return rows.map(row => this.hydrate(row, this.sessionsForId(row.id)));
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
        return this.stmts.listActive.all().map(row => row.id);
    }
    /**
     * Whether a task is completed — the memory engine downweights L0/L1 for a
     * completed task by default and surfaces them only on an explicit query.
     * @param id - the task id.
     * @returns true when the task exists and is completed; false when running or missing.
     */
    isCompleted(id) {
        const row = this.stmts.find.get(id);
        return row !== undefined && row.status === 'completed';
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
        if (trimmed.length === 0)
            throw new InvalidTaskInputError('sessionId must not be empty');
        const now = new Date().toISOString();
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
        if (row === undefined) {
            const available = this.stmts.listAll.all().map(r => r.id);
            throw new UnknownTaskError(id, available);
        }
        return row;
    }
    sessionsForId(taskId) {
        return this.stmts.sessionsFor.all(taskId).map((s) => ({
            sessionId: s.sessionId,
            ...s.roleId === null ? {} : { roleId: s.roleId },
            kind: s.kind,
            attachedAt: s.attachedAt,
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
            sessions,
        };
    }
}
/** Validate the responsible-roles list, mapping bad shapes to InvalidTaskInputError. */
function validateRoles(roles) {
    if (roles === undefined)
        return [];
    for (const role of roles) {
        if (typeof role.roleId !== 'string' || role.roleId.trim().length === 0) {
            throw new InvalidTaskInputError('each role must have a non-empty roleId');
        }
        if (typeof role.division !== 'string' || role.division.trim().length === 0) {
            throw new InvalidTaskInputError(`role "${role.roleId}" must have a non-empty division`);
        }
    }
    return roles;
}
/** Ensure the tasks directory exists with owner-only permissions. */
export async function ensureTasksDirectory() {
    await mkdir(dirname(resolveDbPath(undefined)), { recursive: true, mode: 0o700 });
}
//# sourceMappingURL=store.js.map