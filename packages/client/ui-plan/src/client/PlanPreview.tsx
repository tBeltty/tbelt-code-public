/** Read-only Markdown viewer for logged plans, their versions, and temporary review documents. */
import { useEffect, useMemo } from 'react'
import { extractMarkdownPlainText, FileTypeIcon, MarkdownText } from '@deepseek-ai/dsh-client-ui-primitives'
import type { HostObservable, InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type {} from './plan-resource.ts'
import { isReviewPreviewAddress } from './review-preview.ts'
import { parsePlanAddress, planAddress, type PlanVersion } from './plan.ts'
import { planFailureLine } from './failure-line.ts'
import { commentSession, type PlanComment, type PlanCommentAnchor, type PlanCommentState } from './comments.ts'
import { PlanCommentLayer } from './PlanCommentLayer.tsx'
import css from './PlanPreview.module.css'

/** Comment memory and editing verbs for plan documents. */
export interface PlanPreviewInjected {
  readonly hooks: {
    /** Unsent comments of every plan document. */
    readonly planComments: HostObservable<PlanCommentState>
  }
  /** Save a new comment on a document. */
  addComment: (address: string, anchor: PlanCommentAnchor, text: string) => void
  /** Replace a comment's text. */
  updateComment: (address: string, id: string, text: string) => void
  /** Delete one comment. */
  removeComment: (address: string, id: string) => void
  /** Move unsent comments of earlier versions to a newer version whose plain text still contains their quote. */
  carryComments: (from: readonly string[], to: string, text: string) => void
}

type PlanPreviewProps = PropsRuntime<'sidebar.right.pane.tab'> & PropsLocale<'plan'> & InjectFace<PlanPreviewInjected>

const NO_COMMENTS: readonly PlanComment[] = []
const NO_VERSIONS: readonly PlanVersion[] = []

/**
 * Render the submitted plan with its complete Markdown. Documents of a
 * top-level Session or a pending review accept anchored comments. A logged
 * plan with several versions in its plan-mode episode shows a version bar;
 * choosing a version navigates this tab, and the newest version receives the
 * unsent comments of earlier versions whose quote it still contains.
 * @param props - Framework-bound tab identity, resource, comment memory, and copy.
 * @returns the plan document or a localized loading/failure state.
 */
export function PlanPreview(
  { useTabInfo, useResource, usePlanComments, addComment, updateComment, removeComment, carryComments, t }: PlanPreviewProps,
) {
  const tab = useTabInfo()
  const resource = useResource<'plan'>(tab.tab.navigation.address)
  const temporary = isReviewPreviewAddress(tab.tab.navigation.address)
  const params = tab.tab.navigation.params
  const plan = temporary ? (params !== undefined && 'planReview' in params ? params.planReview : undefined) : resource.value
  const address = tab.tab.navigation.address
  const comments = usePlanComments(state => state.documents[address] ?? NO_COMMENTS)
  const commentable = commentSession(address) !== undefined
  const target = useMemo(() => parsePlanAddress(address), [address])
  const versions = temporary ? NO_VERSIONS : resource.value?.versions ?? NO_VERSIONS
  const current = plan !== undefined && 'callId' in plan ? versions.findIndex(version => version.callId === plan.callId) : -1
  const markdown = plan?.markdown
  useEffect(() => {
    if (!commentable || target === undefined || markdown === undefined || current < 1 || current !== versions.length - 1) return
    const earlier = versions.slice(0, current).map(version => planAddress({ session: target.session, callId: version.callId }))
    carryComments(earlier, address, extractMarkdownPlainText(markdown))
  }, [commentable, target, markdown, current, versions, address, carryComments])
  const labels = useMemo(() => ({
    code: { copyLabel: t('copy'), copiedLabel: t('copied'), toolbarLabels: { codeLabel: t('codeBlock.title'), wrapLabel: t('codeBlock.wrap'), unwrapLabel: t('codeBlock.unwrap') } },
    footnotes: t('markdown.footnotes'),
  }), [t])
  if (plan === undefined) return (
    <div className={css.message} role="status">
      {temporary ? t('preview.expired') : resource.status === 'none' ? t('preview.unavailable')
        : resource.status === 'failed' ? t('preview.failed') : t('preview.loading')}
      {!temporary && resource.failure !== undefined && <p>{planFailureLine(t, resource.failure)}</p>}
    </div>
  )
  return (
    <section className={css.preview} data-plan-preview={'callId' in plan ? plan.callId : tab.tab.navigation.address} aria-label={plan.title}>
      {target !== undefined && versions.length > 1 && (
        <nav className={css.versions} aria-label={t('versions.label')} data-plan-versions>
          {versions.map((version, index) => (
            <button key={version.callId} type="button" className={css.version} aria-current={index === current ? 'page' : undefined}
              aria-label={t('versions.itemLabel', { version: index + 1, title: version.title })} title={version.title}
              onClick={() => {
                if (index === current) return
                tab.tab.actions.openResource(planAddress({ session: target.session, callId: version.callId }), { replaceTab: true })
              }}>
              {t('versions.item', { version: index + 1 })}
            </button>
          ))}
        </nav>
      )}
      {commentable
        ? (
          <PlanCommentLayer markdown={plan.markdown} labels={labels} comments={comments} t={t}
            onAdd={(anchor, text) => { addComment(address, anchor, text) }}
            onUpdate={(id, text) => { updateComment(address, id, text) }}
            onRemove={(id) => { removeComment(address, id) }} />
        )
        : <div className={css.document}><MarkdownText text={plan.markdown} labels={labels} /></div>}
    </section>
  )
}

/**
 * Display the plan file icon and the heading in its tab after resource recovery.
 * @param props - Framework-bound tab identity and resource reader.
 * @returns a decorative plan icon followed by the recovered title or initial localized label.
 */
export function PlanTitle({ useTabInfo, useResource }: PropsRuntime<'sidebar.right.pane.tab.title'>) {
  const tab = useTabInfo()
  const resource = useResource<'plan'>(tab.tab.navigation.address)
  const params = tab.tab.navigation.params
  const plan = isReviewPreviewAddress(tab.tab.navigation.address)
    ? (params !== undefined && 'planReview' in params ? params.planReview : undefined) : resource.value
  return <><FileTypeIcon kind="plan" size={16} className={css.titleIcon} />{plan?.title ?? tab.tab.title}</>
}
