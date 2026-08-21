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

import { Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { Context } from '@deepseek-ai/cordis'
import { TaskStore } from './store.ts'
import { ensureTasksDirectory } from './store.ts'
import type {
  Task,
  TaskCreateInput,
  TaskListFilter,
  TaskSessionKind,
  TaskUpdateInput,
} from './types.ts'

export { TaskStore, taskDbPath } from './store.ts'
export {
  InvalidTaskInputError, UnknownTaskError,
  type StoredTask, type StoredTaskSession, type Task, type TaskCreateInput,
  type TaskListFilter, type TaskRole, type TaskSession, type TaskSessionKind,
  type TaskStatus, type TaskUpdateInput,
} from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** The task-entity registry, composed by the memory bundle. */
    tasks: Tasks
  }

  interface Events {
    /**
     * A task's lifecycle or association changed. Carries the stable task id and
     * its new status so the memory engine can refresh its active-task filters.
     */
    'memory/task-changed'(taskId: string, status: 'running' | 'completed'): void
  }
}

/** Registry configuration (paths can be overridden for tests/deployments). */
export interface Config {
  /** Absolute tasks database path, or `:memory:`. Defaults to the harness home. */
  dbPath?: string
}

/** Schemastery validator for {@link Config}. */
export const Config: z<Config> = z.object({
  dbPath: z.string().default(undefined as unknown as string),
})

/**
 * The task registry: wraps the SQLite {@link TaskStore} behind the cordis
 * service boundary, so the wire and the main-agent tool share one store and
 * the memory engine queries it through a stable interface.
 */
export class Tasks extends Service {
  /** The backing store; also exposed so host code can close it. */
  readonly store: TaskStore

  constructor(ctx: Context, public config: Config) {
    super(ctx, 'tasks')
    this.store = TaskStore.open(config.dbPath)
    // Best-effort: ensure the tasks directory exists so a fresh profile can
    // write; the store also creates it on first open via node:sqlite's parent
    // creation path, so a failure here is non-fatal.
    void ensureTasksDirectory().catch(() => {})
    // Close the SQLite connection when the service is disposed.
    ctx.effect(() => {
      const store = this.store
      return () => store.close()
    }, 'dsh-memory-tasks: dispose store')
  }

  /** Create a task (管理界面 wire / 主代理 create_task 工具两入口共用). */
  create(input: TaskCreateInput): Task {
    const task = this.store.create(input)
    this.ctx.emit('memory/task-changed', task.id, task.status)
    return task
  }

  /** Update a task's title/goal/roles. */
  update(id: string, input: TaskUpdateInput): Task {
    return this.store.update(id, input)
  }

  /** Mark a task completed (idempotent). */
  complete(id: string): Task {
    const task = this.store.complete(id)
    this.ctx.emit('memory/task-changed', task.id, task.status)
    return task
  }

  /** List tasks; completed tasks are excluded by default (downweighting). */
  list(filter?: TaskListFilter): Task[] {
    return this.store.list(filter)
  }

  /** Read one task. */
  read(id: string): Task {
    return this.store.read(id)
  }

  /** The ids of active (non-completed) tasks — the memory engine's filter set. */
  activeTaskIds(): string[] {
    return this.store.activeTaskIds()
  }

  /** Whether a task is completed — the memory engine downweights completed-task L0/L1. */
  isCompleted(id: string): boolean {
    return this.store.isCompleted(id)
  }

  /**
   * Associate a session with a task (委派挂任务 / 会话挂任务).
   * @param taskId - the task id.
   * @param sessionId - the associated session.
   * @param roleId - the role that ran the session, when known.
   * @param kind - how the association was made.
   */
  attachSession(taskId: string, sessionId: string, roleId?: string, kind: TaskSessionKind = 'session'): Task {
    return this.store.attachSession(taskId, sessionId, roleId, kind)
  }

  /** Remove a session association. */
  detachSession(taskId: string, sessionId: string): void {
    this.store.detachSession(taskId, sessionId)
  }
}

export default Tasks
