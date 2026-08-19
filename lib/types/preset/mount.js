/**
 * Mount one subagent's plugin tree onto a child agent's scope context.
 *
 * The plugin-tree mounting mechanism is the same one agent presets use — the
 * cordis composition built from `agent.cordis.yml` — so this module reuses
 * `mountPreset` from `dsh-agent-presets` rather than duplicating the loader
 * wiring. The subagent registry stays fully separate from the agent-preset
 * roster: a subagent is resolved here by its OWN id, an `AgentPreset`-shaped
 * value pointing at the subagent's composition file is constructed, and
 * `mountPreset` mounts it onto the child. The subagent never enters the
 * agent-preset list.
 *
 * When the subagent binds a model-plan (its metadata `model` is a plan id),
 * the child session is pointed at that plan so the model-plan merge
 * interceptor (registered on every `agent/request`) routes the child's
 * requests to the plan's provider/model/params. The binding is a log-only
 * `model-plan/select` event marked `ignorable: true` — the same escape hatch
 * the model-plan bundle's own select path uses — so a reader without the
 * feature replays the child on the official route.
 *
 * The tree is owned by the child's scope, so it unwinds with the child and
 * never touches how a session's agent joins its preset.
 * @module dsh-harness-subagent-bundle/preset/mount
 */
import { mountPreset } from '@deepseek-ai/dsh-agent-presets';
/**
 * Mount one subagent's plugin tree onto a child agent's own scope.
 *
 * Called from the child's creation window. A broken subagent is refused up
 * front, so a delegation that names one rolls the child creation back rather
 * than publishing a half-composed agent.
 * @param childCtx - the child agent's scoped creation context.
 * @param subagent - the resolved subagent to mount onto the child.
 * @throws when the subagent's composition is unusable, or `childCtx` carries
 * no scope.
 */
export async function mountSubagentOnChild(childCtx, subagent) {
    // Construct an agent-preset-shaped value pointing at the subagent's
    // composition file. `mountPreset` only reads `path` (plus `id` for
    // diagnostics) and never consults the agent-preset roster, so the subagent
    // mounts exactly as an agent preset would without entering its list.
    await mountPreset(childCtx, {
        id: subagent.id,
        trust: 'user',
        path: subagent.path,
    });
    // A subagent bound to a model-plan points the child session at that plan so
    // the model-plan merge interceptor routes the child's requests. The append
    // is guarded on the child agent's live session being present (a pure
    // `childCtx` in unit tests has none) and on the subagent actually carrying a
    // plan id — an unbound subagent stays on the existing inheritance path.
    const planId = subagent.metadata.model;
    const childAgent = childCtx.agent;
    if (planId !== undefined && childAgent?.session !== undefined) {
        appendModelPlanSelect(childAgent.session, planId);
    }
}
/**
 * Append a `model-plan/select` event to a child session, marking it ignorable.
 *
 * UPSTREAM-SYNC NOTE (type escape hatch): the published
 * `@deepseek-ai/dsh-session` `Session.append` signature predates the upstream
 * `ignorable` surface; the harness depends on the npm package, not the in-repo
 * session package whose append DOES consume the trailing flag. A bundle never
 * constructs a Session — it calls the host instance's append, and the host is
 * the official CLI running the rebuilt in-repo session package. So this bound
 * append is asserted to accept it (the same `AppendWithIgnorable` escape the
 * subagent team bundle and the model-plan bundle's own `ModelPlans.select`
 * use); at runtime the third argument lands as `ignorable: true` on the event.
 * @param session - the child's live session.
 * @param planId - the plan id the subagent binds.
 */
function appendModelPlanSelect(session, planId) {
    const appendIgnorable = session.append.bind(session);
    appendIgnorable('model-plan/select', { planId }, true);
}
//# sourceMappingURL=mount.js.map