/**
 * T12 child-session inheritance wiring.
 *
 * The main conversation's hierarchical summary is injected into every live
 * child as a shared "public memory" (§4.4 inheritance mode). This module:
 *
 *   1. Recognises subagent children (`header.origin === 'subagent'` with a
 *      `parentSession`) at `agent/created`.
 *   2. Assembles the main session's summary layers into a public section and
 *      registers it on the child's system prompt as `memory:inherited-main`,
 *      with a synchronous text provider reading the process-local cache.
 *   3. When the main session compresses (its cache entry refreshes), every live
 *      child reads the updated text on its next assembly — the compression-
 *      refresh mechanism, byte-identical across children (prefix sharing).
 *   4. Honors the per-role `inheritMainSummaries` switch (default `true`): a
 *      role that opts out removes the section once its `subagent/descriptor`
 *      (carrying `team`/`role`) is appended — non-inheritance mode, orthogonal
 *      to the role's `memory` (role-sedimentation) policy.
 *
 * The public section is byte-stable: same main session → same cached text →
 * every child renders the identical prefix. A child never builds its own
 * hierarchical-summary system; its session-internal summaries ARE its role
 * memory (§4.4), produced by the ordinary T8/T9 compression of its own history.
 *
 * @module dsh-harness-memory-bundle/inheritance/inject
 */
import { PublicSectionCache } from "./cache.js";
import { assemblePublicSection, INHERITED_MAIN_ORDER, INHERITED_MAIN_SECTION, } from "./public-section.js";
/**
 * Install the inheritance wiring on `ctx`. Returns a refresh function: invoke
 * it after the main session compresses to reload the summary layers and update
 * the shared public-section cache (children pick the new text on next assembly).
 */
export function installInheritance(ctx, deps) {
    const cache = new PublicSectionCache();
    const children = new Map();
    ctx.on('agent/created', (payload) => {
        const { agent } = payload;
        const header = agent.session.header;
        // Only a subagent child inherits; a top-level session is its own main.
        if (header.origin !== 'subagent' || header.parentSession === undefined)
            return;
        const mainSessionId = String(header.parentSession);
        const childId = String(agent.session.id);
        if (children.has(childId))
            return;
        // Warm the cache so the first assembly already carries the main's public
        // section (empty when the main has produced no summaries yet).
        void deps.loadLayers(mainSessionId).then(layers => {
            cache.set(mainSessionId, assemblePublicSection(layers));
        });
        // Register the inherited-main section; the text provider reads the cache
        // synchronously so a later main compression flows through automatically.
        const disposer = agent.ctx.systemPrompt.section({
            name: INHERITED_MAIN_SECTION,
            order: INHERITED_MAIN_ORDER,
            text: () => cache.get(mainSessionId),
        });
        const record = { mainSessionId, disposer, resolved: false };
        children.set(childId, record);
    });
    // Resolve the per-role inheritance switch as soon as a child's descriptor
    // (team/role) lands. A role that opts out drops its section.
    ctx.on('session/event', (session, event) => {
        if (event.type !== 'subagent/descriptor')
            return;
        const childId = String(session.id);
        const record = children.get(childId);
        if (record === undefined || record.resolved)
            return;
        record.resolved = true;
        void resolveInheritsMain(session, deps).then(inherits => {
            if (inherits)
                return;
            record.disposer();
            children.delete(childId);
            deps.log?.(`[memory] child ${childId}: role disables inheritMainSummaries; public section removed`);
        });
    });
    // Refresh the cache after the main session compresses. Layers are reloaded so
    // every live child sees the new public section on its next assembly.
    return async (sessionId) => {
        const layers = await deps.loadLayers(sessionId);
        cache.set(sessionId, assemblePublicSection(layers));
        ctx.emit('system-prompt/change');
    };
}
/**
 * Resolve whether a child's role inherits the main summaries.
 *
 * The role is read from the child's `subagent/descriptor` event (folded here
 * structurally to avoid importing the subagent bundle). Defaults to `true` when
 * the role cannot be resolved (no descriptor, no teams registry, unknown role).
 */
async function resolveInheritsMain(session, deps) {
    const teams = deps.teams?.();
    if (teams === undefined)
        return true;
    const identity = descriptorRole(session);
    if (identity === undefined)
        return true;
    try {
        const role = await teams.resolveRole(identity.teamId, identity.roleId);
        return role.inheritMainSummaries !== false;
    }
    catch {
        // Unknown team/role or a broken role → keep the safe default (inherit).
        return true;
    }
}
/** Read `team`/`role` from a child's `subagent/descriptor` event, structurally. */
function descriptorRole(session) {
    // The session event array's static type is a narrow union that does not
    // declare the harness-extended `subagent/descriptor` event; widen to read it.
    const events = session.events;
    const found = events.find(candidate => candidate.type === 'subagent/descriptor');
    if (found === undefined)
        return undefined;
    // The event array is a wide union of many event shapes; narrow the matched
    // descriptor structurally so `.data` carries `team`/`role`.
    // Read `team`/`role` structurally from the descriptor payload (the subagent
    // bundle's exact schema is opaque here — we never import it).
    const payload = found.data;
    const data = typeof payload === 'object' && payload !== null ? payload : {};
    const team = data.team;
    const role = data.role;
    if (typeof team !== 'string' || typeof role !== 'string')
        return undefined;
    return { teamId: team, roleId: role };
}
//# sourceMappingURL=inject.js.map