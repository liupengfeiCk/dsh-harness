/**
 * dsh-harness-memory-bundle/ingestion/attribution — derive the DSH identity
 * coordinates (design §3.4 三维正交, §4.1 归属坐标系) for one live session.
 *
 * The vendor engine groups conversations by `sessionKey` and tags L1 records
 * with `teamId`/`agentId`/`taskId`. On the DSH side those coordinates come from
 * the live session's own context, not from a plugin config:
 *
 *   - `team`    — folded from the session's durable `subagent-team/mode` event
 *     (the same fold the subagent bundle uses); defaults to `'default'`.
 *   - `role`    — the roster role the session runs as: a subagent child reads
 *     its role from the task association's `roleId`, else the main session is
 *     the primary-agent identity `'main'`.
 *   - `project` — the session's absolute working directory (`header.cwd`).
 *   - `task`    — the task this session is associated with (via the tasks
 *     registry's `task_sessions` ledger), when any.
 *   - `session` — the session id.
 *   - `user`    — the single-user harness identity.
 *
 * This module deliberately does NOT value-import the subagent bundle: it folds
 * the `subagent-team/mode` session event structurally (the event carries
 * `ignorable: true` and never enters the model transcript), keeping the memory
 * bundle self-contained. The derived coordinates are plain data, so T6's scope
 * routing (once its architecture is chosen) only needs to change
 * {@link encodeSessionKey} / how the coordinates feed the engine.
 *
 * @module dsh-harness-memory-bundle/ingestion/attribution
 */
/** The single-user harness identity for attribution. */
export const DEFAULT_USER_ID = 'default_user';
/** The primary-agent role identity for a top-level (main) session. */
export const MAIN_AGENT_ROLE = 'main';
/** The fallback team when a session has no `subagent-team/mode` event. */
export const DEFAULT_TEAM = 'default';
/**
 * Fold the last `subagent-team/mode` event from a session's event log.
 * @param events - the session's event log.
 * @returns the selected team id, or {@link DEFAULT_TEAM}.
 */
export function foldTeamMode(events) {
    for (let index = events.length - 1; index >= 0; index -= 1) {
        const event = events[index];
        if (event === undefined)
            continue;
        // `subagent-team/mode` is not a member of the core `SessionEventMap`, so a
        // literal comparison on the typed union would narrow `event` to `never`.
        // Treat it as the structurally-known event shape and compare on that.
        const candidate = event;
        if (candidate.type !== 'subagent-team/mode')
            continue;
        const data = candidate.data;
        if (data?.mode === 'team' && typeof data.team === 'string' && data.team.length > 0) {
            return data.team;
        }
        // A `standard` selection clears any prior team selection.
        return DEFAULT_TEAM;
    }
    return DEFAULT_TEAM;
}
/**
 * Find the task id and (subagent) role a session is associated with, if any.
 * @param ctx - the harness context (reads `ctx.tasks` structurally).
 * @param sessionId - the session to look up.
 * @returns `{ task, role }` — the task id and the role it ran under — or
 *   `{ task: undefined, role: undefined }` when the session belongs to no task.
 */
function taskRoleForSession(ctx, sessionId) {
    const tasks = ctx.get('tasks');
    if (tasks === undefined)
        return {};
    for (const task of tasks.list()) {
        const assoc = task.sessions.find((s) => s.sessionId === sessionId);
        if (assoc !== undefined) {
            // exactOptionalPropertyTypes forbids assigning `undefined` to an optional
            // member, so branch on the presence of the role instead.
            return assoc.roleId === undefined
                ? { task: task.id }
                : { task: task.id, role: assoc.roleId };
        }
    }
    return {};
}
/**
 * Derive the attribution coordinates for a live session.
 * @param ctx - the harness context (provides the tasks registry structurally).
 * @param session - the live session (header + event log).
 * @returns the derived coordinates.
 */
export function deriveTurnAttribution(ctx, session) {
    const header = session.header;
    const sessionId = String(session.id);
    const team = foldTeamMode(session.events);
    // A subagent child carries its roster role through the task association (its
    // `roleId` in the ledger); a top-level session is the primary agent. When the
    // session runs under a task but no role was recorded, fall back to the
    // primary-agent identity (the main agent's own turns still name `main`).
    const { task, role } = taskRoleForSession(ctx, sessionId);
    return {
        team,
        role: role ?? MAIN_AGENT_ROLE,
        project: header.cwd ?? '',
        ...(task === undefined ? {} : { task }),
        session: sessionId,
        user: DEFAULT_USER_ID,
    };
}
/**
 * Encode an attribution into the vendor `sessionKey` (L0/L1 grouping + pipeline
 * session identity). The encoding is the single place the DSH identity maps to
 * the vendor's session grouping, so T6's scope routing changes only here.
 * @param attribution - the derived coordinates.
 * @returns the vendor session key.
 */
export function encodeSessionKey(attribution) {
    const parts = [
        attribution.team,
        attribution.role,
        attribution.project,
        attribution.task ?? '',
        attribution.session,
    ];
    return parts.join('/');
}
//# sourceMappingURL=attribution.js.map