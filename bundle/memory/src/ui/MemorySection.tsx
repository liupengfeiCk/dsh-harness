/**
 * Memory settings section ("记忆"): the independent settings block over the
 * `/memory` wire channel.
 *
 * Renders the three scope tabs (team / team+role / project), each showing the
 * three memory layers (L1 / L2 / L3), with view-detail, delete-with-
 * confirmation, role↔asset binding (装配规则), the pipeline status summary, and
 * the live memory configuration.
 *
 * @module dsh-harness-memory-bundle/ui/MemorySection
 */

import { useEffect } from 'react'
import type { ReactNode } from 'react'
import {
  Button, IconBrowseOutline16, IconTrashOutline16, Modal,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {
  MemorySectionState, AssetRow, ScopeTab,
} from './section-store.ts'
import type { MemoryKey } from './locales.ts'
import css from './MemorySection.module.css'

/** Registration-side business face for the memory settings section. */
export interface MemorySectionInjected {
  hooks: {
    /** Page snapshot bound by the renderer as useMemorySection. */
    memorySection: SnapshotStore<MemorySectionState>
  }
  /** Load the active tab + config; called once when the section first renders. */
  load: () => Promise<void>
  /** Switch the active scope tab. */
  setActive: (scope: ScopeTab['key']) => Promise<void>
  /** Open one asset's detail. */
  viewAsset: (ref: string) => Promise<void>
  /** Close the detail. */
  closeDetail: () => void
  /** Ask for confirmation before deleting one asset. */
  confirmDelete: (ref: string | null) => void
  /** Delete the asset awaiting confirmation. */
  remove: () => Promise<void>
  /** Set the role id for the binding editor. */
  setBindRoleId: (roleId: string) => void
  /** Load the assets bound to one role. */
  loadRoleBindings: (roleId: string) => Promise<void>
  /** Bind one asset to the current role. */
  bindAsset: (ref: string) => Promise<void>
  /** Unbind one asset from the current role. */
  unbindAsset: (ref: string) => Promise<void>
}

/** Full component props. */
export type MemorySectionProps =
  PropsRuntime<'settings.section'>
  & PropsLocale<'settings.memory'>
  & InjectFace<MemorySectionInjected>

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Memory management-section copy. */
    'settings.memory': MemoryKey
  }
}

/** One asset row in a layer list. */
function AssetRowView(props: {
  row: AssetRow
  t: (key: MemoryKey) => string
  onView: (ref: string) => void
  onDelete: (ref: string) => void
  onBind: (ref: string) => void
  onUnbind: (ref: string) => void
  bound: boolean
}): ReactNode {
  const { row, t, onView, onDelete, onBind, onUnbind, bound } = props
  return (
    <li className={css.assetRow}>
      <button type="button" className={css.assetTitle} onClick={() => onView(row.ref)}>{row.title}</button>
      <span className={css.assetPreview}>{row.preview}</span>
      <div className={css.assetActions}>
        <button type="button" className={css.iconButton} onClick={() => onView(row.ref)} aria-label={t('view')}>
          <IconBrowseOutline16 />
        </button>
        {bound
          ? (
            <button type="button" className={`${css.iconButton} ${css.iconWarn}`} onClick={() => onUnbind(row.ref)} aria-label={t('unbind')}>
              {t('unbind')}
            </button>
          )
          : (
            <button type="button" className={css.iconButton} onClick={() => onBind(row.ref)} aria-label={t('bind')}>
              {t('bind')}
            </button>
          )}
        <button type="button" className={`${css.iconButton} ${css.iconDanger}`} onClick={() => onDelete(row.ref)} aria-label={t('delete')}>
          <IconTrashOutline16 />
        </button>
      </div>
    </li>
  )
}

/** One layer's asset list with an empty state. */
function LayerList(props: {
  title: string
  rows: readonly AssetRow[]
  t: (key: MemoryKey) => string
  onView: (ref: string) => void
  onDelete: (ref: string) => void
  onBind: (ref: string) => void
  onUnbind: (ref: string) => void
  bound: (ref: string) => boolean
}): ReactNode {
  const { title, rows, t, onView, onDelete, onBind, onUnbind, bound } = props
  if (rows.length === 0) {
    return (
      <section className={css.layer}>
        <h4 className={css.layerTitle}>{title}</h4>
        <p className={css.emptyLayer}>{t('emptyLayer')}</p>
      </section>
    )
  }
  return (
    <section className={css.layer}>
      <h4 className={css.layerTitle}>{title}</h4>
      <ul className={css.assetList}>
        {rows.map(row => (
          <AssetRowView
            key={row.ref}
            row={row}
            t={t}
            onView={onView}
            onDelete={onDelete}
            onBind={onBind}
            onUnbind={onUnbind}
            bound={bound(row.ref)}
          />
        ))}
      </ul>
    </section>
  )
}

/** The status summary block. */
function StatusBlock(props: {
  t: (key: MemoryKey) => string
  l0Count: number
  l1Count: number
  l2Count: number
  l3Count: number
  lastExtractedAtMs: number
}): ReactNode {
  const { t, l0Count, l1Count, l2Count, l3Count, lastExtractedAtMs } = props
  const last = lastExtractedAtMs > 0
    ? new Date(lastExtractedAtMs).toLocaleString()
    : t('statusNever')
  return (
    <section className={css.statusBlock}>
      <h4 className={css.blockTitle}>{t('statusTitle')}</h4>
      <ul className={css.statusGrid}>
        <li><span>{t('statusL0')}</span><strong>{l0Count}</strong></li>
        <li><span>{t('statusL1')}</span><strong>{l1Count}</strong></li>
        <li><span>{t('statusL2')}</span><strong>{l2Count}</strong></li>
        <li><span>{t('statusL3')}</span><strong>{l3Count}</strong></li>
      </ul>
      <p className={css.statusLast}>{t('statusLastExtracted')}: {last}</p>
    </section>
  )
}

/**
 * Render the memory settings section content column.
 * @param props - composed slot props.
 * @returns the section, or null when loading/error states resolve elsewhere.
 */
export function MemorySection(props: MemorySectionProps): ReactNode {
  const { useMemorySection, t, load, setActive, viewAsset, closeDetail, confirmDelete, remove,
    setBindRoleId, loadRoleBindings, bindAsset, unbindAsset } = props
  const state = useMemorySection(snapshot => snapshot)

  useEffect(() => {
    if (state.status === 'idle') void load()
  }, [state.status, load])

  if (state.status === 'loading') return <div>{t('loading')}</div>
  if (state.status === 'error') return <div style={{ color: 'var(--dsw-alias-state-error-primary)' }}>{t('error')}</div>
  if (state.status !== 'ready') return null

  const bound = (ref: string): boolean => state.roleAssets.includes(ref)
  const tab = state.active

  return (
    <div className={css.section}>
      <h2 className={css.title}>{t('nav')}</h2>
      <p className={css.intro}>{t('sectionIntro')}</p>

      <div className={css.tabs}>
        <button
          type="button"
          className={`${css.tab} ${tab === 'team' ? css.tabActive : ''}`}
          onClick={() => void setActive('team')}
        >
          {t('scopeTeam')}
        </button>
        <button
          type="button"
          className={`${css.tab} ${tab === 'teamRole' ? css.tabActive : ''}`}
          onClick={() => void setActive('teamRole')}
        >
          {t('scopeTeamRole')}
        </button>
        <button
          type="button"
          className={`${css.tab} ${tab === 'project' ? css.tabActive : ''}`}
          onClick={() => void setActive('project')}
        >
          {t('scopeProject')}
        </button>
      </div>

      <div className={css.statusRow}>
        {state.statusSummary !== null
          ? (
            <StatusBlock
              t={t}
              l0Count={state.statusSummary.l0Count}
              l1Count={state.statusSummary.l1Count}
              l2Count={state.statusSummary.l2Count}
              l3Count={state.statusSummary.l3Count}
              lastExtractedAtMs={state.statusSummary.lastExtractedAtMs}
            />
          )
          : null}
      </div>

      <div className={css.layers}>
        <LayerList
          title={t('layerL1')}
          rows={state.l1}
          t={t}
          onView={viewAsset}
          onDelete={confirmDelete}
          onBind={bindAsset}
          onUnbind={unbindAsset}
          bound={bound}
        />
        <LayerList
          title={t('layerL2')}
          rows={state.l2}
          t={t}
          onView={viewAsset}
          onDelete={confirmDelete}
          onBind={bindAsset}
          onUnbind={unbindAsset}
          bound={bound}
        />
        <LayerList
          title={t('layerL3')}
          rows={state.l3}
          t={t}
          onView={viewAsset}
          onDelete={confirmDelete}
          onBind={bindAsset}
          onUnbind={unbindAsset}
          bound={bound}
        />
      </div>

      <section className={css.bindBlock}>
        <h4 className={css.blockTitle}>{t('bindTitle')}</h4>
        <p className={css.bindHint}>{t('bindHint')}</p>
        <div className={css.bindRow}>
          <label className={css.bindLabel} htmlFor="memory-bind-role">{t('bindRoleLabel')}</label>
          <input
            id="memory-bind-role"
            className={css.input}
            value={state.bindRoleId}
            placeholder={t('bindRolePlaceholder')}
            onChange={e => setBindRoleId(e.target.value)}
          />
          <Button variant="outline" onClick={() => void loadRoleBindings(state.bindRoleId)}>
            {t('loadBindings')}
          </Button>
        </div>
        {state.bindRoleId !== '' ? (
          <p className={css.boundAssets}>
            {state.roleAssets.length === 0
              ? t('noBindings')
              : `${t('boundAssets')}: ${state.roleAssets.join(', ')}`}
          </p>
        ) : null}
      </section>

      {state.config !== null ? (
        <section className={css.configBlock}>
          <h4 className={css.blockTitle}>{t('configTitle')}</h4>
          <ul className={css.configGrid}>
            <li><span>{t('configEnabled')}</span><strong>{state.config.enabled ? 'on' : 'off'}</strong></li>
            <li><span>{t('configRefinementPlan')}</span><strong>{state.config.refinementPlan || '—'}</strong></li>
            <li>
              <span>{t('configCompression')}</span>
              <strong>{state.config.compressionMode === 'follow' ? t('configCompressionFollow') : state.config.compressionPlan}</strong>
            </li>
            <li><span>{t('configInjectionLimit')}</span><strong>{Math.round(state.config.injectionLimit * 100)}{t('percent')}</strong></li>
            <li><span>{t('configCompressionLine')}</span><strong>{Math.round(state.config.compressionLine * 100)}{t('percent')}</strong></li>
            <li><span>{t('configRetainLine')}</span><strong>{Math.round(state.config.retainLine * 100)}{t('percent')}</strong></li>
          </ul>
        </section>
      ) : null}

      <Modal
        open={state.detail !== null}
        onClose={closeDetail}
        title={state.detail?.title ?? ''}
        closeLabel={t('close')}
        className={css.detailDialog as string}
        footer={(
          <Button variant="outline" onClick={closeDetail}>{t('close')}</Button>
        )}
      >
        <pre className={css.detailContent}>{state.detail?.content ?? ''}</pre>
      </Modal>

      <Modal
        open={state.pendingDelete !== null}
        onClose={() => confirmDelete(null)}
        title={t('deleteTitle')}
        closeLabel={t('close')}
        description={t('deleteDescription')}
        className={css.deleteDialog as string}
        footer={(
          <>
            <Button variant="outline" disabled={state.deleting} onClick={() => confirmDelete(null)}>
              {t('close')}
            </Button>
            <Button className={css.deleteConfirm as string} disabled={state.deleting} onClick={() => void remove()}>
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
