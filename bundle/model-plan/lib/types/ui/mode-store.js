/**
 * Session model-plan chip controller: the composer model seat's binding state.
 *
 * Each session binds a plan (not a bare model) plus an optional session-level
 * overrides bag. The host stays the single fact source: this controller reads
 * the session's current folded selection (`readSelection`) and the plan roster
 * (`list`) on load, and writes through `select`. A pick flips the local
 * current immediately and the host's reply reconciles it; a rejection (a
 * started session answers `model-plan-locked`) rolls the binding back and
 * surfaces the failure so the chip can tell the user why.
 */
import { createSnapshotStore } from '@deepseek-ai/dsh-client-runtime/client';
const INITIAL = {
    status: 'idle',
    planId: undefined,
    overrides: {},
    options: [],
    busy: false,
    error: null,
    locked: false,
};
/** The failure message of a rejected wire call. */
function messageOf(error) {
    return error instanceof Error ? error.message : String(error);
}
/** Map a wire plan onto a chip menu option. */
function planToOption(plan) {
    return {
        id: plan.id,
        provider: plan.provider,
        model: plan.model,
        paramCount: Object.keys(plan.params).length,
        isDefault: plan.isDefault,
        ...plan.broken === undefined ? {} : { broken: plan.broken },
    };
}
/**
 * The composer model seat's plan-binding controller. One per session, created
 * on the slot's session-scoped inject.
 */
export class ModelPlanChipController {
    plans;
    sessionId;
    /** Chip snapshot the renderer subscribes to. */
    store = createSnapshotStore(INITIAL);
    constructor(plans, sessionId) {
        this.plans = plans;
        this.sessionId = sessionId;
    }
    set(patch) {
        this.store.set({ ...this.store.getSnapshot(), ...patch });
    }
    /** Read the session's binding and the plan roster (parallel). */
    async load() {
        const before = this.store.getSnapshot();
        if (before.status === 'loading')
            return;
        this.set({ status: 'loading', error: null, locked: false });
        try {
            const selectionResult = await this.plans.readSelection({ sessionId: this.sessionId });
            if (!selectionResult.ok) {
                this.set({ status: 'error', error: selectionResult.error.message });
                return;
            }
            const rosterResult = await this.plans.list({});
            if (!rosterResult.ok) {
                this.set({ status: 'error', error: rosterResult.error.message });
                return;
            }
            this.set({
                status: 'ready',
                planId: selectionResult.value.planId,
                overrides: selectionResult.value.overrides,
                options: rosterResult.value.plans.map(planToOption),
                error: null,
                locked: false,
            });
        }
        catch (error) {
            this.set({ status: 'error', error: messageOf(error) });
        }
    }
    /**
     * Bind the session to one plan, optionally with session-level overrides.
     * A rejected pick (a started session) rolls the binding back and marks the
     * failure as a lock so the chip can explain it.
     */
    async select(planId, overrides) {
        const before = this.store.getSnapshot();
        if (before.busy)
            return;
        this.set({ busy: true, error: null, locked: false });
        try {
            const result = await this.plans.select({
                sessionId: this.sessionId,
                planId,
                ...overrides === undefined || Object.keys(overrides).length === 0 ? {} : { overrides },
            });
            if (!result.ok) {
                // `model-plan-locked` is this channel's own failure code, outside the
                // apiproxy's closed RpcErrorCode union — compare the wire code as a
                // string so a started session's rejection reads as a lock.
                const locked = result.error.code === 'model-plan-locked';
                this.set({ busy: false, error: result.error.message, locked });
                return;
            }
            this.set({
                busy: false,
                planId: result.value.planId,
                overrides: result.value.overrides,
                error: null,
                locked: false,
            });
        }
        catch (error) {
            this.set({ busy: false, error: messageOf(error) });
        }
    }
}
//# sourceMappingURL=mode-store.js.map