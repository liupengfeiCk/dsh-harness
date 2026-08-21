/**
 * dsh-harness-memory-bundle/tasks — the task-entity service (design §7 F10).
 *
 * A Task is the DSH counterpart of the TencentDB Agent Memory "persistent
 * business task". This service owns the durable task table, the association
 * ledger (委派挂任务 / 会话挂任务), the creation surface for the main agent
 * tool and the management wire, and the query interface the memory engine uses
 * to filter L0/L1 memories by task id (task is a memory filtering dimension
 * parallel to team/role/project — design §4.1).
 *
 * The service is a thin cordis wrapper over the dependency-free {@link TaskStore}.
 * It is mounted as `ctx.get('tasks')`; the wire and the `create_task` tool both
 * route through it.
 * @module dsh-harness-memory-bundle/tasks
 */
import { Service } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import { TaskStore } from "./store.js";
import { ensureTasksDirectory } from "./store.js";
export { TaskStore, taskDbPath } from "./store.js";
export { InvalidTaskInputError, UnknownTaskError, } from "./types.js";
/** Schemastery validator for {@link Config}. */
export const Config = z.object({
    dbPath: z.string().default(undefined),
});
/**
 * The task registry: wraps the SQLite {@link TaskStore} behind the cordis
 * service boundary, so the wire and the main-agent tool share one store and
 * the memory engine queries it through a stable interface.
 */
export class Tasks extends Service {
    config;
    /** The backing store; also exposed so host code can close it. */
    store;
    constructor(ctx, config) {
        super(ctx, 'tasks');
        this.config = config;
        this.store = TaskStore.open(config.dbPath);
        // Best-effort: ensure the tasks directory exists so a fresh profile can
        // write; the store also creates it on first open via node:sqlite's parent
        // creation path, so a failure here is non-fatal.
        void ensureTasksDirectory().catch(() => { });
        // Close the SQLite connection when the service is disposed.
        ctx.effect(() => {
            const store = this.store;
            return () => store.close();
        }, 'dsh-memory-tasks: dispose store');
    }
    /** Create a task (管理界面 wire / 主代理 create_task 工具两入口共用). */
    create(input) {
        const task = this.store.create(input);
        this.ctx.emit('memory/task-changed', task.id, task.status);
        return task;
    }
    /** Update a task's title/goal/roles. */
    update(id, input) {
        return this.store.update(id, input);
    }
    /** Mark a task completed (idempotent). */
    complete(id) {
        const task = this.store.complete(id);
        this.ctx.emit('memory/task-changed', task.id, task.status);
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
    attachSession(taskId, sessionId, roleId, kind = 'session') {
        return this.store.attachSession(taskId, sessionId, roleId, kind);
    }
    /** Remove a session association. */
    detachSession(taskId, sessionId) {
        this.store.detachSession(taskId, sessionId);
    }
}
export default Tasks;
//# sourceMappingURL=index.js.map