/**
 * Session-level team mode: whether one session runs the standard delegation
 * surface or the team ("编制表") surface.
 *
 * Mode is a session dimension fully orthogonal to the agent preset: a session
 * runs either `standard` (the default, with `delegate`/`delegate_fork`) or
 * `team` (with `team_delegate`, whose role catalogue is the model's only
 * delegation surface). The choice is available before the session starts and
 * locked once a turn has run — the same blank-window contract the agent
 * preset carries.
 *
 * The durable truth is a log-only session event (`subagent-team/mode`) that
 * never enters the model transcript. `currentTeamMode` folds the last one, and
 * the delegation tools derive their visibility and their execution gate from
 * that fold, exactly as the agent preset derives the composition from
 * `agent-preset/selected`.
 * @module dsh-harness-subagent-bundle/team/mode
 */
import type { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
import type { SessionEvent } from '@deepseek-ai/dsh-session';
/** The session-level delegation surface. */
export type TeamMode = 'standard' | 'team';
/** The folded mode of one session. */
export interface TeamModeState {
    /** The active delegation surface; `standard` when no choice was recorded. */
    readonly mode: TeamMode;
    /** The team id a `team` session delegates to, present in team mode. */
    readonly team?: string;
}
declare module '@deepseek-ai/dsh-session/types' {
    interface SessionEventMap {
        /**
         * Records the session's delegation surface as durable, log-only intent.
         * It never enters the model transcript; the delegation tools read it
         * through {@link currentTeamMode}. Mirrors `agent-preset/selected`.
         */
        'subagent-team/mode': {
            mode: TeamMode;
            team?: string;
        };
    }
}
/** The tool names hidden from a `team` session (the standard delegation set). */
export declare const STANDARD_TOOLS: readonly ["delegate", "delegate_fork"];
/** The tool name hidden from a `standard` session (the team delegation set). */
export declare const TEAM_TOOL = "team_delegate";
/**
 * Fold the last recorded delegation surface from the durable log; replay
 * needs no catch-up state. A session with no record defaults to `standard`,
 * so a deployment without the mode feature behaves exactly as before.
 * @param events - session events in log order; other event types are ignored.
 * @returns the folded mode state.
 */
export declare function currentTeamMode(events: readonly SessionEvent[]): TeamModeState;
/**
 * Whether a session's conversation has started — one turn has run. The mode
 * (like the agent preset) is locked once a turn has run, because the tools the
 * model saw were produced under that surface and swapping them would strand
 * the logged tool calls. Standalone plugin events never open a turn.
 * @param events - session events in log order.
 * @returns true when the mode can no longer be changed.
 */
export declare function modeLocked(events: readonly SessionEvent[]): boolean;
/**
 * Apply the tool-visibility restriction that a session's mode implies, on the
 * agent's own scope: a `team` session hides the standard `delegate`/
 * `delegate_fork` tools, and a `standard` session hides `team_delegate`. The
 * schema the model sees is then decided per scope by the tool registry, while
 * the delegation tools' own execution gate re-checks the session fold as the
 * authoritative guard (a restriction may be absent on a cold-resumed session).
 *
 * Each name is denied only when the tool is actually registered in the agent's
 * scope — `tools.restrict` fails on unknown names, and a deployment may not
 * mount every delegation row. The returned disposers lift this restriction.
 * @param ctx - the host context, for the tool-registry visibility probe.
 * @param agent - the agent whose scope to restrict.
 * @param state - the session's folded mode.
 * @returns the disposers that lift the applied restrictions.
 */
export declare function applyModeRestrictions(ctx: Context, agent: Agent, state: TeamModeState): Array<() => void>;
//# sourceMappingURL=mode.d.ts.map