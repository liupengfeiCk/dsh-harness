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
import type { Context } from '@deepseek-ai/cordis';
import { TaskStore } from './store.ts';
import type { Task, TaskCreateInput, TaskListFilter, TaskSessionKind, TaskUpdateInput } from './types.ts';
export { TaskStore, taskDbPath } from './store.ts';
export { InvalidTaskInputError, UnknownTaskError, type StoredTask, type StoredTaskSession, type Task, type TaskCreateInput, type TaskListFilter, type TaskRole, type TaskSession, type TaskSessionKind, type TaskStatus, type TaskUpdateInput, } from './types.ts';
declare module '@deepseek-ai/cordis' {
    interface Context {
        /** The task-entity registry, composed by the memory bundle. */
        tasks: Tasks;
    }
    interface Events {
        /**
         * A task's lifecycle or association changed. Carries the stable task id and
         * its new status so the memory engine can refresh its active-task filters.
         */
        'memory/task-changed'(taskId: string, status: 'running' | 'completed'): void;
    }
}
/** Registry configuration (paths can be overridden for tests/deployments). */
export interface Config {
    /** Absolute tasks database path, or `:memory:`. Defaults to the harness home. */
    dbPath?: string;
}
/** Schemastery validator for {@link Config}. */
export declare const Config: z<Config>;
/**
 * The task registry: wraps the SQLite {@link TaskStore} behind the cordis
 * service boundary, so the wire and the main-agent tool share one store and
 * the memory engine queries it through a stable interface.
 */
export declare class Tasks extends Service {
    config: Config;
    /** The backing store; also exposed so host code can close it. */
    readonly store: TaskStore;
    constructor(ctx: Context, config: Config);
    /** Create a task (管理界面 wire / 主代理 create_task 工具两入口共用). */
    create(input: TaskCreateInput): Task;
    /** Update a task's title/goal/roles. */
    update(id: string, input: TaskUpdateInput): Task;
    /** Mark a task completed (idempotent). */
    complete(id: string): Task;
    /** List tasks; completed tasks are excluded by default (downweighting). */
    list(filter?: TaskListFilter): Task[];
    /** Read one task. */
    read(id: string): Task;
    /** The ids of active (non-completed) tasks — the memory engine's filter set. */
    activeTaskIds(): string[];
    /** Whether a task is completed — the memory engine downweights completed-task L0/L1. */
    isCompleted(id: string): boolean;
    /**
     * Associate a session with a task (委派挂任务 / 会话挂任务).
     * @param taskId - the task id.
     * @param sessionId - the associated session.
     * @param roleId - the role that ran the session, when known.
     * @param kind - how the association was made.
     */
    attachSession(taskId: string, sessionId: string, roleId?: string, kind?: TaskSessionKind): Task;
    /** Remove a session association. */
    detachSession(taskId: string, sessionId: string): void;
}
export default Tasks;
//# sourceMappingURL=index.d.ts.map