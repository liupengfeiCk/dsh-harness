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
export declare const STAGE_ORDER: readonly ["first-turn", "pre-compression", "compression", "post-compression"];
export type InjectionStage = typeof STAGE_ORDER[number];
/** Transition guard helper: the legal stage that follows a compression. */
export declare function afterCompressionStage(stage: InjectionStage): InjectionStage;
/** The stage a fresh session begins in. */
export declare const INITIAL_STAGE: InjectionStage;
/**
 * Decide which memory content to inject for a given stage.
 * Pure decision — the caller supplies the recall output, this returns the
 * message list (each as `{ role: 'user', text, kind }`), or nothing.
 */
export interface InjectionPlan {
    /** The snapshot message to inject (L3 persona + L2 scene nav), or undefined. */
    readonly snapshot?: {
        readonly text: string;
    };
    /** The L1 recall prefix message to inject, or undefined. */
    readonly l1?: {
        readonly text: string;
    };
}
/**
 * Decide the injection plan for a stage.
 * - first-turn: snapshot + first L1.
 * - pre-compression: nothing (system constant, no L1).
 * - compression: snapshot refresh only (latest L3/L2), no L1 (cache discarded).
 * - post-compression: L1 every turn, no snapshot re-install.
 */
export declare function planForStage(stage: InjectionStage, recall: {
    readonly prependContext?: string;
    readonly appendSystemContext?: string;
}): InjectionPlan;
/**
 * A per-session stage ledger. The pre-step handler reads/advances it. Kept
 * separate from the session object so it is trivially unit-testable.
 */
export declare class StageLedger {
    private readonly states;
    /** Current stage for a session key, defaulting to the initial stage. */
    get(sessionKey: string): InjectionStage;
    /** Set the stage for a session key. */
    set(sessionKey: string, stage: InjectionStage): void;
    /**
     * Advance through the timing model: after the first turn runs, move to
     * pre-compression (unless already post-compression); a compression event
     * moves to post-compression.
     */
    enterPreCompression(sessionKey: string): void;
    /** Record a compression; the session now injects L1 every turn. */
    enterPostCompression(sessionKey: string): void;
    /** Remove all ledger state for a session (agent teardown). */
    clear(sessionKey: string): void;
}
//# sourceMappingURL=stage.d.ts.map