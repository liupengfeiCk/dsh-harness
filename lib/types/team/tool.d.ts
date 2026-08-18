/**
 * Model-facing TEAM delegation through one configured `ctx.subagents` provider.
 *
 * A team tool instance is bound to ONE team (the roster of roles a user built
 * ahead of time). The model picks a `role` from that team's catalogue; the tool
 * resolves the role's subagent (a user-defined subagent id — the hard
 * capability boundary) and prompt (the role's own prompt — the soft behaviour
 * guide), and starts a child through `ctx.subagents` composed from both.
 *
 * Two memory policies decide the execution route:
 * - `one-shot` roles start a fresh child every call (foreground by default,
 *   background as a collectable job) and dissolve after the task.
 * - `persistent` roles start a durable continuable child through
 *   `startContinuable`, persisting `{ team, role }` in the descriptor so a cold
 *   resume re-resolves the role from the team's latest definition (reference
 *   semantics) and re-injects its prompt persona + subagent tree.
 *
 * In team form the main agent sees ONLY the team's role catalogue — never the
 * bare subagent roster. That is a COMPOSITION CONVENTION, not hidden logic: a
 * team-shaped deployment mounts this `team_delegate` row and simply does not
 * mount the plain `delegate`/`subagent` rows, so the subagent catalogue never
 * reaches the model. See the README team chapter.
 * @module dsh-harness-subagent-bundle/team/tool
 */
import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import type { AgentOptions } from '@deepseek-ai/dsh-agent';
export declare const name = "team-in-process-tool";
export declare const inject: string[];
/** Config: which team and provider this tool delegates to. */
export interface Config {
    /** The team id this instance serves. */
    team: string;
    /** The `ctx.subagents` provider name to start runs on (e.g. `spawn`, `fork`). */
    provider: string;
    /**
     * Model-facing tool name (default `team_delegate`). Each loaded instance must
     * use a distinct name.
     */
    toolName?: string;
    /**
     * Expose `run_in_background` (default true). Applies to `one-shot` roles;
     * `persistent` roles always run as durable continuable children.
     */
    enableRunInBackground?: boolean;
    /**
     * Agent options applied to every child; omitted fields use child-loop defaults.
     */
    agentOptions?: AgentOptions;
    /**
     * Maximum child depth (default `3`; `0` forbids delegation), or
     * `'provider-managed'` to send no cap.
     */
    maxDepth?: number | 'provider-managed';
}
export declare const Config: z<Config>;
export declare function apply(ctx: Context, config: Config): void;
//# sourceMappingURL=tool.d.ts.map