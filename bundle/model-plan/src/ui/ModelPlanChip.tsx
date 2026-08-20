/**
 * Session model-plan chip: the composer's named model seat (`conversation.input.model`),
 * replacing the official model selector with a plan-bound picker.
 *
 * The trigger shows the bound plan's name (`方案：<name> ▾`), or the deployment
 * default (or "选择方案") when none is bound. The menu lists every plan with its
 * provider/model and param summary, marks the default, and flags broken plans;
 * picking one binds the session through `select`. A "session overrides" footer
 * lets the user temporarily adjust params for this session only.
 *
 * Once the conversation has started the host refuses a binding swap, so the
 * chip disables itself on a non-blank session and explains why on hover; a
 * select the host rejects as locked rolls the binding back and surfaces the
 * failure. Note the composer deliberately keeps this seat LIVE while it refuses
 * text for a model-related block — the user clears such a block by picking a
 * usable plan here — so only the bar's own disable state (`locked`) and a
 * started session disable the trigger.
 */

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties, FocusEvent, KeyboardEvent } from 'react'
import {
  IconChevronDownOutline14, IconPlusOutline16, IconTrashOutline16, IconWarningOutline16, Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls the ui-conversation SlotMap merge (`conversation.input.model`).
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { ModelPlanChipState } from './mode-store.ts'
import type { ModelPlanKey } from './locales.ts'
import css from './ModelPlanChip.module.css'

/** Registration-side business face for the session model-plan chip. */
export interface ModelPlanChipInjected {
  hooks: {
    /** Chip snapshot bound by the renderer as useModelPlanChip. */
    modelPlanChip: SnapshotStore<ModelPlanChipState>
  }
  /** Read the session's binding and the plan roster when the chip first renders. */
  load: () => Promise<void>
  /** Bind the session to one plan (optionally with session-level overrides). */
  select: (planId: string, overrides?: Record<string, unknown>) => Promise<void>
  /** Seed the override editor from the current session overrides when the menu opens. */
  beginOverrideDraft: () => void
  /** Set one staged override row's key. */
  setOverrideKey: (index: number, key: string) => void
  /** Set one staged override row's value. */
  setOverrideValue: (index: number, value: string) => void
  /** Append an empty override row. */
  addOverrideRow: () => void
  /** Remove one override row. */
  removeOverrideRow: (index: number) => void
  /** The reason the staged overrides cannot save, or null. */
  overrideBlocker: () => 'key' | 'value' | null
  /** Save the staged overrides as this session's overrides bag. */
  applyOverrides: () => Promise<void>
  /** Clear every session override. */
  clearOverrides: () => Promise<void>
}

/** Full component props: the model-seat owner share + session kit + locale + injected face. */
export type ModelPlanChipProps =
  PropsRuntime<'conversation.input.model'>
  & PropsLocale<'settings.modelPlan'>
  & InjectFace<ModelPlanChipInjected>

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Model-plan management-section copy, shared with the settings section. */
    'settings.modelPlan': ModelPlanKey
  }
}

/** The trigger's current label: the bound plan's name, else the default, else a prompt. */
function triggerLabel(state: ModelPlanChipState, t: (key: ModelPlanKey) => string): string {
  const overrideCount = Object.keys(state.overrides).length
  const bound = state.options.find(option => option.id === state.planId)
  if (bound !== undefined) {
    const base = `${t('seatPrefix')}${bound.id}`
    return overrideCount > 0 ? `${base} · ${overrideCount}` : base
  }
  const fallback = state.options.find(option => option.isDefault)
  return `${t('seatPrefix')}${fallback?.id ?? t('seatEmpty')}`
}

/**
 * Render the composer model-seat chip.
 * @param props - composed slot props.
 * @returns the chip trigger and, while open, the plan menu.
 */
export function ModelPlanChip({
  locked, useModelPlanChip, t, load, select, beginOverrideDraft,
  setOverrideKey, setOverrideValue, addOverrideRow, removeOverrideRow,
  overrideBlocker, applyOverrides, clearOverrides,
}: ModelPlanChipProps) {
  const state = useModelPlanChip(snapshot => snapshot)
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  // Fixed viewport position for the menu, resolved from the trigger rect with
  // the viewport clamped so the popup never exits the visible area.
  const [menuPos, setMenuPos] = useState<CSSProperties | null>(null)

  useEffect(() => {
    if (state.status === 'idle') void load()
  }, [state.status, load])

  useEffect(() => {
    if (!open) return
    const closeOutside = (event: MouseEvent): void => {
      if (!rootRef.current?.contains(event.target as Node) && !menuRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', closeOutside)
    return () => { document.removeEventListener('mousedown', closeOutside) }
  }, [open])

  // Position the popup ABOVE the trigger (it sits in the composer's bottom
  // bar), clamped to the viewport so a tall menu or a short window never
  // pushes it off-screen. The menu uses `position: fixed`, so it anchors to
  // the viewport (escaping the composer's overflow clipping) and layers above
  // the stats bar; the composer container chain is deliberately transform-free
  // (ConversationRoot's .composerHero avoids transform precisely so fixed
  // pickers/modals like this stay viewport-anchored).
  useLayoutEffect(() => {
    if (!open) { setMenuPos(null); return }
    const place = (): void => {
      const trigger = triggerRef.current
      if (trigger === null) return
      const r = trigger.getBoundingClientRect()
      const menuEl = menuRef.current
      const MARGIN = 12
      const vw = window.innerWidth
      const vh = window.innerHeight
      const mw = menuEl?.offsetWidth ?? 0
      const mh = menuEl?.offsetHeight ?? 0
      let x = r.right - mw
      let y = r.top - mh - 4
      if (mw > 0) x = Math.min(Math.max(x, MARGIN), vw - mw - MARGIN)
      if (mh > 0) y = Math.min(Math.max(y, MARGIN), vh - mh - MARGIN)
      setMenuPos({ left: x, top: y })
    }
    place()
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    return () => {
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
    }
  }, [open])

  // The owner passes only `locked` (the bar's chrome disable state for a
  // removed session). A started session cannot change its plan binding, but
  // that is enforced by the host rejecting the pick (the chip rolls back and
  // explains) rather than by disabling the seat here. A model-related block
  // deliberately does NOT lock the seat — the user clears it by picking a
  // usable plan here.
  const disabled = locked || state.busy
  const label = triggerLabel(state, t)

  const onTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>): void => {
    if (event.key === 'Escape' && open) {
      event.preventDefault()
      setOpen(false)
    }
  }

  const onBlur = (event: FocusEvent<HTMLDivElement>): void => {
    if (event.relatedTarget instanceof Node && rootRef.current?.contains(event.relatedTarget)) return
    setOpen(false)
  }

  const overrideCount = Object.keys(state.overrides).length
  const blocker = state.planId === undefined || state.busy ? null : overrideBlocker()
  const overrideMessage = state.overrideError === 'key'
    ? t('keyRequired')
    : state.overrideError === 'value'
      ? t('valueInvalid')
      : null

  return (
    <div ref={rootRef} className={css.root} onBlur={onBlur}>
      <Tooltip
        label={state.locked ? t('seatLocked') : (state.error ?? t('seatHint'))}
        side="top"
        delayMs={state.locked ? 0 : 500}
      >
        <button
          ref={triggerRef}
          type="button"
          className={css.chip}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={t('seatSelectAria')}
          title={label}
          disabled={disabled}
          onKeyDown={onTriggerKeyDown}
          onClick={() => {
            // Re-read the roster each time the menu opens so a plan authored
            // in Settings shows up here without a reload, and seed the override
            // editor from the current session overrides so they are always
            // visible and editable.
            if (!open) {
              void load()
              beginOverrideDraft()
            }
            setOpen(value => !value)
          }}
        >
          {label}
          <IconChevronDownOutline14 className={css.chevron} />
        </button>
      </Tooltip>
      {open && !disabled && (
        <div
          ref={menuRef}
          className={css.menu}
          role="menu"
          aria-label={t('seatSelect')}
          style={menuPos ?? undefined}
        >
          {state.status === 'error' && <div className={css.error}>{t('error')}</div>}
          <div className={css.plans}>
            {state.options.length === 0
              ? (
                <div className={css.empty}>
                  <div>{t('noPlans')}</div>
                  <div className={css.emptyHint}>{t('noPlansHint')}</div>
                </div>
              )
              : state.options.map(option => {
                const selected = option.id === state.planId
                const broken = option.broken !== undefined
                return (
                  <button
                    key={option.id}
                    type="button"
                    role="menuitemradio"
                    aria-checked={selected}
                    className={`${css.option} ${selected ? css.selected : ''} ${broken ? css.optionBroken : ''}`}
                    disabled={state.busy}
                    // A plan switch keeps the current session overrides (they
                    // ride above whichever plan is bound), so live overrides
                    // survive changing plans.
                    onClick={() => { void select(option.id) }}
                  >
                    <span className={css.optionMain}>
                      <span className={css.optionName}>{option.id}</span>
                      {option.isDefault && <span className={css.optionDefault}>{t('seatDefaultPlan')}</span>}
                      {broken && <span className={css.optionBrokenTag}>{t('brokenPlan')}</span>}
                    </span>
                    <span className={css.optionModel}>
                      {option.provider}/{option.model} · {option.paramCount} {t('paramCount')}
                    </span>
                  </button>
                )
              })}
          </div>
          <div className={css.override}>
            <div className={css.overrideHead}>
              <span className={css.overrideTitle}>{t('seatOverrides')}</span>
              {overrideCount > 0 ? <span className={css.overrideCount}>{overrideCount}</span> : null}
            </div>
            <span className={css.overrideHint}>{t('seatOverrideHint')}</span>
            <div className={css.overrideTable}>
              <div className={css.overrideCols}>
                <span className={css.overrideColKey}>{t('paramKeyLabel')}</span>
                <span className={css.overrideColValue}>{t('paramValueLabel')}</span>
                <span className={css.overrideColRemove} />
              </div>
              {state.overrideDraft.map((row, index) => (
                <div key={`${index}-${row.key}`} className={css.overrideRow}>
                  <input
                    className={css.input}
                    value={row.key}
                    placeholder={t('paramKeyPlaceholder')}
                    onChange={e => setOverrideKey(index, e.target.value)}
                  />
                  <input
                    className={css.input}
                    value={row.value}
                    placeholder={t('paramValuePlaceholder')}
                    onChange={e => setOverrideValue(index, e.target.value)}
                  />
                  <button
                    type="button"
                    className={css.removeRowButton}
                    aria-label={t('removeParam')}
                    title={t('removeParam')}
                    onClick={() => removeOverrideRow(index)}
                  >
                    <IconTrashOutline16 />
                  </button>
                </div>
              ))}
            </div>
            <button type="button" className={css.addOverride} onClick={addOverrideRow}>
              <IconPlusOutline16 />
              {t('addParam')}
            </button>
            {overrideMessage !== null ? <span className={css.overrideError}>{overrideMessage}</span> : null}
            <div className={css.overrideActions}>
              <button
                type="button"
                className={css.applyButton}
                disabled={state.planId === undefined || state.busy || blocker !== null}
                onClick={() => { void applyOverrides() }}
              >
                {t('save')}
              </button>
              {overrideCount > 0 ? (
                <button
                  type="button"
                  className={css.clearButton}
                  disabled={state.busy}
                  onClick={() => { void clearOverrides() }}
                >
                  {t('seatClearOverrides')}
                </button>
              ) : null}
            </div>
          </div>
          {state.locked ? (
            <div className={css.rejected}>
              <IconWarningOutline16 />
              {t('seatSelectRejected')}
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}
