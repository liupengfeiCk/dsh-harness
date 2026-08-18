/**
 * Teams settings section: the independent "团队" (编制表) roster as cards, with
 * a create dialog, a row-level enable/disable switch, an edit detail over the
 * team's full role roster (body/soul/memory per role), delete, and
 * open-directory.
 *
 * This section reads the team registry — fully separate from both the
 * agent-preset roster and the subagent roster — so the rosters never mix. A
 * shipped (system) team is read-only: it cannot be toggled, edited, or deleted.
 *
 * The role roster renders as compact list rows (id + description one-line
 * summary + body id + memory tag + remove control); tapping a row opens a
 * single-role edit dialog over id / description / body / memory / soul prompt
 * — a single-column vertical form so future role attributes become one more
 * field row, not a layout overhaul. Adding a role enters the same edit dialog
 * in a fresh-draft state.
 */

import { useEffect } from 'react'
import type { ReactNode } from 'react'
import {
  Button, IconChevronLeftOutline14, IconEditOutline16, IconFolderOpenOutline16, IconPlusOutline16, IconTrashOutline16, Modal, Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import {
  createBlocker, detailBlocker, roleBlocker, type DetailDraft, type RoleDraft, type RoleEditDraft, type TeamRow, type TeamSectionState,
} from './section-store.ts'
import type { TeamSettingsKey } from './locales.ts'
import css from './TeamSection.module.css'

/** Registration-side business face for the team management section. */
export interface TeamSectionInjected {
  hooks: {
    /** Page snapshot bound by the renderer as useTeamSection. */
    teamSection: SnapshotStore<TeamSectionState>
  }
  /** Read the roster; called once when the section first renders. */
  load: () => Promise<void>
  /** Open the create dialog. */
  beginCreate: () => void
  /** Close the create dialog, discarding the draft. */
  cancelCreate: () => void
  /** Name the team the create makes. */
  setCreateId: (id: string) => void
  /** Set the create dialog's display name. */
  setCreateName: (name: string) => void
  /** Stage one field of one create role row. */
  setCreateRoleField: (index: number, field: string, value: string) => void
  /** Add an empty role row to the create dialog. */
  addCreateRole: () => void
  /** Remove one role row from the create dialog. */
  removeCreateRole: (index: number) => void
  /** Submit the create. */
  confirmCreate: () => Promise<void>
  /** Toggle one team's enabled switch on the row. */
  toggle: (id: string, enabled: boolean) => void
  /** Open the edit detail over one team's full role roster. */
  beginDetail: (id: string) => Promise<void>
  /** Close the edit detail, discarding the draft. */
  closeDetail: () => void
  /** Set the detail dialog's display name. */
  setDetailName: (name: string) => void
  /** Set the detail dialog's display description. */
  setDetailDescription: (description: string) => void
  /** Open the single-role edit dialog over one roster row. */
  beginRoleEdit: (index: number) => void
  /** Add a blank role to the team detail and open it in the edit dialog. */
  addRoleInDetail: () => void
  /** Stage one field of the role currently being edited. */
  setRoleEditField: (field: 'id' | 'description' | 'prompt' | 'body' | 'memory', value: string) => void
  /** Save the staged role back into the team detail's roster. */
  saveRoleEdit: () => Promise<void>
  /** Cancel the open role edit, rolling back the staged draft. */
  cancelRoleEdit: () => void
  /** Remove one role from the team detail's roster (also closes any open edit). */
  removeRole: (index: number) => void
  /** Submit the edit detail's staged roster. */
  confirmDetail: () => Promise<void>
  /** Open one team's directory, or reveal its path where there is no desktop. */
  openLocation: (id: string) => Promise<void>
  /** Ask for confirmation before deleting one team. */
  confirmDelete: (id: string | null) => void
  /** Delete the team awaiting confirmation. */
  remove: () => Promise<void>
}

/** Full component props. */
export type TeamSectionProps =
  PropsRuntime<'settings.section'>
  & PropsLocale<'settings.subagentTeam'>
  & InjectFace<TeamSectionInjected>

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Team management-section copy. */
    'settings.subagentTeam': TeamSettingsKey
  }
}

/** A compact role-row: id + one-line description summary + body + memory tag + remove. */
function RoleListRow(props: {
  role: RoleDraft
  index: number
  t: (key: TeamSettingsKey) => string
  canEdit: boolean
  saving: boolean
  onEdit: (index: number) => void
  onRemove: (index: number) => void
}): ReactNode {
  const { role, index, t, canEdit, saving, onEdit, onRemove } = props
  return (
    <li className={css.roleListRow}>
      <button
        type="button"
        className={css.roleListMain}
        disabled={!canEdit}
        onClick={() => onEdit(index)}
      >
        <span className={css.roleListId}>{role.id === '' ? t('roleIdEmpty') : role.id}</span>
        <span className={css.roleListSummary}>
          {role.description === '' ? t('noRoleSummary') : role.description}
        </span>
        <span className={css.roleListMeta}>
          <span className={css.roleListBody}>
            <span className={css.roleListLabel}>{t('roleBodyLabelShort')}</span>
            <span className={css.roleListBodyValue}>{role.body === '' ? '—' : role.body}</span>
          </span>
          <span className={css.roleListMemory}>
            <span className={css.roleListLabel}>{t('roleMemoryLabelShort')}</span>
            <span className={css.roleListMemoryValue}>
              {role.memory === 'persistent' ? t('memoryPersistent') : t('memoryOneShot')}
            </span>
          </span>
        </span>
      </button>
      <Tooltip label={t('removeRole')} side="top">
        <button
          type="button"
          className={`${css.iconButton} ${css.iconDanger}`}
          disabled={!canEdit || saving}
          onClick={() => onRemove(index)}
          aria-label={t('removeRole')}
        >
          <IconTrashOutline16 />
        </button>
      </Tooltip>
    </li>
  )
}

/** A one-card row rendering a team's identity, role count, and switch. */
function TeamRowView(props: {
  row: TeamRow
  t: (key: TeamSettingsKey) => string
  onToggle: (id: string, enabled: boolean) => void
  onDetail: (id: string) => void
  onDelete: (id: string) => void
  onOpen: (id: string) => void
  hasDocument: boolean
  revealedPath: string | undefined
}): ReactNode {
  const { row, t, onToggle, onDetail, onDelete, onOpen, hasDocument, revealedPath } = props
  const custom = row.trust === 'user'
  const broken = row.broken !== undefined
  return (
    <li className={`${css.card} ${broken ? css.cardBroken : ''}`}>
      <div className={css.cardHead}>
        <span className={css.cardName}>{row.metadata.name ?? row.id}</span>
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
      <div className={css.cardId}>
        <span className={css.roleCount}>{row.roleCount} {t('roleCount')}</span>
      </div>
      <div className={css.cardFoot}>
        <Tooltip label={t('detailTitle')} side="top">
          <button type="button" className={css.iconButton} disabled={!custom} onClick={() => onDetail(row.id)}>
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

/** The create dialog. */
function CreateDialog(props: {
  state: TeamSectionState
  t: (key: TeamSettingsKey) => string
  setCreateId: (id: string) => void
  setCreateName: (name: string) => void
  setRoleField: (index: number, field: string, value: string) => void
  addRole: () => void
  removeRole: (index: number) => void
  confirm: () => void
  cancel: () => void
}): ReactNode {
  const { state, t, setCreateId, setCreateName, setRoleField, addRole, removeRole, confirm, cancel } = props
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
      contentClassName={css.dialogScroll as string}
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
          <span className={css.fieldLabel}>{t('idLabel')}</span>
          <input
            className={css.input}
            value={draft.id}
            placeholder={t('idPlaceholder')}
            onChange={e => setCreateId(e.target.value)}
          />
        </div>
        <div className={css.field}>
          <span className={css.fieldLabel}>{t('nameLabel')}</span>
          <input
            className={css.input}
            value={draft.name}
            placeholder={t('namePlaceholder')}
            onChange={e => setCreateName(e.target.value)}
          />
        </div>
        <CreateRolesEditor
          roles={draft.roles}
          bodies={state.bodies}
          t={t}
          setRoleField={setRoleField}
          addRole={addRole}
          removeRole={removeRole}
        />
        {message !== null ? <p className={css.error}>{message}</p> : null}
      </div>
    </Modal>
  )
}

/** The roster editor used inside the create dialog (the only place a team is born with several roles at once). */
function CreateRolesEditor(props: {
  roles: readonly RoleDraft[]
  bodies: readonly string[]
  t: (key: TeamSettingsKey) => string
  setRoleField: (index: number, field: string, value: string) => void
  addRole: () => void
  removeRole: (index: number) => void
}): ReactNode {
  const { roles, bodies, t, setRoleField, addRole, removeRole } = props
  return (
    <section className={css.editorBlock}>
      <h4 className={css.blockTitle}>{t('rolesLabel')}</h4>
      {roles.map((role, index) => (
        <CreateRoleRow
          key={index}
          role={role}
          index={index}
          bodies={bodies}
          t={t}
          onField={setRoleField}
          onRemove={removeRole}
          removable={roles.length > 1}
        />
      ))}
      <button type="button" className={css.addRole} onClick={addRole}>
        <IconPlusOutline16 />
        {t('addRole')}
      </button>
    </section>
  )
}

/** One dense role row inside the create dialog (the multi-role seed keeps the existing flat layout). */
function CreateRoleRow(props: {
  role: RoleDraft
  index: number
  bodies: readonly string[]
  t: (key: TeamSettingsKey) => string
  onField: (index: number, field: string, value: string) => void
  onRemove: (index: number) => void
  removable: boolean
}): ReactNode {
  const { role, index, bodies, t, onField, onRemove, removable } = props
  return (
    <div className={css.roleRow}>
      <div className={css.roleGrid}>
        <div className={css.field}>
          <span className={css.fieldLabel}>{t('roleIdLabel')}</span>
          <input
            className={css.input}
            value={role.id}
            placeholder={t('roleIdPlaceholder')}
            onChange={e => onField(index, 'id', e.target.value)}
          />
        </div>
        <div className={css.field}>
          <span className={css.fieldLabel}>{t('roleDescriptionLabel')}</span>
          <input
            className={css.input}
            value={role.description}
            placeholder={t('roleDescriptionPlaceholder')}
            onChange={e => onField(index, 'description', e.target.value)}
          />
        </div>
        <div className={css.field}>
          <span className={css.fieldLabel}>{t('roleBodyLabel')}</span>
          <select
            className={`${css.input} ${css.select}`}
            value={role.body}
            onChange={e => onField(index, 'body', e.target.value)}
          >
            <option value="" disabled>
              {bodies.length === 0 ? t('noBodies') : t('roleBodyPlaceholder')}
            </option>
            {bodies.map(body => <option key={body} value={body}>{body}</option>)}
          </select>
        </div>
        <div className={css.field}>
          <span className={css.fieldLabel}>{t('roleMemoryLabel')}</span>
          <select
            className={`${css.input} ${css.select}`}
            value={role.memory}
            onChange={e => onField(index, 'memory', e.target.value)}
          >
            <option value="one-shot">{t('memoryOneShot')}</option>
            <option value="persistent">{t('memoryPersistent')}</option>
          </select>
        </div>
      </div>
      <div className={css.field}>
        <span className={css.fieldLabel}>{t('rolePromptLabel')}</span>
        <textarea
          className={`${css.input} ${css.textarea}`}
          value={role.prompt}
          placeholder={t('rolePromptPlaceholder')}
          onChange={e => onField(index, 'prompt', e.target.value)}
        />
      </div>
      <div className={css.roleRowFoot}>
        {removable
          ? (
            <button type="button" className={css.removeRole} onClick={() => onRemove(index)}>
              {t('removeRole')}
            </button>
          )
          : <span />}
      </div>
    </div>
  )
}

/** The team-detail modal: metadata fields + a compact role roster (rows + add). */
function DetailDialog(props: {
  detail: DetailDraft
  bodies: readonly string[]
  t: (key: TeamSettingsKey) => string
  setDetailName: (name: string) => void
  setDetailDescription: (description: string) => void
  beginRoleEdit: (index: number) => void
  addRole: () => void
  removeRole: (index: number) => void
  confirm: () => void
  cancel: () => void
}): ReactNode {
  const { detail, bodies: _bodies, t, setDetailName, setDetailDescription, beginRoleEdit, addRole, removeRole, confirm, cancel } = props
  const rolesEditable = detail.id !== ''
  const blocker = detailBlocker(detail)
  const message = detail.error ?? (blocker === undefined ? null : t(blocker))
  return (
    <Modal
      open
      onClose={cancel}
      title={`${t('detailTitle')}: ${detail.title}`}
      closeLabel={t('close')}
      description={t('detailIntro')}
      className={css.dialog as string}
      contentClassName={css.dialogScroll as string}
      footer={(
        <>
          <Button variant="outline" disabled={detail.saving} onClick={cancel}>{t('cancel')}</Button>
          <Button disabled={detail.saving || blocker !== undefined} onClick={confirm}>
            {detail.saving ? t('saving') : t('save')}
          </Button>
        </>
      )}
    >
      <div className={css.dialogFields}>
        <div className={css.field}>
          <span className={css.fieldLabel}>{t('nameLabel')}</span>
          <input
            className={css.input}
            value={detail.metadata.name ?? ''}
            placeholder={t('namePlaceholder')}
            onChange={e => setDetailName(e.target.value)}
          />
        </div>
        <div className={css.field}>
          <span className={css.fieldLabel}>{t('descriptionLabel')}</span>
          <input
            className={css.input}
            value={detail.metadata.description ?? ''}
            placeholder={t('descriptionPlaceholder')}
            onChange={e => setDetailDescription(e.target.value)}
          />
        </div>
        <section className={css.editorBlock}>
          <h4 className={css.blockTitle}>{t('rolesLabel')}</h4>
          {detail.roles.length === 0
            ? <p className={css.emptyRoles}>{t('noRoles')}</p>
            : (
              <ul className={css.rolesList}>
                {detail.roles.map((role, index) => (
                  <RoleListRow
                    key={`${detail.id}\u0000${index}`}
                    role={role}
                    index={index}
                    t={t}
                    canEdit={rolesEditable && !detail.saving}
                    saving={detail.saving}
                    onEdit={beginRoleEdit}
                    onRemove={removeRole}
                  />
                ))}
              </ul>
            )}
          <button
            type="button"
            className={css.addRole}
            disabled={!rolesEditable || detail.saving}
            onClick={addRole}
          >
            <IconPlusOutline16 />
            {t('addRole')}
          </button>
        </section>
        {message !== null ? <p className={css.error}>{message}</p> : null}
      </div>
    </Modal>
  )
}

/** The single-role edit dialog: a single-column vertical form over the staged draft. */
function RoleEditDialog(props: {
  edit: RoleEditDraft
  bodies: readonly string[]
  t: (key: TeamSettingsKey) => string
  setField: (field: 'id' | 'description' | 'prompt' | 'body' | 'memory', value: string) => void
  saving: boolean
  confirm: () => void
  cancel: () => void
}): ReactNode {
  const { edit, bodies, t, setField, saving, confirm, cancel } = props
  const draft = edit.draft
  const blocker = roleBlocker([draft])
  const message = edit.error ?? (blocker === undefined ? null : t(blocker))
  return (
    <Modal
      open
      onClose={cancel}
      title={t('roleEditTitle')}
      closeLabel={t('close')}
      description={t('roleEditIntro')}
      className={`${css.dialog} ${css.roleEditDialog}`}
      contentClassName={css.dialogScroll as string}
      footer={(
        <>
          <Button
            variant="outline"
            disabled={saving}
            onClick={cancel}
            icon={<IconChevronLeftOutline14 />}
          >
            {t('roleEditBack')}
          </Button>
          <Button disabled={saving || blocker !== undefined || !edit.dirty} onClick={confirm}>
            {saving ? t('saving') : t('roleEditSave')}
          </Button>
        </>
      )}
    >
      <div className={css.roleEditForm}>
        <div className={css.field}>
          <span className={css.fieldLabel}>{t('roleIdLabel')}</span>
          <input
            className={css.input}
            value={draft.id}
            placeholder={t('roleIdPlaceholder')}
            onChange={e => setField('id', e.target.value)}
          />
        </div>
        <div className={css.field}>
          <span className={css.fieldLabel}>{t('roleDescriptionLabel')}</span>
          <input
            className={css.input}
            value={draft.description}
            placeholder={t('roleDescriptionPlaceholder')}
            onChange={e => setField('description', e.target.value)}
          />
        </div>
        <div className={css.field}>
          <span className={css.fieldLabel}>{t('roleBodyLabel')}</span>
          <select
            className={`${css.input} ${css.select}`}
            value={draft.body}
            onChange={e => setField('body', e.target.value)}
          >
            <option value="" disabled>
              {bodies.length === 0 ? t('noBodies') : t('roleBodyPlaceholder')}
            </option>
            {bodies.map(body => <option key={body} value={body}>{body}</option>)}
          </select>
        </div>
        <div className={css.field}>
          <span className={css.fieldLabel}>{t('roleMemoryLabel')}</span>
          <select
            className={`${css.input} ${css.select}`}
            value={draft.memory}
            onChange={e => setField('memory', e.target.value)}
          >
            <option value="one-shot">{t('memoryOneShot')}</option>
            <option value="persistent">{t('memoryPersistent')}</option>
          </select>
        </div>
        <div className={css.field}>
          <span className={css.fieldLabel}>{t('rolePromptLabel')}</span>
          <textarea
            className={`${css.input} ${css.textarea} ${css.roleEditPrompt}`}
            value={draft.prompt}
            placeholder={t('rolePromptPlaceholder')}
            onChange={e => setField('prompt', e.target.value)}
          />
        </div>
        {message !== null ? <p className={css.error}>{message}</p> : null}
      </div>
    </Modal>
  )
}

/**
 * Render the Teams section content column.
 * @param props - composed slot props.
 * @returns the section, or null when the deployment composes no teams.
 */
export function TeamSection(props: TeamSectionProps): ReactNode {
  const { useTeamSection, t, load } = props
  const state = useTeamSection(snapshot => snapshot)

  useEffect(() => {
    if (state.status === 'idle') void load()
  }, [state.status, load])

  if (state.status === 'loading') return <div>{t('loading')}</div>
  if (state.status === 'error') return <div style={{ color: 'var(--dsw-alias-state-error-primary)' }}>{t('error')}</div>
  if (state.status === 'unavailable') return <div>{t('unavailable')}</div>
  if (state.status !== 'ready') return null

  const roleEdit = state.detail?.roleEdit ?? null
  const inRoleEdit = roleEdit !== null

  return (
    <div className={css.section}>
      <h2 className={css.title}>{t('nav')}</h2>
      <p className={css.intro}>{t('sectionIntro')}</p>
      <ul className={css.cards}>
        {state.rows.map(row => (
          <TeamRowView
            key={row.id}
            row={row}
            t={t}
            onToggle={props.toggle}
            onDetail={props.beginDetail}
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
        disabled={!state.authorable}
        onClick={() => props.beginCreate()}
      >
        <IconPlusOutline16 />
        {t('create')}
      </button>
      <CreateDialog
        state={state}
        t={t}
        setCreateId={props.setCreateId}
        setCreateName={props.setCreateName}
        setRoleField={props.setCreateRoleField}
        addRole={props.addCreateRole}
        removeRole={props.removeCreateRole}
        confirm={() => void props.confirmCreate()}
        cancel={props.cancelCreate}
      />
      {state.detail !== null
        ? (
          inRoleEdit
            ? null
            : (
              <DetailDialog
                detail={state.detail}
                bodies={state.bodies}
                t={t}
                setDetailName={props.setDetailName}
                setDetailDescription={props.setDetailDescription}
                beginRoleEdit={props.beginRoleEdit}
                addRole={props.addRoleInDetail}
                removeRole={props.removeRole}
                confirm={() => void props.confirmDetail()}
                cancel={props.closeDetail}
              />
            )
        )
        : null}
      {inRoleEdit && state.detail !== null
        ? (
          <RoleEditDialog
            edit={roleEdit}
            bodies={state.bodies}
            t={t}
            setField={props.setRoleEditField}
            saving={state.detail.saving}
            confirm={() => void props.saveRoleEdit()}
            cancel={props.cancelRoleEdit}
          />
        )
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
