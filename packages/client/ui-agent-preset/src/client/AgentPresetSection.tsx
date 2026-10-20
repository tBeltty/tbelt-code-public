/** Preset selection settings: the roster, its default, mode help, a read-only view of each composition, and the Creator-mode entry. */
import type { ReactNode } from 'react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  Button, IconBrowseOutlineRegular, IconPlusOutlineRegular, Modal, Tag, Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { ObservableSnapshot, SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { AgentPresetSectionState } from './section-store.ts'
import { isBuiltInPreset, presetDisplayText } from './locales.ts'
import { requiresCodingTools } from './settings-store.ts'
import { PresetGuideDialog, presetGuide, trapPresetReaderTab, type PresetGuidePage } from './PresetGuideDialog.tsx'
import css from './AgentPresetSection.module.css'

/** Settings actions and their shared controller state. */
export interface AgentPresetSectionInjected {
  hooks: {
    agentPresetSection: SnapshotStore<AgentPresetSectionState>
    /** Shared Coding Tools preference; off hides the built-in PTC and Minimal cards. */
    developerTools: ObservableSnapshot<boolean>
  }
  /** Stage the `cordis` preset and start a Creator-mode task; absent without a conversation flow. */
  startCreatorDraft?: () => void
  load: () => Promise<void>
  /** Open one preset's declared composition in the read-only viewer. */
  view: (id: string) => Promise<void>
  /** Close the read-only viewer. */
  closeView: () => void
  makeDefault: (id: string) => Promise<void>
  /** Open the editor on a new agent file. */
  newAgent: () => void
  /** Open the editor on one agent file of the authoring folder. */
  editAgent: (id: string) => Promise<void>
  /** Replace fields of the open agent file editor. */
  updateAgent: (patch: { readonly id?: string; readonly text?: string }) => void
  /** Validate, write and reload the open agent file. */
  saveAgent: () => Promise<void>
  /** Remove the open agent file after confirmation. */
  deleteAgent: () => Promise<void>
  /** Close the agent file editor without saving. */
  closeAgent: () => void
}
/** Props assembled by the settings renderer. */
export type AgentPresetSectionProps = PropsRuntime<'settings.section'> & PropsLocale<'settings.agentPreset'> & InjectFace<AgentPresetSectionInjected>

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

/** Render the roster with its default, mode help, composition viewer, and the guidance to Creator mode.
 * @param props Settings actions, snapshot hooks and localized text.
 * @returns The preset settings section.
 */
export function AgentPresetSection({
  useAgentPresetSection, load, view, closeView, makeDefault, startCreatorDraft,
  newAgent, editAgent, updateAgent, saveAgent, deleteAgent, closeAgent,
  close: closeSettings, useDeveloperTools, t,
}: AgentPresetSectionProps) {
  const state = useAgentPresetSection(value => value)
  const developerTools = useDeveloperTools(enabled => enabled)
  const [guide, setGuide] = useState<{
    content: NonNullable<ReturnType<typeof presetGuide>>
    page: PresetGuidePage
  } | null>(null)
  const viewTrigger = useRef<HTMLButtonElement | null>(null)
  const closeViewOnUnmount = useRef(closeView)
  const closeAgentOnUnmount = useRef(closeAgent)
  useEffect(() => { void load() }, [load])
  useLayoutEffect(() => { closeViewOnUnmount.current = closeView }, [closeView])
  useLayoutEffect(() => { closeAgentOnUnmount.current = closeAgent }, [closeAgent])
  useEffect(() => () => {
    closeViewOnUnmount.current()
    closeAgentOnUnmount.current()
  }, [])
  const closeViewer = () => { closeView(); viewTrigger.current?.focus() }
  const editor = state.editor
  const viewed = state.view
  const viewedRow = viewed === null ? undefined : state.rows.find(row => row.id === viewed.id)
  const viewedTitle = viewed === null ? '' : viewedRow === undefined ? viewed.title : presetDisplayText(viewedRow, t).name
  // Creator mode authors presets in conversation; it needs the flow to land a
  // session in and the self-referential preset on the roster.
  const creator = startCreatorDraft !== undefined && state.rows.some(row => row.id === 'cordis') ? startCreatorDraft : undefined
  /* The custom group is where a preset of one's own appears, so its entry
     stays on screen even while the group is empty. */
  const creatorButton = creator === undefined
    ? null
    : (
      <button
        type="button"
        className={css.creatorButton}
        disabled={state.saving}
        onClick={() => { creator(); closeSettings() }}
      >
        <IconPlusOutlineRegular size={14} />
        {t('creatorDraft')}
      </button>
    )
  return <section className={css.section}>
    <h2 className={css.title}>{t('nav')}</h2>
    <p className={css.intro}>{t('sectionIntro')}</p>
    {state.error === null ? null : <p className={css.error} role="alert">{state.error}</p>}
    {([true, false] as const).map((builtIn) => {
      const rows = state.rows.filter(row => isBuiltInPreset(row) === builtIn
        && (developerTools || !requiresCodingTools(row)))
      const entry = builtIn ? null : creatorButton
      if (rows.length === 0 && entry === null) return null
      return <section key={String(builtIn)} className={css.group}>
        <h3 className={css.groupHead}>{t(builtIn ? 'builtInGroup' : 'customGroup')}</h3>
        {rows.length === 0 ? null : <ul className={css.cards}>
          {rows.map((row) => {
            const display = presetDisplayText(row, t)
            const help = presetGuide(row.id, builtIn ? 'system' : 'user')
            const selectionAction = row.broken !== undefined ? t('brokenBadge')
              : t(row.isDefault ? 'inUse' : 'setDefault')
            return <li key={row.id} data-agent-preset-id={row.id} className={[
              css.card, row.broken === undefined ? undefined : css.cardBroken,
              row.isDefault ? css.cardActive : undefined,
            ].filter(Boolean).join(' ')}>
              <button type="button" className={css.cardMain} aria-pressed={row.isDefault}
                disabled={row.isDefault || (row.broken === undefined && state.saving)}
                aria-disabled={row.broken !== undefined} aria-label={`${selectionAction}: ${display.name}`} title={selectionAction}
                onClick={() => { if (row.broken === undefined) void makeDefault(row.id) }}>
                <span className={css.cardHead}>
                  <span className={css.cardIdentity}>
                    <span className={css.cardName} title={display.name}>{display.name}</span>
                    {row.broken === undefined ? null : <span className={css.brokenBadge}>
                      {t('brokenBadge')}<span className={css.brokenTip} aria-hidden="true">{row.broken}</span>
                    </span>}
                    <Tag tone={row.isDefault ? 'solid' : 'outline'}>
                      {row.isDefault ? t('inUse') : t(builtIn ? 'builtInGroup' : 'customGroup')}
                    </Tag>
                  </span>
                  {builtIn ? null : <code className={css.cardId} title={row.id}>{row.id}</code>}
                </span>
                <CardDescription text={display.description ?? t('noDescription')} />
                {row.broken === undefined ? null : <span className={css.cardBrokenReason} role="alert">{row.broken}</span>}
              </button>
              <div className={css.cardFoot}>
                {help === undefined ? null : <div className={css.cardHelp}>
                  <Button variant="ghost" className={css.helpButton} aria-label={`${t('modeExplanation')}: ${display.name}`}
                    onClick={() => { setGuide({ content: help, page: 'explanation' }) }}>{t('modeExplanation')}</Button>
                  <Button variant="ghost" className={css.helpButton} aria-label={`${t('howToUse')}: ${display.name}`}
                    onClick={() => { setGuide({ content: help, page: 'usage' }) }}>{t('howToUse')}</Button>
                </div>}
                {/* Reading the declaration is the one thing this page offers
                  beyond choosing: a broken preset's YAML is also where its
                  diagnostic points, so the viewer stays available for it. */}
                <button type="button" className={css.iconButton} data-tip={t('view')} aria-label={`${t('view')}: ${display.name}`}
                  onClick={(event) => { viewTrigger.current = event.currentTarget; void view(row.id) }}>
                  <IconBrowseOutlineRegular />
                </button>
              </div>
            </li>
          })}
        </ul>}
        {entry}
      </section>
    })}
    <section className={css.group}>
      <h3 className={css.groupHead}>{t('agentFilesTitle')}</h3>
      <p className={css.intro}>{t('agentFilesIntro')}</p>
      {state.files.length === 0 ? null : <ul className={css.fileList}>
        {state.files.map(file => <li key={file.id} data-agent-file-id={file.id} className={css.fileRow}>
          <span className={css.fileIdentity}>
            <code className={css.cardId} title={file.id}>{file.id}</code>
            <Tag tone="outline">{file.error === undefined ? t('agentLoaded') : t('agentNotLoaded')}</Tag>
          </span>
          {file.error === undefined ? null : <span className={css.cardBrokenReason} role="alert">{file.error}</span>}
          <Button variant="ghost" aria-label={`${t('editAgent')}: ${file.id}`} onClick={() => { void editAgent(file.id) }}>
            {t('editAgent')}
          </Button>
        </li>)}
      </ul>}
      <button type="button" className={css.creatorButton} disabled={state.saving} onClick={newAgent}>
        <IconPlusOutlineRegular size={14} />
        {t('newAgent')}
      </button>
    </section>
    {guide === null ? null : <PresetGuideDialog guide={guide.content} initialPage={guide.page} t={t} onClose={() => { setGuide(null) }} />}
    <Modal open={editor !== null} onClose={closeAgent} closeLabel={t('agentCancel')}
      title={editor === null ? '' : t(editor.creating ? 'newAgent' : 'editAgent')} className={css.dialog as string}
      footer={editor === null ? null : <div className={css.editorActions}>
        {editor.creating ? null : <Button variant="outline" disabled={editor.saving} onClick={() => { void deleteAgent() }}>
          {t(editor.confirmingDelete ? 'agentDeleteConfirm' : 'agentDelete')}
        </Button>}
        <Button variant="outline" onClick={closeAgent}>{t('agentCancel')}</Button>
        <Button variant="primary" disabled={editor.saving} onClick={() => { void saveAgent() }}>{t('agentSave')}</Button>
      </div>}>
      {editor === null ? null : <div className={css.editor}>
        <label className={css.editorField}>
          <span>{t('agentIdLabel')}</span>
          <input className={css.editorInput} value={editor.id} readOnly={!editor.creating} disabled={editor.saving}
            aria-describedby="agent-file-id-hint" onChange={(event) => { updateAgent({ id: event.currentTarget.value }) }} />
          <span id="agent-file-id-hint" className={css.intro}>{t('agentIdHint')}</span>
        </label>
        <label className={css.editorField}>
          <span>{t('agentTextLabel')}</span>
          <textarea className={css.editorText} value={editor.text} disabled={editor.saving} spellCheck={false}
            onChange={(event) => { updateAgent({ text: event.currentTarget.value }) }} />
        </label>
        {editor.notLoaded === null ? null : <p className={css.error} role="status">
          {t('agentSavedNotLoaded')} {editor.notLoaded}
        </p>}
        {editor.error === null ? null : <p className={css.error} role="alert">{editor.error}</p>}
      </div>}
    </Modal>
    <Modal open={viewed !== null} onClose={closeViewer} closeLabel={t('close')}
      onKeyDownCapture={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault()
          event.stopPropagation()
          closeViewer()
        } else trapPresetReaderTab(event)
      }}
      title={viewed === null ? '' : `${t('view')} · ${viewedTitle}`} className={css.dialog as string}
      footer={<Button variant="outline" autoFocus onClick={closeViewer}>{t('close')}</Button>}>
      {viewed === null ? null : <pre className={css.viewerCode}>{viewed.content}</pre>}
    </Modal>
  </section>
}
