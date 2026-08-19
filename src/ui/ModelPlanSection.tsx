/**
 * Model-plan settings section ("模型方案"): the independent plan roster as
 * cards, with a create/edit dialog over a staged draft (name, provider-grouped
 * model pick, and a params bag) and delete with confirmation.
 *
 * The model pick reads the session-independent host catalog (`llm.models`):
 * provider-grouped, with each exact route's reasoning metadata. `reasoningEffort`
 * renders as a dropdown sourced from the selected model's efforts when that
 * model exposes them. The params bag is an array of editable key/value rows —
 * every key can be deleted, re-valued, its spelling edited inline, and new
 * key=value rows appended. A note reminds the user that custom keys pass
 * through into the request body without implying provider support.
 *
 * A shipped (system) plan is read-only: it cannot be edited or deleted.
 */

import { useEffect } from 'react'
import type { ReactNode } from 'react'
import type { ModelReasoningEffort } from '@deepseek-ai/dsh-api-remotes/client'
import {
  Button, IconCheckOutline16, IconEditOutline16, IconPlusOutline16, IconTrashOutline16, Modal, Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import {
  planBlocker, type ModelPlanSectionState, type ParamDraft, type PlanDraft, type PlanRow,
} from './section-store.ts'
import type { ModelCatalogState } from './directory.ts'
import type { ModelPlanKey } from './locales.ts'
import css from './ModelPlanSection.module.css'

/** Registration-side business face for the model-plan settings section. */
export interface ModelPlanSectionInjected {
  hooks: {
    /** Page snapshot bound by the renderer as useModelPlanSection. */
    modelPlanSection: SnapshotStore<ModelPlanSectionState>
    /** The model-catalog snapshot bound as useModelCatalog. */
    modelCatalog: SnapshotStore<ModelCatalogState>
  }
  /** Read the roster; called once when the section first renders. */
  load: () => Promise<void>
  /** Load the model catalog; called once when the editor first opens. */
  loadCatalog: () => Promise<void>
  /** Open the create dialog. */
  beginCreate: () => void
  /** Open the edit dialog over one plan. */
  beginEdit: (id: string) => Promise<void>
  /** Close the dialog, discarding the staged draft. */
  closeDialog: () => void
  /** Name the draft (create id). */
  setDialogId: (id: string) => void
  /** Set the draft's display name. */
  setDialogName: (name: string) => void
  /** Pick the draft's provider route. */
  setDialogProvider: (provider: string) => void
  /** Pick the draft's model id. */
  setDialogModel: (model: string) => void
  /** Set one params-bag row's key. */
  setParamKey: (index: number, key: string) => void
  /** Set one params-bag row's value. */
  setParamValue: (index: number, value: string) => void
  /** Add an empty params-bag row. */
  addParam: () => void
  /** Remove one params-bag row. */
  removeParam: (index: number) => void
  /** Set the draft's reasoningEffort through its dropdown. */
  setReasoningEffort: (effort: string) => void
  /** Submit the create. */
  confirmCreate: () => Promise<void>
  /** Submit the edit. */
  confirmEdit: () => Promise<void>
  /** Set one plan as the deployment default. */
  setDefault: (id: string) => void
  /** Ask for confirmation before deleting one plan. */
  confirmDelete: (id: string | null) => void
  /** Delete the plan awaiting confirmation. */
  remove: () => Promise<void>
}

/** Full component props. */
export type ModelPlanSectionProps =
  PropsRuntime<'settings.section'>
  & PropsLocale<'settings.modelPlan'>
  & InjectFace<ModelPlanSectionInjected>

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Model-plan management-section copy. */
    'settings.modelPlan': ModelPlanKey
  }
}

/** The `reasoningEffort` bag row's dropdown choices for the selected model. */
function reasoningChoices(reasoning: { efforts: readonly ModelReasoningEffort[]; defaultEffort?: string } | undefined): readonly string[] {
  if (reasoning === undefined) return []
  return [
    ...reasoning.defaultEffort === undefined ? [''] : [],
    ...reasoning.efforts.map(effort => effort.id),
  ]
}

/** One plan card: name, model, param summary, default badge, broken marker, and row controls. */
function PlanCard(props: {
  row: PlanRow
  t: (key: ModelPlanKey) => string
  custom: boolean
  onEdit: (id: string) => void
  onSetDefault: (id: string) => void
  onDelete: (id: string) => void
}): ReactNode {
  const { row, t, custom, onEdit, onSetDefault, onDelete } = props
  const broken = row.broken !== undefined
  return (
    <li className={`${css.card} ${broken ? css.cardBroken : ''}`}>
      <div className={css.cardHead}>
        <span className={css.cardName}>{row.name}</span>
        {row.isDefault
          ? (
            <Tooltip label={t('defaultLabel')} side="top">
              <span className={css.defaultBadge}>
                <IconCheckOutline16 />
                {t('providerDefaultBadge')}
              </span>
            </Tooltip>
          )
          : null}
        {broken ? <span className={css.brokenBadge}>{t('brokenBadge')}</span> : null}
      </div>
      <div className={css.cardModel}>
        <span className={css.cardModelValue}>{row.provider}/{row.model}</span>
        <span className={css.paramSummary}>{row.paramCount} {t('paramSummary')}</span>
      </div>
      <div className={css.cardFoot}>
        <Tooltip label={t('editTitle')} side="top">
          <button type="button" className={css.iconButton} disabled={!custom} onClick={() => onEdit(row.id)}>
            <IconEditOutline16 />
          </button>
        </Tooltip>
        <Tooltip label={t('setDefault')} side="top">
          <button type="button" className={css.iconButton} disabled={!custom || row.isDefault} onClick={() => onSetDefault(row.id)}>
            <IconCheckOutline16 />
          </button>
        </Tooltip>
        <Tooltip label={t('delete')} side="top">
          <button type="button" className={`${css.iconButton} ${css.iconDanger}`} disabled={!custom} onClick={() => onDelete(row.id)}>
            <IconTrashOutline16 />
          </button>
        </Tooltip>
      </div>
    </li>
  )
}

/** One params-bag row: key + value (value is a typed JSON scalar). */
function ParamRow(props: {
  param: ParamDraft
  index: number
  reasoningEffortOptions: readonly string[]
  t: (key: ModelPlanKey) => string
  onKey: (index: number, key: string) => void
  onValue: (index: number, value: string) => void
  onRemove: (index: number) => void
}): ReactNode {
  const { param, index, reasoningEffortOptions, t, onKey, onValue, onRemove } = props
  return (
    <div className={css.paramRow}>
      <div className={css.field}>
        <span className={css.fieldLabel}>{t('paramKeyLabel')}</span>
        <input
          className={css.input}
          value={param.key}
          placeholder={t('paramKeyPlaceholder')}
          onChange={e => onKey(index, e.target.value)}
        />
      </div>
      <div className={css.field}>
        <span className={css.fieldLabel}>{t('paramValueLabel')}</span>
        {param.key === 'reasoningEffort' && reasoningEffortOptions.length > 0
          ? (
            <select
              className={`${css.input} ${css.select}`}
              value={param.value}
              onChange={e => onValue(index, e.target.value)}
            >
              {/* Each option's value is the JSON-serialized form of the effort
                  (e.g. `"off"`), so the picked value is a legal JSON scalar the
                  bag can store and the wire can re-read exactly. */}
              {reasoningEffortOptions.map(effort => (
                <option key={effort} value={JSON.stringify(effort)}>
                  {effort === '' ? t('reasoningProviderDefault') : effort}
                </option>
              ))}
            </select>
          )
          : (
            <input
              className={css.input}
              value={param.value}
              placeholder={t('paramValuePlaceholder')}
              onChange={e => onValue(index, e.target.value)}
            />
          )}
      </div>
      <Tooltip label={t('removeParam')} side="top">
        <button
          type="button"
          className={`${css.iconButton} ${css.iconDanger}`}
          onClick={() => onRemove(index)}
          aria-label={t('removeParam')}
        >
          <IconTrashOutline16 />
        </button>
      </Tooltip>
    </div>
  )
}

/** The create/edit dialog: name, provider-grouped model pick, and the params bag editor. */
function PlanDialog(props: {
  draft: PlanDraft
  creating: boolean
  catalog: ModelCatalogState
  t: (key: ModelPlanKey) => string
  setDialogId: (id: string) => void
  setDialogName: (name: string) => void
  setDialogProvider: (provider: string) => void
  setDialogModel: (model: string) => void
  setParamKey: (index: number, key: string) => void
  setParamValue: (index: number, value: string) => void
  setReasoningEffort: (effort: string) => void
  addParam: () => void
  removeParam: (index: number) => void
  confirm: () => void
  cancel: () => void
}): ReactNode {
  const { draft, creating, catalog, t, setDialogId, setDialogName, setDialogProvider, setDialogModel,
    setParamKey, setParamValue, setReasoningEffort, addParam, removeParam, confirm, cancel } = props
  const blocker = planBlocker(draft, creating)
  const message = draft.error ?? (blocker === undefined ? null : t(blocker))
  const group = catalog.groups.find(g => g.id === draft.provider)
  const model = group?.models.find(m => m.id === draft.model)
  const reasoningOptions = reasoningChoices(model?.reasoning)
  const catalogFailed = catalog.status === 'error'
  const modelSelectable = catalog.status === 'ready' && catalog.groups.length > 0

  return (
    <Modal
      open
      onClose={cancel}
      title={creating ? t('createTitle') : t('editTitle')}
      closeLabel={t('close')}
      description={creating ? t('createIntro') : t('editIntro')}
      className={css.dialog as string}
      contentClassName={css.dialogScroll as string}
      footer={(
        <>
          <Button variant="outline" disabled={draft.saving} onClick={cancel}>{t('cancel')}</Button>
          <Button disabled={draft.saving || blocker !== undefined} onClick={confirm}>
            {draft.saving ? t('saving') : t('save')}
          </Button>
        </>
      )}
    >
      <div className={css.dialogFields}>
        {creating ? (
          <div className={css.field}>
            <span className={css.fieldLabel}>Id</span>
            <input
              className={css.input}
              value={draft.id}
              placeholder="e.g. flash"
              onChange={e => setDialogId(e.target.value)}
            />
          </div>
        ) : null}
        <div className={css.field}>
          <span className={css.fieldLabel}>{t('nameLabel')}</span>
          <input
            className={css.input}
            value={draft.name}
            placeholder={t('namePlaceholder')}
            onChange={e => setDialogName(e.target.value)}
          />
        </div>
        <div className={css.field}>
          <span className={css.fieldLabel}>{t('modelLabel')}</span>
          {catalogFailed
            ? <p className={css.error}>{t('error')}</p>
            : (
              <div className={css.modelRow}>
                <select
                  className={`${css.input} ${css.select}`}
                  value={draft.provider}
                  disabled={!modelSelectable}
                  onChange={e => setDialogProvider(e.target.value)}
                >
                  <option value="" disabled>{t('modelPlaceholder')}</option>
                  {catalog.groups.map(group => (
                    <option key={group.id} value={group.id}>{group.name}</option>
                  ))}
                </select>
                <select
                  className={`${css.input} ${css.select}`}
                  value={draft.model}
                  disabled={group === undefined}
                  onChange={e => setDialogModel(e.target.value)}
                >
                  <option value="" disabled>{t('modelPlaceholder')}</option>
                  {group?.models.map(model => (
                    <option key={model.id} value={model.id}>{model.name}</option>
                  ))}
                </select>
              </div>
            )}
        </div>
        <section className={css.editorBlock}>
          <h4 className={css.blockTitle}>{t('paramsLabel')}</h4>
          <p className={css.paramsHint}>{t('paramsHint')}</p>
          {draft.params.map((param, index) => (
            <ParamRow
              key={`${index}-${param.key}`}
              param={param}
              index={index}
              reasoningEffortOptions={reasoningOptions}
              t={t}
              onKey={setParamKey}
              onValue={param.key === 'reasoningEffort' ? (_i, v) => setReasoningEffort(v) : setParamValue}
              onRemove={removeParam}
            />
          ))}
          <button type="button" className={css.addParam} onClick={addParam}>
            <IconPlusOutline16 />
            {t('addParam')}
          </button>
        </section>
        <p className={css.customNote}>{t('customKeyNote')}</p>
        {message !== null ? <p className={css.error}>{message}</p> : null}
      </div>
    </Modal>
  )
}

/**
 * Render the model-plan settings section content column.
 * @param props - composed slot props.
 * @returns the section, or null when the deployment composes no plans.
 */
export function ModelPlanSection(props: ModelPlanSectionProps): ReactNode {
  const { useModelPlanSection, useModelCatalog, t, load, loadCatalog } = props
  const state = useModelPlanSection(snapshot => snapshot)
  const catalog = useModelCatalog(snapshot => snapshot)

  useEffect(() => {
    if (state.status === 'idle') void load()
  }, [state.status, load])

  useEffect(() => {
    if (state.dialog !== null && catalog.status === 'idle') void loadCatalog()
  }, [state.dialog, catalog.status, loadCatalog])

  if (state.status === 'loading') return <div>{t('loading')}</div>
  if (state.status === 'error') return <div style={{ color: 'var(--dsw-alias-state-error-primary)' }}>{t('error')}</div>
  // An empty roster is a valid deployment (status 'unavailable'): it still
  // renders the full page — title, empty-state copy, the create button, and
  // the create dialog — so the user can author the first plan.
  if (state.status !== 'ready' && state.status !== 'unavailable') return null

  const dialog = state.dialog

  return (
    <div className={css.section}>
      <h2 className={css.title}>{t('nav')}</h2>
      <p className={css.intro}>{state.status === 'unavailable' ? t('unavailable') : t('sectionIntro')}</p>
      <ul className={css.cards}>
        {state.rows.map(row => (
          <PlanCard
            key={row.id}
            row={row}
            t={t}
            custom={row.trust === 'user'}
            onEdit={props.beginEdit}
            onSetDefault={props.setDefault}
            onDelete={props.confirmDelete}
          />
        ))}
      </ul>
      <button
        type="button"
        className={css.creatorButton}
        disabled={!state.authorable}
        onClick={() => props.beginCreate()}
      >
        <IconPlusOutline16 />
        {t('create')}
      </button>
      {dialog !== null ? (
        <PlanDialog
          draft={dialog}
          creating={dialog.creating}
          catalog={catalog}
          t={t}
          setDialogId={props.setDialogId}
          setDialogName={props.setDialogName}
          setDialogProvider={props.setDialogProvider}
          setDialogModel={props.setDialogModel}
          setParamKey={props.setParamKey}
          setParamValue={props.setParamValue}
          setReasoningEffort={props.setReasoningEffort}
          addParam={props.addParam}
          removeParam={props.removeParam}
          confirm={() => void (dialog.creating ? props.confirmCreate() : props.confirmEdit())}
          cancel={props.closeDialog}
        />
      ) : null}
      <Modal
        open={state.pendingDelete !== null}
        onClose={() => props.confirmDelete(null)}
        title={t('deleteTitle')}
        closeLabel={t('close')}
        description={t('deleteDescription')}
        className={css.deleteDialog as string}
        footer={(
          <>
            <Button variant="outline" disabled={state.deleting} onClick={() => props.confirmDelete(null)}>
              {t('cancel')}
            </Button>
            <Button className={css.deleteConfirm as string} disabled={state.deleting} onClick={() => void props.remove()}>
              {state.deleting ? t('deleting') : t('deleteConfirm')}
            </Button>
          </>
        )}
      >
        {t('deleteDescription')}
      </Modal>
    </div>
  )
}
