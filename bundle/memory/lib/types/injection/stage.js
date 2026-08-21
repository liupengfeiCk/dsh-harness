/**
 * Four-stage memory-injection timing model (§4.2).
 *
 * The design drives when memory content is injected into the session:
 *
 *   stage 1 — NEW SESSION FIRST TURN: install the static memory snapshot
 *             (L3 persona + L2 scene nav) and run one L1 three-dimensional
 *             mixed recall.
 *   stage 2 — DURING SESSION (PRE-COMPRESSION): inject NO changing content —
 *             no L1 recall, no memory refresh. The system stays constant.
 *   stage 3 — COMPRESSION POINT: run the hierarchical compaction and install
 *             the latest snapshot (the prefix cache is discarded anyway).
 *   stage 4 — POST-COMPRESSION: L1 mixed recall starts, injected every turn.
 *
 * The injection targets the LOGGED channel (the `agent/pre-step` message
 * surface), not the request config, so the system segment stays byte-stable
 * (the "system 恒定" property) and the dynamic fields (L1 recall) never mix
 * into the system.
 *
 * @module dsh-harness-memory-bundle/injection/stage
 */
/** The four-stage injection timing model. */
export const STAGE_ORDER = ['first-turn', 'pre-compression', 'compression', 'post-compression'];
/** Transition guard helper: the legal stage that follows a compression. */
export function afterCompressionStage(stage) {
    return stage === 'post-compression' ? 'post-compression' : 'compression';
}
/** The stage a fresh session begins in. */
export const INITIAL_STAGE = 'first-turn';
/**
 * Decide the injection plan for a stage.
 * - first-turn: snapshot + first L1.
 * - pre-compression: nothing (system constant, no L1).
 * - compression: snapshot refresh only (latest L3/L2), no L1 (cache discarded).
 * - post-compression: L1 every turn, no snapshot re-install.
 */
export function planForStage(stage, recall) {
    const snapshotText = recall.appendSystemContext?.trim();
    const l1Text = recall.prependContext?.trim();
    switch (stage) {
        case 'first-turn':
            return {
                ...(snapshotText === undefined || snapshotText.length === 0 ? {} : { snapshot: { text: snapshotText } }),
                ...(l1Text === undefined || l1Text.length === 0 ? {} : { l1: { text: l1Text } }),
            };
        case 'pre-compression':
            return {};
        case 'compression':
            return snapshotText === undefined || snapshotText.length === 0
                ? {}
                : { snapshot: { text: snapshotText } };
        case 'post-compression':
            return l1Text === undefined || l1Text.length === 0
                ? {}
                : { l1: { text: l1Text } };
    }
}
/**
 * A per-session stage ledger. The pre-step handler reads/advances it. Kept
 * separate from the session object so it is trivially unit-testable.
 */
export class StageLedger {
    states = new Map();
    /** Current stage for a session key, defaulting to the initial stage. */
    get(sessionKey) {
        return this.states.get(sessionKey) ?? INITIAL_STAGE;
    }
    /** Set the stage for a session key. */
    set(sessionKey, stage) {
        this.states.set(sessionKey, stage);
    }
    /**
     * Advance through the timing model: after the first turn runs, move to
     * pre-compression (unless already post-compression); a compression event
     * moves to post-compression.
     */
    enterPreCompression(sessionKey) {
        const current = this.get(sessionKey);
        // Never regress a post-compression session back to pre-compression.
        if (current === 'post-compression' || current === 'compression')
            return;
        this.states.set(sessionKey, 'pre-compression');
    }
    /** Record a compression; the session now injects L1 every turn. */
    enterPostCompression(sessionKey) {
        this.states.set(sessionKey, 'post-compression');
    }
    /** Remove all ledger state for a session (agent teardown). */
    clear(sessionKey) {
        this.states.delete(sessionKey);
    }
}
//# sourceMappingURL=stage.js.map