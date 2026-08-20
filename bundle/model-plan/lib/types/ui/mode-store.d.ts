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
import { type SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client';
import type { ModelPlanWire, WireParams } from './wire-client.ts';
/** One plan offered in the chip menu. */
export interface ChipOption {
    /** Plan id (its only identity). */
    id: string;
    /** Provider route / model id, for the menu's model summary. */
    provider: string;
    model: string;
    /** Number of params in the plan's own bag. */
    paramCount: number;
    /** Whether this plan is the deployment default. */
    isDefault: boolean;
    /** Why the plan cannot be used, absent when it can. */
    broken?: string;
}
/**
 * One staged session-override row: the key plus the value in typed (string)
 * form. Mirrors the settings dialog's `ParamDraft` so both surfaces share the
 * same key=value editing language; values parse to JSON on save.
 */
export interface OverrideDraft {
    /** The param key (editable inline; any spelling). */
    key: string;
    /** The param value in typed string form, parsed to JSON on save. */
    value: string;
}
/** Chip snapshot. */
export interface ModelPlanChipState {
    status: 'idle' | 'loading' | 'ready' | 'error';
    /** The bound plan id, absent when the session binds none. */
    planId: string | undefined;
    /** Session-level temporary overrides riding above the plan's own params. */
    overrides: WireParams;
    /** The staged override rows currently being edited in the menu. */
    overrideDraft: readonly OverrideDraft[];
    /** The last override-save failure; cleared by the next edit. */
    overrideError: string | null;
    /** Every plan the deployment supplies, for the menu. */
    options: readonly ChipOption[];
    /** Whether a select is in flight. */
    busy: boolean;
    /** The last load/select failure; cleared by the next successful action. */
    error: string | null;
    /** Whether the last failure was a lock (a started session rejected the pick). */
    locked: boolean;
}
/** The common wire names pre-seeded into the override editor (blank, all removable). */
export declare const KNOWN_KEYS: readonly ["temperature", "max_tokens", "top_p"];
/**
 * Whether a text is a legal JSON scalar per the wire's JSON-value vocabulary
 * (string / number / boolean / null / array / object). The empty string is not.
 * Mirrors the settings section's own check so both surfaces agree.
 */
export declare function isJsonValue(text: string): boolean;
/**
 * The composer model seat's plan-binding controller. One per session, created
 * on the slot's session-scoped inject.
 */
export declare class ModelPlanChipController {
    private readonly plans;
    private readonly sessionId;
    /** Chip snapshot the renderer subscribes to. */
    readonly store: SnapshotStore<ModelPlanChipState>;
    constructor(plans: ModelPlanWire, sessionId: string);
    private set;
    /** Read the session's binding and the plan roster (parallel). */
    load(): Promise<void>;
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
    select(planId: string, overrides?: WireParams): Promise<void>;
    /**
     * Seed the override editor from the current session overrides (an empty bag
     * yields one blank row to type into). Called when the menu opens so the
     * active overrides are always visible and editable.
     */
    beginOverrideDraft(): void;
    /** Set one override row's key (editable inline). */
    setOverrideKey(index: number, key: string): void;
    /** Set one override row's value (typed string form). */
    setOverrideValue(index: number, value: string): void;
    /** Append an empty override row. */
    addOverrideRow(): void;
    /** Remove one override row. */
    removeOverrideRow(index: number): void;
    /** The first blocker preventing the override draft from saving, as a reason, or null. */
    overrideBlocker(): 'key' | 'value' | null;
    /**
     * Save the staged override rows as this session's overrides bag, then
     * refresh the selection. The bag rides above the bound plan's params on the
     * next request (merge: session overrides > plan params).
     */
    applyOverrides(): Promise<void>;
    /** Clear every session override, returning the session to its pure plan params. */
    clearOverrides(): Promise<void>;
    /** Patch the staged override rows, clearing the last save error. */
    private patchOverrideDraft;
}
//# sourceMappingURL=mode-store.d.ts.map