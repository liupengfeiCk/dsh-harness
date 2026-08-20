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
    overrideDraft: [],
    overrideError: null,
    options: [],
    busy: false,
    error: null,
    locked: false,
};
/** The failure message of a rejected wire call. */
function messageOf(error) {
    return error instanceof Error ? error.message : String(error);
}
/** The common wire names pre-seeded into the override editor (blank, all removable). */
export const KNOWN_KEYS = ['temperature', 'max_tokens', 'top_p'];
/**
 * Whether a text is a legal JSON scalar per the wire's JSON-value vocabulary
 * (string / number / boolean / null / array / object). The empty string is not.
 * Mirrors the settings section's own check so both surfaces agree.
 */
export function isJsonValue(text) {
    if (text.trim() === '')
        return false;
    try {
        JSON.parse(text);
        return true;
    }
    catch {
        return false;
    }
}
/** Map an overrides record onto editable draft rows (familiar-key order first). */
function overridesToDraft(overrides) {
    const entries = Object.entries(overrides);
    if (entries.length === 0)
        return [{ key: '', value: '' }];
    const known = KNOWN_KEYS.filter(key => entries.some(([k]) => k === key));
    const ordered = [
        ...known,
        ...entries.map(([k]) => k).filter(k => !KNOWN_KEYS.includes(k)),
    ];
    return ordered.map(key => ({ key, value: JSON.stringify(overrides[key]) }));
}
/** Parse the typed override rows back onto a JSON-value params record. */
function draftToOverrides(rows) {
    const bag = {};
    for (const row of rows) {
        if (row.key.trim() === '' || !isJsonValue(row.value))
            continue;
        bag[row.key] = JSON.parse(row.value);
    }
    return bag;
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
                overrideDraft: overridesToDraft(selectionResult.value.overrides),
                overrideError: null,
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
     *
     * When `overrides` is omitted the CURRENT session overrides are carried over
     * to the new plan (a plan switch never drops the user's live overrides — they
     * ride above whichever plan is bound), so "换方案后覆盖仍在且优先级高于方案参数"
     * holds. Pass an explicit `{}` to clear them.
     */
    async select(planId, overrides) {
        const before = this.store.getSnapshot();
        if (before.busy)
            return;
        const effective = overrides ?? before.overrides;
        this.set({ busy: true, error: null, locked: false, overrideError: null });
        try {
            const result = await this.plans.select({
                sessionId: this.sessionId,
                planId,
                ...Object.keys(effective).length === 0 ? {} : { overrides: effective },
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
                overrideDraft: overridesToDraft(result.value.overrides),
                overrideError: null,
                error: null,
                locked: false,
            });
        }
        catch (error) {
            this.set({ busy: false, error: messageOf(error) });
        }
    }
    /**
     * Seed the override editor from the current session overrides (an empty bag
     * yields one blank row to type into). Called when the menu opens so the
     * active overrides are always visible and editable.
     */
    beginOverrideDraft() {
        const { overrides, busy } = this.store.getSnapshot();
        if (busy)
            return;
        this.set({ overrideDraft: overridesToDraft(overrides), overrideError: null });
    }
    /** Set one override row's key (editable inline). */
    setOverrideKey(index, key) {
        this.patchOverrideDraft(rows => rows.map((row, i) => i === index ? { ...row, key } : row));
    }
    /** Set one override row's value (typed string form). */
    setOverrideValue(index, value) {
        this.patchOverrideDraft(rows => rows.map((row, i) => i === index ? { ...row, value } : row));
    }
    /** Append an empty override row. */
    addOverrideRow() {
        this.patchOverrideDraft(rows => [...rows, { key: '', value: '' }]);
    }
    /** Remove one override row. */
    removeOverrideRow(index) {
        this.patchOverrideDraft(rows => rows.filter((_, i) => i !== index));
    }
    /** The first blocker preventing the override draft from saving, as a reason, or null. */
    overrideBlocker() {
        for (const row of this.store.getSnapshot().overrideDraft) {
            if (row.key.trim() === '')
                return 'key';
            if (!isJsonValue(row.value))
                return 'value';
        }
        return null;
    }
    /**
     * Save the staged override rows as this session's overrides bag, then
     * refresh the selection. The bag rides above the bound plan's params on the
     * next request (merge: session overrides > plan params).
     */
    async applyOverrides() {
        const { planId, busy } = this.store.getSnapshot();
        if (planId === undefined || busy)
            return;
        const blocker = this.overrideBlocker();
        if (blocker !== null) {
            this.set({ overrideError: blocker === 'key' ? 'key' : 'value' });
            return;
        }
        await this.select(planId, draftToOverrides(this.store.getSnapshot().overrideDraft));
    }
    /** Clear every session override, returning the session to its pure plan params. */
    async clearOverrides() {
        const { planId, busy } = this.store.getSnapshot();
        if (planId === undefined || busy)
            return;
        await this.select(planId, {});
    }
    /** Patch the staged override rows, clearing the last save error. */
    patchOverrideDraft(update) {
        this.set({ overrideDraft: update(this.store.getSnapshot().overrideDraft), overrideError: null });
    }
}
//# sourceMappingURL=mode-store.js.map