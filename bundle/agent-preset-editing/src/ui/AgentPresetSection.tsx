/**
 * Agent-presets settings section: the roster as cards, a copy dialog as the
 * only way a preset is created, a structured editor over a locally authored
 * preset's editable fields, and a read-only viewer over the shipped
 * compositions.
 *
 * The browser edits no composition text — a shipped preset opens read-only to
 * be READ (it is the known-good composition a copy starts from), and a custom
 * preset is edited in its own files through the structured form, which is what
 * the edit action opens. Deleting a preset leaves running sessions alone: a
 * composition is mounted once at session creation and nothing re-reads the
 * file.
 */

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  Button, IconBrowseOutline16, IconChevronDownOutline14, IconCopyOutline16, IconEditOutline16, IconFolderOpenOutline16, IconPlusOutline16, IconTrashOutline16, Menu, Modal, Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import {
  draftBlocker, type AgentPresetSectionState, type CatalogDraft, type DelegationDraft, type EditDraft,
} from './section-store.ts'
import { presetDisplayText, type AgentPresetSettingsKey } from './locales.ts'
import css from './AgentPresetSection.module.css'

/** Registration-side business face for the management section. */
export interface AgentPresetSectionInjected {
  hooks: {
    /** Page snapshot bound by the renderer as useAgentPresetSection. */
    agentPresetSection: SnapshotStore<AgentPresetSectionState>
  }
  /** Read the roster; called once when the section first renders. */
  load: () => Promise<void>
  /** Open one shipped preset's composition in the read-only viewer. */
  view: (id: string) => Promise<void>
  /** Close the read-only viewer. */
  closeView: () => void
  /** Open the copy dialog over one preset. */
  beginCopy: (from: string) => void
  /** Close the copy dialog, discarding the draft. */
  cancelCopy: () => void
  /** Name the preset the copy creates. */
  setCopyId: (id: string) => void
  /** Name the copy's display name. */
  setCopyName: (name: string) => void
  /** Submit the copy. */
  confirmCopy: () => Promise<void>
  /** Open the editable-fields editor over one locally authored preset. */
  beginEdit: (id: string) => Promise<void>
  /** Close the editor, discarding the draft. */
  cancelEdit: () => void
  /** Stage one editor field: scope (`persona`/`name`/`description`/`delegation:<id>`/`tool:<id>`/`catalog:<name>`), field, value. */
  setEditField: (scope: string, field: string, value: string | boolean) => void
  /** Submit the editor's staged fields. */
  confirmEdit: () => Promise<void>
  /** Open one preset's directory, or reveal its path where there is no desktop. */
  openLocation: (id: string) => Promise<void>
  /**
   * Stage the self-referential preset and start a new session on it — the
   * guided way to author a preset, beside copying. Absent when the surface
   * is composed without the conversation flow to land the session in.
   */
  startCreatorDraft?: () => void
  /** Ask for delete confirmation, or dismiss it with null. */
  confirmDelete: (id: string | null) => void
  /** Delete the preset awaiting confirmation. */
  remove: () => Promise<void>
  /** Make one preset the default for sessions created later. */
  makeDefault: (id: string) => Promise<void>
}

/** Full component props. */
export type AgentPresetSectionProps =
  PropsRuntime<'settings.section'>
  & PropsLocale<'settings.agentPreset'>
  & InjectFace<AgentPresetSectionInjected>

/** Copy-dialog sub-view props: the draft plus the actions that mutate it. */
interface CopyDialogProps {
  state: AgentPresetSectionState
  t: (key: AgentPresetSettingsKey) => string
  actions: Pick<AgentPresetSectionInjected,
    'cancelCopy' | 'confirmCopy' | 'setCopyId' | 'setCopyName'>
}

function CopyDialog({ state, t, actions }: CopyDialogProps): ReactNode {
  const draft = state.copy
  const blocker = draft === null ? undefined : draftBlocker(draft, state.rows)
  const message = draft === null ? null : draft.error ?? (blocker === undefined ? null : t(blocker))
  const source = draft === null ? undefined : state.rows.find(row => row.id === draft.from)
  const sourceTitle = source === undefined ? draft?.fromTitle : presetDisplayText(source, t).name
  return (
    <Modal
      open={draft !== null}
      onClose={() => { actions.cancelCopy() }}
      title={draft === null ? t('copyTitle') : `${t('copyTitle')} · ${t('copyOf')} ${sourceTitle}`}
      closeLabel={t('close')}
      description={t('copyIntro')}
      className={css.dialog as string}
      footer={(
        <>
          <Button
            variant="outline"
            disabled={draft?.saving === true}
            onClick={() => { actions.cancelCopy() }}
          >
            {t('cancel')}
          </Button>
          <Button
            disabled={draft === null || draft.saving || blocker !== undefined}
            onClick={() => { void actions.confirmCopy() }}
          >
            {draft?.saving === true ? t('creating') : t('create')}
          </Button>
        </>
      )}
    >
      {draft === null
        ? null
        : (
          <div className={css.dialogFields}>
            <label className={css.field}>
              <span className={css.fieldLabel}>{t('presetId')}</span>
              <input
                className={css.input}
                value={draft.id}
                autoFocus
                spellCheck={false}
                placeholder={t('presetIdPlaceholder')}
                onChange={(event) => { actions.setCopyId(event.target.value) }}
              />
            </label>
            <label className={css.field}>
              <span className={css.fieldLabel}>{t('displayName')}</span>
              <input
                className={css.input}
                value={draft.name}
                spellCheck={false}
                placeholder={t('displayNamePlaceholder')}
                onChange={(event) => { actions.setCopyName(event.target.value) }}
              />
            </label>
            {message === null ? null : <p className={css.error} role="alert">{message}</p>}
          </div>
        )}
    </Modal>
  )
}

/** Editor sub-view props: the draft plus the actions that mutate it. */
interface EditDialogProps {
  state: AgentPresetSectionState
  t: (key: AgentPresetSettingsKey) => string
  actions: Pick<AgentPresetSectionInjected,
    'cancelEdit' | 'confirmEdit' | 'setEditField'>
}

/** The background modes a delegation instance may use. */
const BACKGROUND_MODES = ['one-shot', 'continuable'] as const

/** The max-depth choices: explicit non-negative integers plus a provider-managed
 *  sentinel. Code and Claude carriers default to `provider-managed`; integer caps
 *  require the provider's `depthLimit` capability, so most users leave this
 *  alone. Keep `provider-managed` last so the menu shows numeric options first. */
const MAX_DEPTH_CHOICES = ['0', '1', '2', '3', '5', '10', 'provider-managed'] as const

/** Render one free-text editor field row (single-line or textarea). */
function TextEditField({
  label, value, placeholder, onEdit, textarea = false,
}: {
  label: string
  value: string
  placeholder?: string
  onEdit: (text: string) => void
  textarea?: boolean
}): ReactNode {
  const className = textarea ? `${css.input} ${css.textarea}` : css.input
  return (
    <label className={css.field}>
      <span className={css.fieldLabel}>{label}</span>
      {textarea
        ? (
          <textarea
            className={className}
            value={value}
            spellCheck={false}
            placeholder={placeholder}
            onChange={(event) => { onEdit(event.target.value) }}
          />
        )
        : (
          <input
            className={className}
            value={value}
            spellCheck={false}
            placeholder={placeholder}
            onChange={(event) => { onEdit(event.target.value) }}
          />
        )}
    </label>
  )
}

/**
 * Render an enum dropdown field, using the primitives Menu as the selector.
 *
 * The field label and the menu trigger are deliberately NOT one `<label>`
 * wrapper: a label containing a button associates the whole label's text with
 * that button (so the trigger's accessible name becomes the label, not its own
 * value) and forwards a click on the label text to the button — which would
 * open the dropdown from "blank" text, not the explicit trigger. Keeping the
 * label a plain sibling span means only the button itself opens the menu.
 */
function SelectField({
  label, value, choices, onSelect, disabled = false,
}: {
  label: string
  value: string
  choices: readonly string[]
  onSelect: (value: string) => void
  disabled?: boolean
}): ReactNode {
  const [open, setOpen] = useState(false)
  return (
    <div className={css.field}>
      <span className={css.fieldLabel}>{label}</span>
      <Menu
        open={disabled ? false : open}
        onClose={() => { setOpen(false) }}
        selectedId={value}
        items={choices.map(choice => ({ id: choice, label: choice }))}
        onSelect={(choice) => { onSelect(choice); setOpen(false) }}
        anchor={(
          <button
            type="button"
            className={`${css.input} ${css.selectTrigger}`}
            aria-haspopup="menu"
            aria-expanded={disabled ? false : open}
            disabled={disabled}
            onClick={() => { setOpen(!open) }}
          >
            <span>{value}</span>
            <IconChevronDownOutline14 className={css.selectChevron} />
          </button>
        )}
      />
    </div>
  )
}

/** Render an on/off toggle field (a switch-styled checkbox). */
function ToggleField({
  label, checked, onToggle, disabled = false,
}: {
  label: string
  checked: boolean
  onToggle: (checked: boolean) => void
  disabled?: boolean
}): ReactNode {
  return (
    <label className={`${css.field} ${css.toggleField}`}>
      <span className={css.fieldLabel}>{label}</span>
      <input
        type="checkbox"
        role="switch"
        className={css.toggle}
        checked={checked}
        disabled={disabled}
        onChange={(event) => { onToggle(event.target.checked) }}
      />
    </label>
  )
}

/** Render one delegation instance's editable controls. */
function DelegationRow({
  instance, t, actions,
}: {
  instance: DelegationDraft
  t: (key: AgentPresetSettingsKey) => string
  actions: Pick<AgentPresetSectionInjected, 'setEditField'>
}): ReactNode {
  const scope = `delegation:${instance.id}`
  return (
    <div className={css.delegationRow}>
      <div className={css.delegationHead}>
        <span className={css.delegationId}>{instance.id}</span>
        {instance.provider === undefined ? null : (
          <span className={css.delegationProvider}>
            {t('delegation.provider')}: {instance.provider}
          </span>
        )}
      </div>
      {instance.backgroundMode === undefined ? null : (
        <SelectField
          label={t('delegation.backgroundMode')}
          value={instance.backgroundMode}
          choices={BACKGROUND_MODES}
          disabled={instance.backgroundModeLocked}
          onSelect={(value) => { actions.setEditField(scope, 'backgroundMode', value) }}
        />
      )}
      {instance.enableRunInBackground === undefined ? null : (
        <ToggleField
          label={t('delegation.enableRunInBackground')}
          checked={instance.enableRunInBackground}
          onToggle={(checked) => { actions.setEditField(scope, 'enableRunInBackground', checked) }}
        />
      )}
      {instance.maxDepth === undefined ? null : (
        <SelectField
          label={t('delegation.maxDepth')}
          value={instance.maxDepth}
          choices={MAX_DEPTH_CHOICES}
          onSelect={(value) => { actions.setEditField(scope, 'maxDepth', value) }}
        />
      )}
      <ToggleField
        label={t('delegation.enabled')}
        checked={instance.enabled}
        onToggle={(checked) => { actions.setEditField(scope, 'enabled', checked) }}
      />
    </div>
  )
}

/** A collapsible detail disclosure rendered as an info marker after a row. */
function ToolInfo({ title, children }: { title: string, children: ReactNode }): ReactNode {
  return (
    <details className={css.toolInfo}>
      <summary className={css.toolInfoSummary} aria-label={`${title}: ${'详情'}`} title={title}>
        !
      </summary>
      <div className={css.toolInfoBody}>{children}</div>
    </details>
  )
}

/** Render one available-tool catalog entry: add if absent, remove if present. */
function CatalogRowView({
  entry, edit, t, actions,
}: {
  entry: CatalogDraft
  edit: EditDraft
  t: (key: AgentPresetSettingsKey) => string
  actions: Pick<AgentPresetSectionInjected, 'setEditField'>
}): ReactNode {
  const scope = `catalog:${entry.name}`
  if (entry.installed) {
    // Installed tools are removable; a row disabled by a loader expression is
    // not (the host refuses it), so that remove control is disabled too.
    const tool = edit.tools.find(candidate => candidate.name === entry.name)
    const removable = tool?.toggleable ?? true
    return (
      <div className={`${css.field} ${css.toolRow}`}>
        <input
          type="checkbox"
          role="switch"
          aria-label={entry.name}
          className={css.toggle}
          checked={edit.removeTools.has(entry.name) === false}
          disabled={!removable}
          onChange={(event) => { actions.setEditField(scope, 'remove', !event.target.checked) }}
        />
        <span className={css.toolId}>{entry.name}</span>
        <span className={css.toolState}>{t('toolInstalled')}</span>
        {!removable ? <span className={css.toolExpr}>{t('toolExprDisabled')}</span> : null}
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
    <div className={`${css.field} ${css.toolRow}`}>
      <input
        type="checkbox"
        role="switch"
        aria-label={entry.name}
        className={css.toggle}
        checked={edit.installTools.has(entry.name)}
        onChange={(event) => { actions.setEditField(scope, 'install', event.target.checked) }}
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
 * Render the editable-fields editor over one locally authored preset. The form
 * has four blocks: display metadata (name/description), the persona prompt,
 * every delegation instance (one row each, with enum dropdowns and toggles),
 * and the tool inventory (one row each, with a toggle).
 * @param props - editor props.
 * @returns the editor modal, or null when none is open.
 */
function EditDialog({ state, t, actions }: EditDialogProps): ReactNode {
  // Normalize an absent editor to null so the "no dialog open" branch is the
  // single closed state.
  const draft = state.edit ?? null
  const message = draft?.error ?? null
  return (
    <Modal
      open={draft !== null}
      onClose={() => { actions.cancelEdit() }}
      title={draft === null ? t('editTitle') : `${t('editTitle')} · ${draft.title}`}
      closeLabel={t('close')}
      description={t('editIntro')}
      className={css.dialog as string}
      contentClassName={css.dialogScroll as string}
      footer={(
        <>
          <Button
            variant="outline"
            disabled={draft?.saving === true}
            onClick={() => { actions.cancelEdit() }}
          >
            {t('cancel')}
          </Button>
          <Button
            disabled={draft === null || draft.saving}
            onClick={() => { void actions.confirmEdit() }}
          >
            {draft?.saving === true ? t('saving') : t('save')}
          </Button>
        </>
      )}
    >
      {draft === null
        ? null
        : (
          <div className={css.dialogFields}>
            {/* Block 1: display metadata. */}
            {draft.name === undefined ? null : (
              <TextEditField
                label={t('displayName')}
                value={draft.name}
                placeholder={t('displayNamePlaceholder')}
                onEdit={(text) => { actions.setEditField('name', 'value', text) }}
              />
            )}
            {draft.description === undefined ? null : (
              <TextEditField
                label={t('descriptionLabel')}
                value={draft.description}
                placeholder={t('descriptionPlaceholder')}
                textarea
                onEdit={(text) => { actions.setEditField('description', 'value', text) }}
              />
            )}

            {/* Block 2: persona. */}
            {draft.persona === undefined ? null : (
              <TextEditField
                label={t('personaText')}
                value={draft.persona}
                placeholder={t('personaTextPlaceholder')}
                textarea
                onEdit={(text) => { actions.setEditField('persona', 'value', text) }}
              />
            )}

            {/* Block 3: delegation instances. */}
            {draft.delegation.length === 0 ? null : (
              <section className={css.editorBlock}>
                <h4 className={css.blockTitle}>{t('delegationTitle')}</h4>
                {draft.delegation.map(instance => (
                  <DelegationRow key={instance.id} instance={instance} t={t} actions={actions} />
                ))}
              </section>
            )}

            {/* Block 4: one unified tool list — every available tool, with the
                installed ones marked and toggleable. */}
            {draft.catalog.length === 0 ? null : (
              <section className={css.editorBlock}>
                <h4 className={css.blockTitle}>{t('toolsTitle')}</h4>
                {draft.catalog.map(entry => (
                  <CatalogRowView key={entry.name} entry={entry} edit={draft} t={t} actions={actions} />
                ))}
              </section>
            )}

            {message === null ? null : <p className={css.error} role="alert">{message}</p>}
          </div>
        )}
    </Modal>
  )
}

/**
 * Render one card's description, clamped by CSS and offered in full on hover.
 * The tooltip is attached only while the text is actually cut off, so a short
 * description does not answer a hover with a bubble repeating the card.
 * @param props.text - the description as rendered, already localized.
 * @returns the description element, tooltip-anchored while it overflows.
 */
function CardDescription({ text }: { text: string }): ReactNode {
  const ref = useRef<HTMLSpanElement | null>(null)
  const [truncated, setTruncated] = useState(false)
  useLayoutEffect(() => {
    const el = ref.current
    /* v8 ignore next -- the ref is attached before layout effects run. */
    if (el === null) return
    const measure = () => { setTruncated(el.scrollHeight > el.clientHeight) }
    measure()
    // Card width follows the settings pane, which resizes with the window.
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => { observer.disconnect() }
  }, [text])
  return (
    // Capped near the card's own width: the default half-viewport bubble would
    // spill a description out of the settings dialog and across the app behind it.
    <Tooltip label={text} side="bottom" delayMs={400} disabled={!truncated} maxWidth={360}>
      {/* The empty title stops the card body's native tooltip from climbing to
        this span: a cut-off description answers with one bubble, not two. */}
      <span ref={ref} className={css.cardDesc} title="">{text}</span>
    </Tooltip>
  )
}

/**
 * Render the Agent presets section content column.
 * @param props - composed slot props.
 * @returns the section, or null when the deployment composes no presets.
 */
export function AgentPresetSection(props: AgentPresetSectionProps): ReactNode {
  const { useAgentPresetSection, t, load } = props
  const state = useAgentPresetSection(snapshot => snapshot)
  const viewedId = state.view?.id
  const viewedRow = viewedId === undefined ? undefined : state.rows.find(row => row.id === viewedId)
  const viewedTitle = state.view === null
    ? ''
    : viewedRow === undefined ? state.view.title : presetDisplayText(viewedRow, t).name

  useEffect(() => {
    void load()
  }, [load])

  // A deployment that composes no presets has nothing to manage: every
  // session shares the host composition and the page would be an empty list.
  if (state.status === 'unavailable') return null
  if (state.status === 'error') {
    /* v8 ignore next -- an error status always carries text; the fallback satisfies the nullable type */
    const detail = state.error ?? ''
    return (
      <div className={css.section}>
        <p className={css.error} role="alert">{`${t('error')} ${detail}`}</p>
        <button type="button" className={css.secondaryButton} onClick={() => { void load() }}>
          {t('retry')}
        </button>
      </div>
    )
  }

  /* The guided alternative to copying: the self-referential preset can
     read this very composition and author a new one in conversation.
     Offered only where that preset is actually on the roster and a
     session can be landed; without a writable root the draft could
     never be discovered, so the reason rides the disabled button. */
  const creatorButton = props.startCreatorDraft !== undefined && state.rows.some(row => row.id === 'cordis')
    ? (
      <button
        type="button"
        className={css.creatorButton}
        disabled={!state.authorable}
        title={state.authorable ? undefined : t('duplicateUnavailable')}
        onClick={() => {
          props.startCreatorDraft?.()
          props.close()
        }}
      >
        {/* Same glyph as the Models page's add affordances. */}
        <IconPlusOutline16 size={14} />
        {t('creatorDraft')}
      </button>
    )
    : null

  return (
    <div className={css.section}>
      <h2 className={css.title}>{t('nav')}</h2>
      <p className={css.intro}>{t('sectionIntro')}</p>
      {state.error === null ? null : <p className={css.error} role="alert">{state.error}</p>}
      {([['system', t('builtInGroup')], ['user', t('customGroup')]] as const).map(([trust, heading]) => {
        const group = state.rows
          .filter(row => row.trust === trust)
          .map(row => ({ row, text: presetDisplayText(row, t) }))
        // The custom group is where a preset of one's own will appear, so it
        // stays on screen even while empty: heading plus the creator entry.
        const tail = trust === 'user' ? creatorButton : null
        if (group.length === 0 && tail === null) return null
        return (
          <section key={trust} className={css.group}>
            <h3 className={css.groupHead}>{heading}</h3>
            {group.length === 0 ? null : (
              <ul className={css.cards}>
                {group.map(({ row, text }) => (
                  <li
                    key={row.id}
                    className={row.broken !== undefined
                      ? `${css.card} ${css.cardBroken}`
                      : row.isDefault ? `${css.card} ${css.cardActive}` : css.card}
                  >
                    {/* The card body IS the control: picking a preset is the
                      common act, so it should not hide behind a small button.
                      The action row sits outside it — nesting buttons is
                      invalid, and these act on the card rather than select it.
                      A broken preset cannot compose a session, so its body is
                      disabled and the card says why instead of offering it. */}
                    <button
                      type="button"
                      className={css.cardMain}
                      aria-pressed={row.isDefault}
                      disabled={row.isDefault || row.broken !== undefined}
                      // Without this the name is the whole card read aloud —
                      // title, badge, description, id.
                      aria-label={`${row.broken !== undefined ? t('brokenBadge') : row.isDefault ? t('inUse') : t('setDefault')}: ${text.name}`}
                      title={row.broken ?? (row.isDefault ? t('inUse') : t('setDefault'))}
                      onClick={() => { void props.makeDefault(row.id) }}
                    >
                      <span className={css.cardHead}>
                        <span className={css.cardName}>{text.name}</span>
                        {row.broken !== undefined
                          ? <span className={css.brokenBadge}>{t('brokenBadge')}</span>
                          : null}
                        <span className={css.badge}>
                          {row.trust === 'user' ? t('userTrust') : t('builtIn')}
                        </span>
                        {row.isDefault ? <span className={css.inUse}>{t('inUse')}</span> : null}
                      </span>
                      <CardDescription text={text.description ?? t('noDescription')} />
                      {row.broken === undefined
                        ? null
                        : <span className={css.cardBrokenReason} role="alert">{row.broken}</span>}
                      <code className={css.cardId}>{row.id}</code>
                    </button>
                    <div className={css.cardFoot}>
                      {/* Shipped presets are the compositions a copy starts
                        from, so READING one is the point; a custom preset is
                        edited in its files instead, which the location action
                        leads to. A broken shipped preset has no readable
                        composition to offer, so its viewer is withheld; a
                        broken custom one keeps the location action — the
                        files are where it gets fixed. */}
                      {/* View the preset's content read-only. Available for every
                          preset (system and user) — both trust levels support
                          reading. A broken preset keeps the view action so the
                          user can inspect what is wrong. */}
                      {row.broken === undefined
                        ? (
                          <button
                            type="button"
                            className={css.iconButton}
                            data-tip={t('view')}
                            aria-label={`${t('view')}: ${text.name}`}
                            onClick={() => { void props.view(row.id) }}
                          >
                            <IconBrowseOutline16 />
                          </button>
                        )
                        : null}
                      {/* Reveal the preset's file on disk. System presets ship
                          with the install and are not user-editable, so only
                          user presets get the open-folder action. */}
                      {row.trust !== 'system'
                        ? (
                          <button
                            type="button"
                            className={css.iconButton}
                            data-tip={state.hasDocument ? t('openLocation') : t('showLocation')}
                            aria-label={`${state.hasDocument ? t('openLocation') : t('showLocation')}: ${text.name}`}
                            onClick={() => { void props.openLocation(row.id) }}
                          >
                            <IconFolderOpenOutline16 />
                          </button>
                        )
                        : null}
                      <button
                        type="button"
                        className={css.iconButton}
                        disabled={!state.authorable || row.broken !== undefined}
                        data-tip={row.broken !== undefined
                          ? t('brokenNoCopy')
                          : state.authorable ? t('duplicate') : t('duplicateUnavailable')}
                        aria-label={`${t('duplicate')}: ${text.name}`}
                        onClick={() => { props.beginCopy(row.id) }}
                      >
                        <IconCopyOutline16 />
                      </button>
                      {row.trust === 'user'
                        ? (
                          <>
                            <button
                              type="button"
                              className={css.iconButton}
                              data-tip={t('edit')}
                              aria-label={`${t('edit')}: ${text.name}`}
                              onClick={() => { void props.beginEdit(row.id) }}
                            >
                              <IconEditOutline16 />
                            </button>
                            <button
                              type="button"
                              className={`${css.iconButton} ${css.iconDanger}`}
                              data-tip={t('delete')}
                              aria-label={`${t('delete')}: ${text.name}`}
                              onClick={() => { props.confirmDelete(row.id) }}
                            >
                              <IconTrashOutline16 />
                            </button>
                          </>
                        )
                        : null}
                    </div>
                    {state.revealedPaths[row.id] === undefined
                      ? null
                      : (
                        <p className={css.revealedPath}>
                          <span className={css.revealedPathLabel}>{t('revealedPathLabel')}</span>
                          <code>{state.revealedPaths[row.id]}</code>
                        </p>
                      )}
                  </li>
                ))}
              </ul>
            )}
            {tail}
          </section>
        )
      })}
      <CopyDialog
        state={state}
        t={t}
        actions={{
          cancelCopy: props.cancelCopy,
          confirmCopy: props.confirmCopy,
          setCopyId: props.setCopyId,
          setCopyName: props.setCopyName,
        }}
      />
      <EditDialog
        state={state}
        t={t}
        actions={{
          cancelEdit: props.cancelEdit,
          confirmEdit: props.confirmEdit,
          setEditField: props.setEditField,
        }}
      />
      <Modal
        open={state.view !== null}
        onClose={() => { props.closeView() }}
        title={state.view === null ? '' : `${t('view')} · ${viewedTitle}`}
        closeLabel={t('close')}
        description={t('composition')}
        className={css.dialog as string}
        contentClassName={css.dialogScroll as string}
        footer={(
          <Button variant="outline" autoFocus onClick={() => { props.closeView() }}>
            {t('close')}
          </Button>
        )}
      >
        {state.view === null
          ? null
          : <pre className={css.viewerCode}>{state.view.content}</pre>}
      </Modal>
      <Modal
        open={state.pendingDelete !== null}
        onClose={() => { props.confirmDelete(null) }}
        title={t('deleteTitle')}
        closeLabel={t('close')}
        description={t('deleteDescription')}
        className={css.deleteDialog as string}
        footer={(
          <>
            <Button
              variant="outline"
              autoFocus
              disabled={state.deleting}
              onClick={() => { props.confirmDelete(null) }}
            >
              {t('cancel')}
            </Button>
            <Button
              variant="outline"
              className={css.deleteConfirm}
              disabled={state.deleting}
              onClick={() => { void props.remove() }}
            >
              {state.deleting ? t('deleting') : t('deleteConfirm')}
            </Button>
          </>
        )}
      />
    </div>
  )
}
