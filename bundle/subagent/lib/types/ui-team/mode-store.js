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
import { createSnapshotStore } from '@deepseek-ai/dsh-client-runtime/client';
const INITIAL = {
    status: 'idle',
    error: null,
    options: [{ id: 'standard', name: '' }],
    current: { mode: 'standard' },
    busy: false,
};
/** The failure message of a rejected wire call. */
function messageOf(error) {
    return error instanceof Error ? error.message : String(error);
}
/**
 * Read and drive one session's delegation surface for the input-chip.
 */
export class TeamModeController {
    teamPresets;
    sessionId;
    /** Chip snapshot the renderer subscribes to. */
    store = createSnapshotStore(INITIAL);
    /** The mode accepted before the in-flight pick, for a rejected-pick rollback. */
    lastAccepted = { mode: 'standard' };
    constructor(teamPresets, sessionId) {
        this.teamPresets = teamPresets;
        this.sessionId = sessionId;
    }
    set(patch) {
        this.store.set({ ...this.store.getSnapshot(), ...patch });
    }
    /**
     * Read the session's current mode and the available teams. The menu is
     * standard-first; a team mode whose team no longer exists still renders,
     * named by its id (the host folds the stored team id).
     */
    async load() {
        if (this.store.getSnapshot().status === 'loading')
            return;
        this.set({ status: 'loading', error: null });
        let mode;
        let teams;
        try {
            const [modeResult, listResult] = await Promise.all([
                this.teamPresets.modeRead({ sessionId: this.sessionId }),
                this.teamPresets.list({}),
            ]);
            if (!modeResult.ok) {
                this.set({ status: 'error', error: modeResult.error.message });
                return;
            }
            if (!listResult.ok) {
                this.set({ status: 'error', error: listResult.error.message });
                return;
            }
            mode = modeResult.value;
            teams = listResult.value.teams.map(team => ({
                id: team.id,
                name: team.metadata.name ?? team.id,
            }));
        }
        catch (error) {
            this.set({ status: 'error', error: messageOf(error) });
            return;
        }
        const current = mode.mode === 'team'
            ? { mode: 'team', ...mode.team === undefined ? {} : { team: mode.team } }
            : { mode: 'standard' };
        this.lastAccepted = current;
        this.set({
            status: 'ready',
            error: null,
            options: [
                { id: 'standard', name: '' },
                ...teams.map(team => ({ id: team.id, name: team.name, team: team.id })),
            ],
            current,
        });
    }
    /**
     * Select a surface for the session. The pick flips the local `current`
     * immediately (the browser never sees the host's broadcast), then the host
     * confirms; a `team-mode-locked` rejection — the session already started —
     * rolls back to the last accepted mode. A team that vanished since load is
     * left to the host to reject.
     * @param mode - the target surface.
     * @param team - the team id in team mode.
     */
    async select(mode, team) {
        if (this.store.getSnapshot().busy)
            return;
        const previous = this.store.getSnapshot().current;
        const next = mode === 'team'
            ? { mode: 'team', ...team === undefined ? {} : { team } }
            : { mode: 'standard' };
        // Optimistic flip: the UI reflects the pick before the host round-trips.
        this.set({ current: next, error: null, busy: true });
        try {
            const result = await this.teamPresets.modeSelect({
                sessionId: this.sessionId,
                mode,
                ...team === undefined ? {} : { team },
            });
            if (!result.ok) {
                // Rejected (e.g. the session started meanwhile): revert to the last
                // accepted mode and surface the reason.
                this.set({ current: this.lastAccepted, busy: false, error: result.error.message });
                return;
            }
            const accepted = result.value.mode === 'team'
                ? { mode: 'team', ...result.value.team === undefined ? {} : { team: result.value.team } }
                : { mode: 'standard' };
            this.lastAccepted = accepted;
            this.set({ current: accepted, busy: false, error: null });
        }
        catch (error) {
            this.set({ current: previous, busy: false, error: messageOf(error) });
        }
    }
}
//# sourceMappingURL=mode-store.js.map