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
import type { Context } from '@deepseek-ai/cordis';
import type { LayerSummary } from '../compaction/types.ts';
/** The `ctx.get('teams')` surface we consume structurally (no subagent import). */
interface TeamRoleLike {
    readonly inheritMainSummaries?: boolean;
}
interface TeamsLike {
    resolveRole(teamId: string, roleId: string): Promise<TeamRoleLike>;
}
/** Dependencies for the inheritance wiring. */
export interface InheritanceDeps {
    /** Read one session's persisted summary layers. */
    loadLayers(sessionId: string): Promise<readonly LayerSummary[]>;
    /** Structured access to the teams registry (role inheritance config). */
    teams?: () => TeamsLike | undefined;
    /** Optional logger. */
    log?: (message: string) => void;
}
/**
 * Install the inheritance wiring on `ctx`. Returns a refresh function: invoke
 * it after the main session compresses to reload the summary layers and update
 * the shared public-section cache (children pick the new text on next assembly).
 */
export declare function installInheritance(ctx: Context, deps: InheritanceDeps): (sessionId: string) => Promise<void>;
export {};
//# sourceMappingURL=inject.d.ts.map