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
export const DEFAULT_TASK_FILTER = { includeCompleted: false };
/** A task was not found. */
export class UnknownTaskError extends Error {
    taskId;
    available;
    constructor(taskId, available) {
        super(`task "${taskId}" does not exist (available: ${available.length === 0 ? 'none' : available.join(', ')})`);
        this.taskId = taskId;
        this.available = available;
        this.name = 'UnknownTaskError';
    }
}
/** A create/update payload was invalid. */
export class InvalidTaskInputError extends Error {
    constructor(reason) {
        super(`invalid task input: ${reason}`);
        this.name = 'InvalidTaskInputError';
    }
}
//# sourceMappingURL=types.js.map