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
import { type Task, type TaskCreateInput, type TaskListFilter, type TaskSessionKind, type TaskUpdateInput } from './types.ts';
/** The on-disk physical layout version, stamped in `PRAGMA user_version`. */
export declare const TASK_SCHEMA_VERSION = 1;
/** The default tasks database file under the harness home. */
export declare const TASK_DB_FILE = "tasks.db";
/** The default absolute path of the tasks database. */
export declare function taskDbPath(): string;
/**
 * The task store: CRUD, associations, filtering, and completion downweighting.
 */
export declare class TaskStore {
    private readonly db;
    private readonly stmts;
    /**
     * @param path - database path; `:memory:` for tests, undefined for the default
     *   harness-home path. Missing directories/files are created owner-only.
     */
    private constructor();
    /** Open a store. See {@link TaskStore.constructor}. */
    static open(path?: string): TaskStore;
    /** Open an in-memory store for tests. */
    static openMemory(): TaskStore;
    private configure;
    private prepare;
    /**
     * Create a task.
     * @param input - title, goal, and optional responsible roles.
     * @returns the persisted task.
     * @throws InvalidTaskInputError on a missing title/goal.
     */
    create(input: TaskCreateInput): Task;
    /**
     * Update a task's title/goal/roles.
     * @param id - the task id.
     * @param input - any subset of the mutable fields.
     * @throws UnknownTaskError when the task does not exist.
     */
    update(id: string, input: TaskUpdateInput): Task;
    /**
     * Mark a task completed (idempotent).
     * @param id - the task id.
     * @returns the updated task.
     * @throws UnknownTaskError when the task does not exist.
     */
    complete(id: string): Task;
    /**
     * List tasks. By default completed tasks are EXCLUDED (the downweighting rule);
     * pass `includeCompleted: true` to surface them explicitly.
     * @param filter - optional list filter.
     */
    list(filter?: TaskListFilter): Task[];
    /**
     * Read one task.
     * @param id - the task id.
     * @throws UnknownTaskError when the task does not exist.
     */
    read(id: string): Task;
    /**
     * The ids of tasks the memory engine should treat as active for filtering —
     * completed tasks are excluded by default, so a completed task's memories are
     * downweighted (they still exist, but are not offered as active filters).
     */
    activeTaskIds(): string[];
    /**
     * Whether a task is completed — the memory engine downweights L0/L1 for a
     * completed task by default and surfaces them only on an explicit query.
     * @param id - the task id.
     * @returns true when the task exists and is completed; false when running or missing.
     */
    isCompleted(id: string): boolean;
    /**
     * Associate a session with a task (会话挂任务 or 委派挂任务).
     * @param taskId - the task id.
     * @param sessionId - the session to attach.
     * @param roleId - the role that ran the session (delegation attaches it).
     * @param kind - how the association was made.
     * @throws UnknownTaskError when the task does not exist.
     */
    attachSession(taskId: string, sessionId: string, roleId: string | undefined, kind: TaskSessionKind): Task;
    /** Remove a session association (used by tests and cleanup). */
    detachSession(taskId: string, sessionId: string): void;
    /** Close the database connection. */
    close(): void;
    private requireRow;
    private sessionsForId;
    private hydrate;
}
/** Ensure the tasks directory exists with owner-only permissions. */
export declare function ensureTasksDirectory(): Promise<void>;
//# sourceMappingURL=store.d.ts.map