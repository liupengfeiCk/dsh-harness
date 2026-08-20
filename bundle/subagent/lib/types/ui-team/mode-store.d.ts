/**
 * Session team-mode chip controller: which delegation surface the CURRENT
 * session runs — the standard surface or a user-defined team ("编制表").
 *
 * Unlike the settings section's roster, the mode is a per-session dimension
 * and the chip sits on a session's input card, so this controller is created
 * per session (its `sessionId` feeds every wire call). The choice is only
 * available before the session starts — once a turn has run the host refuses
 * the swap — which the chip reflects by disabling itself on a non-blank
 * session and the host enforces again on `modeSelect` (a `team-mode-locked`
 * result rolls the optimistic pick back).
 *
 * The browser never sees the host's `mode-selected` broadcast (the forwarding
 * whitelist is owned by the official package), so a pick optimistically flips
 * the local `current` immediately and reconciles against the host's reply;
 * a rejected pick reverts to the last accepted state. The durable truth is
 * the session event the host folds, so a later `modeRead` stays authoritative.
 * @module dsh-harness-subagent-bundle/ui-team/mode-store
 */
import { type SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client';
import type { TeamPresetWire, WireTeamMode } from './wire-client.ts';
/** One menu entry: the standard surface or one selectable team. */
export interface TeamModeOption {
    /** The option's select id: `'standard'`, else the team id. */
    readonly id: string;
    /** Display name (a team's `metadata.name`, falling back to its id). */
    readonly name: string;
    /** The team id this option selects; absent for the standard surface. */
    readonly team?: string;
}
/** The mode currently folded for the session. */
export interface TeamModeSelection {
    readonly mode: WireTeamMode;
    /** The team id in team mode; absent in standard mode. */
    readonly team?: string;
}
/** Chip snapshot. */
export interface TeamModeState {
    status: 'idle' | 'loading' | 'ready' | 'error';
    /** Whole-load failure text; a rejected pick surfaces through `error`. */
    error: string | null;
    /** The menu: standard first, then every enabled team, in roster order. */
    options: readonly TeamModeOption[];
    /** The session's current folded mode. */
    current: TeamModeSelection;
    /** Whether a pick is in flight (guards re-entry and disables the trigger). */
    busy: boolean;
}
/**
 * Read and drive one session's delegation surface for the input-chip.
 */
export declare class TeamModeController {
    private readonly teamPresets;
    private readonly sessionId;
    /** Chip snapshot the renderer subscribes to. */
    readonly store: SnapshotStore<TeamModeState>;
    /** The mode accepted before the in-flight pick, for a rejected-pick rollback. */
    private lastAccepted;
    constructor(teamPresets: TeamPresetWire, sessionId: string);
    private set;
    /**
     * Read the session's current mode and the available teams. The menu is
     * standard-first; a team mode whose team no longer exists still renders,
     * named by its id (the host folds the stored team id).
     */
    load(): Promise<void>;
    /**
     * Select a surface for the session. The pick flips the local `current`
     * immediately (the browser never sees the host's broadcast), then the host
     * confirms; a `team-mode-locked` rejection — the session already started —
     * rolls back to the last accepted mode. A team that vanished since load is
     * left to the host to reject.
     * @param mode - the target surface.
     * @param team - the team id in team mode.
     */
    select(mode: WireTeamMode, team?: string): Promise<void>;
}
//# sourceMappingURL=mode-store.d.ts.map