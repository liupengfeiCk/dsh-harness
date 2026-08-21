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
/** A task's lifecycle. */
export type TaskStatus = 'running' | 'completed';
/** One responsible role plus its intra-task division (任务内分工). */
export interface TaskRole {
    /** The team-role id responsible for a slice of this task. */
    readonly roleId: string;
    /** What this role is responsible for within the task. */
    readonly division: string;
}
/** How a session came to be associated with a task. */
export type TaskSessionKind = 'session' | 'delegation';
/** A session associated with a task (会话挂任务 / 委派挂任务). */
export interface TaskSession {
    /** The associated session id. */
    readonly sessionId: string;
    /** The role that ran this session, when known (delegation attaches it). */
    readonly roleId?: string;
    /** How the association was made. */
    readonly kind: TaskSessionKind;
    /** ISO timestamp of the association. */
    readonly attachedAt: string;
}
/** A persistent business task (design §7 F10). */
export interface Task {
    /** Stable unique id (uuid). */
    readonly id: string;
    /** Short title. */
    readonly title: string;
    /** The task's objective (目标). */
    readonly goal: string;
    /** Lifecycle status. */
    readonly status: TaskStatus;
    /** Responsible roles and their intra-task division. */
    readonly roles: readonly TaskRole[];
    /** ISO creation timestamp. */
    readonly createdAt: string;
    /** ISO completion timestamp, or null while running. */
    readonly completedAt: string | null;
    /** Sessions associated with this task. */
    readonly sessions: readonly TaskSession[];
}
/** A durable task record as stored (one row per task). */
export interface StoredTask {
    readonly id: string;
    readonly title: string;
    readonly goal: string;
    readonly status: TaskStatus;
    readonly rolesJson: string;
    readonly createdAt: string;
    readonly completedAt: string | null;
}
/** A task-session association row. */
export interface StoredTaskSession {
    readonly taskId: string;
    readonly sessionId: string;
    readonly roleId: string | null;
    readonly kind: TaskSessionKind;
    readonly attachedAt: string;
}
/** Fields accepted when creating a task. */
export interface TaskCreateInput {
    readonly title: string;
    readonly goal: string;
    readonly roles?: readonly TaskRole[];
}
/** Fields accepted when updating a task. */
export interface TaskUpdateInput {
    readonly title?: string;
    readonly goal?: string;
    readonly roles?: readonly TaskRole[];
}
/** List filter controlling whether completed tasks are returned. */
export interface TaskListFilter {
    /**
     * When false (the default), completed tasks are EXCLUDED — the downweighting
     * rule "default retrieval omits completed, explicit query shows them".
     */
    readonly includeCompleted?: boolean;
}
/** The default: active tasks only. */
export declare const DEFAULT_TASK_FILTER: Required<TaskListFilter>;
/** A task was not found. */
export declare class UnknownTaskError extends Error {
    readonly taskId: string;
    readonly available: readonly string[];
    constructor(taskId: string, available: readonly string[]);
}
/** A create/update payload was invalid. */
export declare class InvalidTaskInputError extends Error {
    constructor(reason: string);
}
//# sourceMappingURL=types.d.ts.map