/**
 * Subagents settings section: the independent "子代理" roster as cards, with
 * a create/copy dialog, a row-level enable/disable switch, an edit dialog over
 * the metadata fields, delete, and open-directory.
 *
 * This section reads the subagent registry — fully separate from the
 * agent-preset section — so the two rosters never mix. A shipped (system)
 * subagent is read-only: it cannot be toggled, edited, or deleted.
 */

import { useEffect } from 'react'
import type { ReactNode } from 'react'
import {
  Button, IconBrowseOutline16, IconEditOutline16, IconFolderOpenOutline16, IconPlusOutline16, IconTrashOutline16, Modal, Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import {
  createBlocker, INHERIT_MODEL_VALUE, modelOptionValue, type CatalogDraft, type EditDraft, type SubagentRow, type SubagentSectionState, type ViewDraft,
} from './section-store.ts'
import type { SubagentSettingsKey } from './locales.ts'
import css from './SubagentPresetSection.module.css'

/** Registration-side business face for the subagent management section. */
export interface SubagentSectionInjected {
  hooks: {
    /** Page snapshot bound by the renderer as useSubagentSection. */
    subagentSection: SnapshotStore<SubagentSectionState>
  }
  /** Read the roster; called once when the section first renders. */
  load: () => Promise<void>
  /** Open the create/copy dialog over one subagent. */
  beginCreate: (from: string) => void
  /** Close the create dialog, discarding the draft. */
  cancelCreate: () => void
  /** Name the subagent the create makes. */
  setCreateId: (id: string) => void
  /** Submit the create. */
  confirmCreate: () => Promise<void>
  /** Toggle one subagent's enabled switch on the row. */
  toggle: (id: string, enabled: boolean) => void
  /** Open the read-only viewer over one subagent's composition. */
  beginView: (id: string) => Promise<void>
  /** Close the read-only viewer. */
  closeView: () => void
  /** Open the metadata edit dialog over one locally authored subagent. */
  beginEdit: (id: string) => Promise<void>
  /** Close the edit dialog, discarding the draft. */
  cancelEdit: () => void
  /** Stage one edit field. */
  setEditField: (scope: string, field: string, value: string | boolean) => void
  /** Submit the edit dialog's staged fields. */
  confirmEdit: () => Promise<void>
  /** Open one subagent's directory, or reveal its path where there is no desktop. */
  openLocation: (id: string) => Promise<void>
  /** Ask for confirmation before deleting one subagent. */
  confirmDelete: (id: string | null) => void
  /** Delete the subagent awaiting confirmation. */
  remove: () => Promise<void>
}

/** Full component props. */
export type SubagentPresetSectionProps =
  PropsRuntime<'settings.section'>
  & PropsLocale<'settings.subagentPreset'>
  & InjectFace<SubagentSectionInjected>

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Subagent management-section copy. */
    'settings.subagentPreset': SubagentSettingsKey
  }
}

/** A one-card row rendering a subagent's identity, mode, Auto Run, and switch. */
function SubagentRowView(props: {
  row: SubagentRow
  t: (key: SubagentSettingsKey) => string
  onToggle: (id: string, enabled: boolean) => void
  onView: (id: string) => void
  onEdit: (id: string) => void
  onDelete: (id: string) => void
  onOpen: (id: string) => void
  hasDocument: boolean
  revealedPath: string | undefined
}): ReactNode {
  const { row, t, onToggle, onView, onEdit, onDelete, onOpen, hasDocument, revealedPath } = props
  const custom = row.trust === 'user'
  const broken = row.broken !== undefined
  return (
    <li className={`${css.card} ${broken ? css.cardBroken : ''}`}>
      <div className={css.cardHead}>
        <span className={css.cardName}>{row.id}</span>
        <span className={css.badge}>{custom ? t('userTrust') : t('systemTrust')}</span>
        {broken ? <span className={css.brokenBadge}>{t('brokenBadge')}</span> : null}
        <span className={css.headSpacer} />
        <Tooltip label={row.metadata.enabled !== false ? t('enabled') : t('disabled')} side="top">
          <input
            type="checkbox"
            className={css.toggle}
            checked={row.metadata.enabled !== false}
            disabled={broken}
            onChange={e => onToggle(row.id, e.target.checked)}
          />
        </Tooltip>
      </div>
      <p className={css.cardDesc}>{row.metadata.description ?? t('noDescription')}</p>
      <div className={css.cardId}>{row.id}</div>
      <div className={css.cardFoot}>
        <Tooltip label={t('view')} side="top">
          <button type="button" className={css.iconButton} onClick={() => onView(row.id)}>
            <IconBrowseOutline16 />
          </button>
        </Tooltip>
        <Tooltip label={t('edit')} side="top">
          <button type="button" className={css.iconButton} disabled={!custom} onClick={() => onEdit(row.id)}>
            <IconEditOutline16 />
          </button>
        </Tooltip>
        <Tooltip label={t('delete')} side="top">
          <button type="button" className={`${css.iconButton} ${css.iconDanger}`} disabled={!custom} onClick={() => onDelete(row.id)}>
            <IconTrashOutline16 />
          </button>
        </Tooltip>
        <Tooltip label={hasDocument ? t('openLocation') : t('showLocation')} side="top">
          <button type="button" className={css.iconButton} onClick={() => onOpen(row.id)}>
            <IconFolderOpenOutline16 />
          </button>
        </Tooltip>
      </div>
      {revealedPath !== undefined
        ? <p className={css.revealedPath}><span className={css.revealedPathLabel}>{t('revealedPathLabel')}</span> <code>{revealedPath}</code></p>
        : null}
    </li>
  )
}

/** The create/copy dialog. */
function CreateDialog(props: {
  state: SubagentSectionState
  t: (key: SubagentSettingsKey) => string
  setCreateId: (id: string) => void
  confirm: () => void
  cancel: () => void
}): ReactNode {
  const { state, t, setCreateId, confirm, cancel } = props
  const draft = state.create
  if (draft === null) return null
  const blocker = createBlocker(draft, state.rows)
  const message = draft.error ?? (blocker === undefined ? null : t(blocker))
  return (
    <Modal
      open
      onClose={cancel}
      title={t('createTitle')}
      closeLabel={t('close')}
      description={t('createIntro')}
      className={css.dialog as string}
      footer={(
        <>
          <Button variant="outline" disabled={draft.saving} onClick={cancel}>{t('cancel')}</Button>
          <Button disabled={draft.saving || blocker !== undefined} onClick={confirm}>
            {draft.saving ? t('creating') : t('create')}
          </Button>
        </>
      )}
    >
      <div className={css.dialogFields}>
        <div className={css.field}>
          <span className={css.fieldLabel}>{t('copyOf')}: {draft.fromTitle}</span>
        </div>
        <div className={css.field}>
          <span className={css.fieldLabel}>{t('idLabel')}</span>
          <input
            className={css.input}
            value={draft.id}
            placeholder={t('idPlaceholder')}
            onChange={e => setCreateId(e.target.value)}
          />
        </div>
        {message !== null ? <p className={css.error}>{message}</p> : null}
      </div>
    </Modal>
  )
}

/** The read-only composition viewer. */
function ViewDialog(props: {
  view: ViewDraft
  t: (key: SubagentSettingsKey) => string
  close: () => void
}): ReactNode {
  const { view, t, close } = props
  return (
    <Modal
      open
      onClose={close}
      title={`${t('viewTitle')}: ${view.title}`}
      closeLabel={t('close')}
      description={t('viewIntro')}
      className={css.dialog as string}
      contentClassName={css.dialogScroll as string}
      footer={(
        <Button variant="outline" onClick={close}>{t('close')}</Button>
      )}
    >
      <pre className={css.viewer}>{view.content}</pre>
    </Modal>
  )
}

/** The metadata edit dialog. */
function EditDialog(props: {
  edit: EditDraft
  t: (key: SubagentSettingsKey) => string
  setEditField: (scope: string, field: string, value: string | boolean) => void
  confirm: () => void
  cancel: () => void
}): ReactNode {
  const { edit, t, setEditField, confirm, cancel } = props
  return (
    <Modal
      open
      onClose={cancel}
      title={`${t('editTitle')}: ${edit.title}`}
      closeLabel={t('close')}
      description={t('editIntro')}
      className={css.dialog as string}
      contentClassName={css.dialogScroll as string}
      footer={(
        <>
          <Button variant="outline" disabled={edit.saving} onClick={cancel}>{t('cancel')}</Button>
          <Button disabled={edit.saving} onClick={confirm}>
            {edit.saving ? t('saving') : t('save')}
          </Button>
        </>
      )}
    >
      <div className={css.dialogFields}>
        <div className={css.field}>
          <span className={css.fieldLabel}>{t('descriptionLabel')}</span>
          <input
            className={css.input}
            value={edit.metadata.description}
            placeholder={t('descriptionPlaceholder')}
            onChange={e => setEditField('description', 'value', e.target.value)}
          />
        </div>
        <div className={css.field}>
          <span className={css.fieldLabel}>{t('personaLabel')}</span>
          <textarea
            className={`${css.input} ${css.textarea}`}
            value={edit.persona ?? ''}
            placeholder={t('personaPlaceholder')}
            onChange={e => setEditField('persona', 'value', e.target.value)}
          />
        </div>
        <div className={css.field}>
          <span className={css.fieldLabel}>{t('model')}</span>
          <select
            className={`${css.input} ${css.select}`}
            value={edit.metadata.model === undefined
              ? INHERIT_MODEL_VALUE
              : modelOptionValue(edit.metadata.model)}
            onChange={e => setEditField('model', 'value', e.target.value)}
          >
            <option value={INHERIT_MODEL_VALUE}>{t('inheritModel')}</option>
            {edit.modelChoices.map(group => (
              <optgroup key={group.provider} label={group.providerName}>
                {group.models.map(model => (
                  <option key={`${group.provider}\u0000${model.id}`} value={modelOptionValue({ provider: group.provider, model: model.id })}>
                    {model.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
        <div className={css.field}>
          <label className={css.inheritRow}>
            <input
              type="checkbox"
              role="switch"
              className={css.toggle}
              checked={edit.metadata.inheritParent}
              onChange={e => setEditField('inheritParent', 'value', e.target.checked)}
            />
            <span className={css.inheritLabel}>{t('inheritParentLabel')}</span>
          </label>
          <span className={css.fieldHint}>{t('inheritParentHint')}</span>
        </div>
        {edit.catalog.length === 0
          ? null
          : (
            <section className={css.editorBlock}>
              <h4 className={css.blockTitle}>{t('toolsTitle')}</h4>
              {edit.catalog.map(entry => (
                <ToolRowView
                  key={entry.name}
                  entry={entry}
                  edit={edit}
                  t={t}
                  setEditField={setEditField}
                />
              ))}
            </section>
          )}
        {edit.error !== null ? <p className={css.error}>{edit.error}</p> : null}
      </div>
    </Modal>
  )
}

/** A collapsible detail disclosure rendered as an info marker after a row. */
function ToolInfo({ title, children }: { title: string, children: ReactNode }): ReactNode {
  return (
    <details className={css.toolInfo}>
      <summary className={css.toolInfoSummary} aria-label={`${title}: 详情`} title={title}>
        !
      </summary>
      <div className={css.toolInfoBody}>{children}</div>
    </details>
  )
}

/** One available-tool catalog row: one switch + id + state + info marker. */
function ToolRowView({
  entry, edit, t, setEditField,
}: {
  entry: CatalogDraft
  edit: EditDraft
  t: (key: SubagentSettingsKey) => string
  setEditField: (scope: string, field: string, value: string | boolean) => void
}): ReactNode {
  const scope = `catalog:${entry.name}`
  if (entry.installed) {
    // A row disabled by a loader expression is not the form's to write; its
    // toggle reads disabled, so the remove control is disabled too.
    const tool = edit.tools.find(candidate => candidate.name === entry.name)
    const toggleable = tool?.disabled !== 'expr'
    return (
      <div className={css.toolRow}>
        <input
          type="checkbox"
          role="switch"
          aria-label={entry.name}
          className={css.toggle}
          checked={edit.removeTools.has(entry.name) === false}
          disabled={!toggleable}
          onChange={(event) => { setEditField(scope, 'remove', !event.target.checked) }}
        />
        <span className={css.toolId}>{entry.name}</span>
        <span className={css.toolState}>{t('toolInstalled')}</span>
        {!toggleable ? <span className={css.toolExpr}>{t('toolExprDisabled')}</span> : null}
        {entry.description === undefined
          ? <span className={css.toolInfoSpacer} />
          : (
            <ToolInfo title={entry.name}>
              <span className={css.toolDesc}>{entry.description}</span>
            </ToolInfo>
          )}
      </div>
    )
  }
  // Not yet installed: a checkbox the user ticks to install on save.
  return (
    <div className={css.toolRow}>
      <input
        type="checkbox"
        role="switch"
        aria-label={entry.name}
        className={css.toggle}
        checked={edit.installTools.has(entry.name)}
        onChange={(event) => { setEditField(scope, 'install', event.target.checked) }}
      />
      <span className={css.toolId}>{entry.name}</span>
      <span className={css.toolState}>{t('toolUninstalled')}</span>
      {entry.description === undefined
        ? <span className={css.toolInfoSpacer} />
        : (
          <ToolInfo title={entry.name}>
            <span className={css.toolDesc}>{entry.description}</span>
          </ToolInfo>
        )}
    </div>
  )
}

/**
 * Render the Subagents section content column.
 * @param props - composed slot props.
 * @returns the section, or null when the deployment composes no subagents.
 */
export function SubagentPresetSection(props: SubagentPresetSectionProps): ReactNode {
  const { useSubagentSection, t, load } = props
  const state = useSubagentSection(snapshot => snapshot)

  useEffect(() => {
    if (state.status === 'idle') void load()
  }, [state.status, load])

  if (state.status === 'loading') return <div>{t('loading')}</div>
  if (state.status === 'error') return <div style={{ color: 'var(--dsw-alias-state-error-primary)' }}>{t('error')}</div>
  if (state.status === 'unavailable') return <div>{t('unavailable')}</div>
  if (state.status !== 'ready') return null

  const factory = state.rows.find(row => row.trust === 'system')
  return (
    <div className={css.section}>
      <h2 className={css.title}>{t('nav')}</h2>
      <p className={css.intro}>{t('sectionIntro')}</p>
      <ul className={css.cards}>
        {state.rows.map(row => (
          <SubagentRowView
            key={row.id}
            row={row}
            t={t}
            onToggle={props.toggle}
            onView={props.beginView}
            onEdit={props.beginEdit}
            onDelete={props.confirmDelete}
            onOpen={props.openLocation}
            hasDocument={state.hasDocument}
            revealedPath={state.revealedPaths[row.id]}
          />
        ))}
      </ul>
      <button
        type="button"
        className={css.creatorButton}
        disabled={!state.authorable || factory === undefined}
        onClick={() => factory !== undefined && props.beginCreate(factory.id)}
      >
        <IconPlusOutline16 />
        {t('create')}
      </button>
      <CreateDialog
        state={state}
        t={t}
        setCreateId={props.setCreateId}
        confirm={() => void props.confirmCreate()}
        cancel={props.cancelCreate}
      />
      {state.view !== null
        ? <ViewDialog view={state.view} t={t} close={props.closeView} />
        : null}
      {state.edit !== null
        ? <EditDialog
            edit={state.edit}
            t={t}
            setEditField={props.setEditField}
            confirm={() => void props.confirmEdit()}
            cancel={props.cancelEdit}
          />
        : null}
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
