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

/**
 * One staged session-override row: the key plus the value in typed (string)
 * form. Mirrors the settings dialog's `ParamDraft` so both surfaces share the
 * same key=value editing language; values parse to JSON on save.
 */
export interface OverrideDraft {
  /** The param key (editable inline; any spelling). */
  key: string
  /** The param value in typed string form, parsed to JSON on save. */
  value: string
}

/** Chip snapshot. */
export interface ModelPlanChipState {
  status: 'idle' | 'loading' | 'ready' | 'error'
  /** The bound plan id, absent when the session binds none. */
  planId: string | undefined
  /** Session-level temporary overrides riding above the plan's own params. */
  overrides: WireParams
  /** The staged override rows currently being edited in the menu. */
  overrideDraft: readonly OverrideDraft[]
  /** The last override-save failure; cleared by the next edit. */
  overrideError: string | null
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
  overrideDraft: [],
  overrideError: null,
  options: [],
  busy: false,
  error: null,
  locked: false,
}

/** The failure message of a rejected wire call. */
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** The common wire names pre-seeded into the override editor (blank, all removable). */
export const KNOWN_KEYS = ['temperature', 'max_tokens', 'top_p'] as const

/**
 * Whether a text is a legal JSON scalar per the wire's JSON-value vocabulary
 * (string / number / boolean / null / array / object). The empty string is not.
 * Mirrors the settings section's own check so both surfaces agree.
 */
export function isJsonValue(text: string): boolean {
  if (text.trim() === '') return false
  try {
    JSON.parse(text)
    return true
  } catch {
    return false
  }
}

/** Map an overrides record onto editable draft rows (familiar-key order first). */
function overridesToDraft(overrides: WireParams): OverrideDraft[] {
  const entries = Object.entries(overrides)
  if (entries.length === 0) return [{ key: '', value: '' }]
  const known = KNOWN_KEYS.filter(key => entries.some(([k]) => k === key))
  const ordered = [
    ...known,
    ...entries.map(([k]) => k).filter(k => !(KNOWN_KEYS as readonly string[]).includes(k)),
  ]
  return ordered.map(key => ({ key, value: JSON.stringify(overrides[key]) }))
}

/** Parse the typed override rows back onto a JSON-value params record. */
function draftToOverrides(rows: readonly OverrideDraft[]): WireParams {
  const bag: WireParams = {}
  for (const row of rows) {
    if (row.key.trim() === '' || !isJsonValue(row.value)) continue
    bag[row.key] = JSON.parse(row.value)
  }
  return bag
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
        overrideDraft: overridesToDraft(selectionResult.value.overrides),
        overrideError: null,
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
   *
   * When `overrides` is omitted the CURRENT session overrides are carried over
   * to the new plan (a plan switch never drops the user's live overrides — they
   * ride above whichever plan is bound), so "换方案后覆盖仍在且优先级高于方案参数"
   * holds. Pass an explicit `{}` to clear them.
   */
  async select(planId: string, overrides?: WireParams): Promise<void> {
    const before = this.store.getSnapshot()
    if (before.busy) return
    const effective = overrides ?? before.overrides
    this.set({ busy: true, error: null, locked: false, overrideError: null })
    try {
      const result = await this.plans.select({
        sessionId: this.sessionId,
        planId,
        ...Object.keys(effective).length === 0 ? {} : { overrides: effective },
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
        overrideDraft: overridesToDraft(result.value.overrides),
        overrideError: null,
        error: null,
        locked: false,
      })
    } catch (error) {
      this.set({ busy: false, error: messageOf(error) })
    }
  }

  /**
   * Seed the override editor from the current session overrides (an empty bag
   * yields one blank row to type into). Called when the menu opens so the
   * active overrides are always visible and editable.
   */
  beginOverrideDraft(): void {
    const { overrides, busy } = this.store.getSnapshot()
    if (busy) return
    this.set({ overrideDraft: overridesToDraft(overrides), overrideError: null })
  }

  /** Set one override row's key (editable inline). */
  setOverrideKey(index: number, key: string): void {
    this.patchOverrideDraft(rows => rows.map((row, i) => i === index ? { ...row, key } : row))
  }

  /** Set one override row's value (typed string form). */
  setOverrideValue(index: number, value: string): void {
    this.patchOverrideDraft(rows => rows.map((row, i) => i === index ? { ...row, value } : row))
  }

  /** Append an empty override row. */
  addOverrideRow(): void {
    this.patchOverrideDraft(rows => [...rows, { key: '', value: '' }])
  }

  /** Remove one override row. */
  removeOverrideRow(index: number): void {
    this.patchOverrideDraft(rows => rows.filter((_, i) => i !== index))
  }

  /** The first blocker preventing the override draft from saving, as a reason, or null. */
  overrideBlocker(): 'key' | 'value' | null {
    for (const row of this.store.getSnapshot().overrideDraft) {
      if (row.key.trim() === '') return 'key'
      if (!isJsonValue(row.value)) return 'value'
    }
    return null
  }

  /**
   * Save the staged override rows as this session's overrides bag, then
   * refresh the selection. The bag rides above the bound plan's params on the
   * next request (merge: session overrides > plan params).
   */
  async applyOverrides(): Promise<void> {
    const { planId, busy } = this.store.getSnapshot()
    if (planId === undefined || busy) return
    const blocker = this.overrideBlocker()
    if (blocker !== null) {
      this.set({ overrideError: blocker === 'key' ? 'key' : 'value' })
      return
    }
    await this.select(planId, draftToOverrides(this.store.getSnapshot().overrideDraft))
  }

  /** Clear every session override, returning the session to its pure plan params. */
  async clearOverrides(): Promise<void> {
    const { planId, busy } = this.store.getSnapshot()
    if (planId === undefined || busy) return
    await this.select(planId, {})
  }

  /** Patch the staged override rows, clearing the last save error. */
  private patchOverrideDraft(update: (rows: readonly OverrideDraft[]) => readonly OverrideDraft[]): void {
    this.set({ overrideDraft: update(this.store.getSnapshot().overrideDraft), overrideError: null })
  }
}
