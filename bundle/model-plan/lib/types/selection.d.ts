/**
 * Session-level model-plan selection: which plan one session binds.
 *
 * A session binds a PLAN, never a bare model. The durable truth is a log-only
 * session event (`model-plan/select`) that never enters the model transcript;
 * `currentPlanSelection` folds the last one. A session may carry no binding
 * (a session that never selected a plan, or a deployment without this feature)
 * — the merge interceptor then runs zero-intervention on the official route.
 *
 * The selection carries an optional `overrides` bag: session-level temporary
 * key=value params that sit ABOVE the plan's own params in the merge priority
 * (session overrides > plan params > model defaults).
 *
 * `model-plan/select` is a Harness-only event type no first-party reader
 * knows, so it MUST be marked `ignorable: true` — exactly like
 * `subagent-team/mode` — or a first-party `coordinator.load` refuses the log
 * (see `assertEventsSupported`). This module reuses the same appendIgnorable
 * escape hatch.
 * @module dsh-harness-model-plan-bundle/selection
 */
import type { SessionEvent } from '@deepseek-ai/dsh-session';
import type { PlanParams } from './types.ts';
/** The folded plan selection of one session. */
export interface PlanSelectionState {
    /** The bound plan id; absent when the session binds no plan. */
    readonly planId?: string;
    /** Session-level temporary param overrides riding above the plan's params. */
    readonly overrides: PlanParams;
}
declare module '@deepseek-ai/dsh-session/types' {
    interface SessionEventMap {
        /**
         * Records a session's model-plan binding as durable, log-only intent. It
         * never enters the model transcript; the merge interceptor reads it
         * through {@link currentPlanSelection}. Mirrors `agent-preset/selected`.
         */
        'model-plan/select': {
            planId?: string;
            overrides?: PlanParams;
        };
    }
}
/** The empty selection: a session that binds no plan. */
export declare const NO_PLAN_SELECTION: PlanSelectionState;
/**
 * Fold the last recorded plan selection from the durable log; replay needs no
 * catch-up state. A session with no record binds no plan, so a deployment
 * without the feature behaves exactly as before.
 * @param events - session events in log order; other event types are ignored.
 * @returns the folded selection state.
 */
export declare function currentPlanSelection(events: readonly SessionEvent[]): PlanSelectionState;
/**
 * Whether a session's conversation has started — one turn has run. The plan
 * binding (like the agent preset and the team mode) is locked once a turn has
 * run, because the request the model already saw was produced under the
 * previous route and swapping it mid-flight would strand the logged call.
 * @param events - session events in log order.
 * @returns true when the plan binding can no longer be changed.
 */
export declare function planLocked(events: readonly SessionEvent[]): boolean;
//# sourceMappingURL=selection.d.ts.map