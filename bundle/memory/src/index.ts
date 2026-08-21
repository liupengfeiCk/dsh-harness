/**
 * dsh-harness-memory-bundle — the Harness-owned memory subsystem as a profile
 * bundle. Pure host package: the bundle's substance is `cordis.patch.yml`
 * (declared by the `dsh.bundle.patch` manifest field and resolved by the profile
 * composer through that field). This host entry aggregates the bundle's public
 * surface:
 *
 *   - `tasks` — the task-entity registry (design §7 F10): `Tasks` host service
 *     plus its `/memory-task` wire and `create_task` tool (mounted as separate
 *     host rows via subpath exports).
 *   - `compaction` — the session-internal hierarchical compaction subsystem
 *     (T8), a pure data model + engine imported by T9/T10.
 *   - `memory` — (T3) the TencentDB memory engine adaptation (vendor MemoryCore)
 *     as the `memory` host service, constructed with the bundle's HostAdapter +
 *     LLMRunner.
 *
 * Note: the `tasks`/`memory-task-wire`/`memory-task-tool` patch rows mount their
 * modules via subpath exports (`./tasks`, `./tasks/wire`, `./tasks/tool`), so
 * this entry carries no default plugin body in the T2 skeleton. The `memory`
 * engine row (T3) will mount `name: 'dsh-harness-memory-bundle'` and add the
 * engine's host wiring here.
 * @module dsh-harness-memory-bundle
 */

// Task-entity registry (design §7 F10). `Tasks` is the cordis service default
// exported from `./tasks`, mounted by the `tasks` patch row.
export { Tasks } from './tasks/index.ts'
export { TaskStore, taskDbPath } from './tasks/store.ts'
export type {
  StoredTask, StoredTaskSession, Task, TaskCreateInput, TaskListFilter,
  TaskRole, TaskSession, TaskSessionKind, TaskStatus, TaskUpdateInput,
} from './tasks/types.ts'

// Session-internal hierarchical compaction subsystem (T8) — public surface.
// The subsystem's own barrel (`./compaction/index.ts`) is the single public
// face; re-export it wholesale so host consumers get the engine, the layer
// planner, the summarizer, the storage, and the tagging helpers.
export * from './compaction/index.ts'
