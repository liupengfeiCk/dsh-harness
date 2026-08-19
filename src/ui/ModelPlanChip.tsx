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

import { useEffect, useRef, useState } from 'react'
import type { FocusEvent, KeyboardEvent } from 'react'
import { IconChevronDownOutline14, IconWarningOutline16, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
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
  const bound = state.options.find(option => option.id === state.planId)
  if (bound !== undefined) return `${t('seatPrefix')}${bound.name}`
  const fallback = state.options.find(option => option.isDefault)
  return `${t('seatPrefix')}${fallback?.name ?? t('seatEmpty')}`
}

/**
 * Render the composer model-seat chip.
 * @param props - composed slot props.
 * @returns the chip trigger and, while open, the plan menu.
 */
export function ModelPlanChip({ locked, useModelPlanChip, t, load, select }: ModelPlanChipProps) {
  const state = useModelPlanChip(snapshot => snapshot)
  const [open, setOpen] = useState(false)
  const [overrideTemp, setOverrideTemp] = useState('')
  const rootRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    if (state.status === 'idle') void load()
  }, [state.status, load])

  useEffect(() => {
    if (!open) return
    const closeOutside = (event: MouseEvent): void => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', closeOutside)
    return () => { document.removeEventListener('mousedown', closeOutside) }
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

  const applyOverride = (): void => {
    if (state.planId === undefined) return
    if (overrideTemp.trim() === '') {
      void select(state.planId, {})
    } else {
      const parsed = Number(overrideTemp)
      if (!Number.isNaN(parsed)) void select(state.planId, { temperature: parsed })
    }
    setOverrideTemp('')
  }

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
          onClick={() => { setOpen(value => !value) }}
        >
          {label}
          <IconChevronDownOutline14 className={css.chevron} />
        </button>
      </Tooltip>
      {open && !disabled && (
        <div className={css.menu} role="menu" aria-label={t('seatSelect')}>
          {state.status === 'error' && <div className={css.error}>{t('error')}</div>}
          <div className={css.plans}>
            {state.options.length === 0
              ? <div className={css.empty}>{t('noPlans')}</div>
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
                    onClick={() => { void select(option.id) }}
                  >
                    <span className={css.optionMain}>
                      <span className={css.optionName}>{option.name}</span>
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
            <span className={css.overrideTitle}>{t('seatOverrides')}</span>
            <span className={css.overrideHint}>{t('seatOverrideHint')}</span>
            <div className={css.overrideRow}>
              <label className={css.overrideKey}>{t('temperatureKey')}</label>
              <input
                className={css.input}
                type="number"
                step="0.1"
                value={overrideTemp}
                placeholder={t('paramValuePlaceholder')}
                onChange={e => setOverrideTemp(e.target.value)}
              />
              <button type="button" className={css.applyButton} disabled={state.planId === undefined} onClick={applyOverride}>
                {t('save')}
              </button>
            </div>
            {state.overrides !== undefined && Object.keys(state.overrides).length > 0 ? (
              <button
                type="button"
                className={css.clearButton}
                onClick={() => { if (state.planId !== undefined) void select(state.planId, {}) }}
              >
                {t('seatClearOverrides')}
              </button>
            ) : null}
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
