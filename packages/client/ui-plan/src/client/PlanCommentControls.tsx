/** Composer chip for unsent plan comments and the comment-aware review decision. */
import { useId, useMemo, useState } from 'react'
import { Button, IconListPenOutlineRegular, IconTrashOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { HostObservable, InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-user-questions/client'
import {
  formatPlanFeedback, planCommentExcerpt, sessionComments, type PlanComment, type PlanCommentState,
} from './comments.ts'
import css from './PlanComments.module.css'

/** Comment memory shared by the chip and the review decision. */
export interface PlanCommentsInjected {
  readonly hooks: {
    /** Unsent comments of every plan document. */
    readonly planComments: HostObservable<PlanCommentState>
  }
  /**
   * Remove comments from one document.
   * @param address - Plan document address.
   * @param ids - Comment identities.
   */
  removeComments: (address: string, ids: readonly string[]) => void
}

/** The review decision additionally resolves the document of a pending review. */
export interface PlanReviewDecisionInjected extends PlanCommentsInjected {
  /**
   * Name the plan document a pending review displays.
   * @param review - Review under decision.
   * @param requestKey - Browser-unique pending request identity.
   * @returns the document address whose comments belong to this review.
   */
  documentOf: (review: PropsRuntime<'conversation.plan-review.decision'>['review'], requestKey: string) => string
}

const NO_COMMENTS: readonly PlanComment[] = []

/**
 * Show the unsent comments of this Session above the composer. The next
 * plain message carries them; the list removes single comments.
 * @param props - Session identity, comment memory, and copy.
 * @returns the count chip and its list, or null without comments.
 */
export function PlanCommentChip({ sessionId, usePlanComments, removeComments, t }: PropsRuntime<'conversation.input.dock'> & InjectFace<PlanCommentsInjected> & PropsLocale<'plan'>) {
  const documents = usePlanComments(state => state.documents)
  const entries = useMemo(() => sessionComments(documents, sessionId), [documents, sessionId])
  const [expanded, setExpanded] = useState(false)
  const listId = useId()
  if (entries.length === 0) return null
  const count = entries.length
  return (
    <div className={css.dock} data-plan-comment-chip>
      <button type="button" className={css.chip} aria-expanded={expanded} aria-controls={listId}
        onClick={() => { setExpanded(!expanded) }}>
        <IconListPenOutlineRegular size={14} />
        {t(count === 1 ? 'comments.count.one' : 'comments.count.other', { count })}
      </button>
      {expanded && (
        <ul id={listId} className={css.dockList} aria-label={t('comments.list')}>
          {entries.map(({ address, comment }) => (
            <li key={comment.id} className={css.item} data-plan-comment={comment.id}>
              <blockquote className={css.quote}>{planCommentExcerpt(comment.quote)}</blockquote>
              <div className={css.itemBody}>
                <p className={css.text}>{comment.text}</p>
                <button type="button" className={css.iconButton} aria-label={t('comment.remove')} title={t('comment.remove')}
                  onClick={() => { removeComments(address, [comment.id]) }}><IconTrashOutlineRegular size={14} /></button>
              </div>
            </li>
          ))}
          <li><p className={css.hint}>{t('comments.hint')}</p></li>
        </ul>
      )}
    </div>
  )
}

/**
 * Decide a plan review. Without comments this is the Approve button. With
 * comments the primary action sends them as Keep planning feedback, and
 * approval becomes the explicit "Approve without comments", which discards
 * them once the approval is sent.
 * @param props - Review decision owner, comment memory, and copy.
 * @returns the decision buttons.
 */
export function PlanReviewDecision({ review, requestKey, busy, approve, keepPlanning, usePlanComments, documentOf, removeComments, t }: PropsRuntime<'conversation.plan-review.decision'> & InjectFace<PlanReviewDecisionInjected> & PropsLocale<'plan'>) {
  const address = documentOf(review, requestKey)
  const comments = usePlanComments(state => state.documents[address] ?? NO_COMMENTS)
  const title = review.approve.description === undefined ? {} : { title: review.approve.description }
  const settle = (send: Promise<boolean>): void => {
    const ids = comments.map(comment => comment.id)
    void send.then((sent) => { if (sent) removeComments(address, ids) })
  }
  if (comments.length === 0) {
    return <Button variant="primary" {...title} disabled={busy} onClick={() => { void approve() }}>{t('review.approve')}</Button>
  }
  return (
    <>
      <Button variant="outline" {...title} disabled={busy} onClick={() => { settle(approve()) }}>{t('review.approveWithout')}</Button>
      <Button variant="primary" disabled={busy} onClick={() => { settle(keepPlanning(formatPlanFeedback(comments))) }}>
        {t(comments.length === 1 ? 'review.send.one' : 'review.send.other', { count: comments.length })}
      </Button>
    </>
  )
}
