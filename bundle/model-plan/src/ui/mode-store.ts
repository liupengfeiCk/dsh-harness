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

import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { ModelPlanWire, WireParams, WirePlanEntry } from './wire-client.ts'

/** One plan offered in the chip menu. */
export interface ChipOption {
  /** Plan id (its only identity). */
  id: string
  /** Provider route / model id, for the menu's model summary. */
  provider: string
  model: string
  /** Number of params in the plan's own bag. */
  paramCount: number
  /** Whether this plan is the deployment default. */
  isDefault: boolean
  /** Why the plan cannot be used, absent when it can. */
  broken?: string
}

/** Chip snapshot. */
export interface ModelPlanChipState {
  status: 'idle' | 'loading' | 'ready' | 'error'
  /** The bound plan id, absent when the session binds none. */
  planId: string | undefined
  /** Session-level temporary overrides riding above the plan's own params. */
  overrides: WireParams
  /** Every plan the deployment supplies, for the menu. */
  options: readonly ChipOption[]
  /** Whether a select is in flight. */
  busy: boolean
  /** The last load/select failure; cleared by the next successful action. */
  error: string | null
  /** Whether the last failure was a lock (a started session rejected the pick). */
  locked: boolean
}

const INITIAL: ModelPlanChipState = {
  status: 'idle',
  planId: undefined,
  overrides: {},
  options: [],
  busy: false,
  error: null,
  locked: false,
}

/** The failure message of a rejected wire call. */
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Map a wire plan onto a chip menu option. */
function planToOption(plan: WirePlanEntry): ChipOption {
  return {
    id: plan.id,
    provider: plan.provider,
    model: plan.model,
    paramCount: Object.keys(plan.params).length,
    isDefault: plan.isDefault,
    ...plan.broken === undefined ? {} : { broken: plan.broken },
  }
}

/**
 * The composer model seat's plan-binding controller. One per session, created
 * on the slot's session-scoped inject.
 */
export class ModelPlanChipController {
  /** Chip snapshot the renderer subscribes to. */
  readonly store: SnapshotStore<ModelPlanChipState> = createSnapshotStore(INITIAL)

  constructor(
    private readonly plans: ModelPlanWire,
    private readonly sessionId: string,
  ) {}

  private set(patch: Partial<ModelPlanChipState>): void {
    this.store.set({ ...this.store.getSnapshot(), ...patch })
  }

  /** Read the session's binding and the plan roster (parallel). */
  async load(): Promise<void> {
    const before = this.store.getSnapshot()
    if (before.status === 'loading') return
    this.set({ status: 'loading', error: null, locked: false })
    try {
      const selectionResult = await this.plans.readSelection({ sessionId: this.sessionId })
      if (!selectionResult.ok) {
        this.set({ status: 'error', error: selectionResult.error.message })
        return
      }
      const rosterResult = await this.plans.list({})
      if (!rosterResult.ok) {
        this.set({ status: 'error', error: rosterResult.error.message })
        return
      }
      this.set({
        status: 'ready',
        planId: selectionResult.value.planId,
        overrides: selectionResult.value.overrides,
        options: rosterResult.value.plans.map(planToOption),
        error: null,
        locked: false,
      })
    } catch (error) {
      this.set({ status: 'error', error: messageOf(error) })
    }
  }

  /**
   * Bind the session to one plan, optionally with session-level overrides.
   * A rejected pick (a started session) rolls the binding back and marks the
   * failure as a lock so the chip can explain it.
   */
  async select(planId: string, overrides?: WireParams): Promise<void> {
    const before = this.store.getSnapshot()
    if (before.busy) return
    this.set({ busy: true, error: null, locked: false })
    try {
      const result = await this.plans.select({
        sessionId: this.sessionId,
        planId,
        ...overrides === undefined || Object.keys(overrides).length === 0 ? {} : { overrides },
      })
      if (!result.ok) {
        // `model-plan-locked` is this channel's own failure code, outside the
        // apiproxy's closed RpcErrorCode union — compare the wire code as a
        // string so a started session's rejection reads as a lock.
        const locked = (result.error.code as string) === 'model-plan-locked'
        this.set({ busy: false, error: result.error.message, locked })
        return
      }
      this.set({
        busy: false,
        planId: result.value.planId,
        overrides: result.value.overrides,
        error: null,
        locked: false,
      })
    } catch (error) {
      this.set({ busy: false, error: messageOf(error) })
    }
  }
}
