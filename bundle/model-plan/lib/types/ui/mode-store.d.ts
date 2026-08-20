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
/** Chip snapshot. */
export interface ModelPlanChipState {
    status: 'idle' | 'loading' | 'ready' | 'error';
    /** The bound plan id, absent when the session binds none. */
    planId: string | undefined;
    /** Session-level temporary overrides riding above the plan's own params. */
    overrides: WireParams;
    /** Every plan the deployment supplies, for the menu. */
    options: readonly ChipOption[];
    /** Whether a select is in flight. */
    busy: boolean;
    /** The last load/select failure; cleared by the next successful action. */
    error: string | null;
    /** Whether the last failure was a lock (a started session rejected the pick). */
    locked: boolean;
}
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
     */
    select(planId: string, overrides?: WireParams): Promise<void>;
}
//# sourceMappingURL=mode-store.d.ts.map