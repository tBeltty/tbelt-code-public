/** Composer chip for unsent plan comments and the comment-aware review decision. */
import { useId, useMemo, useState } from 'react'
import { Button, IconEditOutlineRegular, IconListPenOutlineRegular, IconSendOutlineRegular, IconTrashOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { HostObservable, InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-user-questions/client'
import {
  formatPlanFeedback, planCommentExcerpt, sessionComments, unsentComments, type PlanComment, type PlanCommentState,
} from './comments.ts'
import css from './PlanComments.module.css'

/** Comment memory shared by the chip and the review decision. */
export interface PlanCommentsInjected {
  readonly hooks: {
    /** Comments of every plan document. */
    readonly planComments: HostObservable<PlanCommentState>
  }
  /**
   * Remove comments from one document.
   * @param address - Plan document address.
   * @param ids - Comment identities.
   */
  removeComments: (address: string, ids: readonly string[]) => void
  /**
   * Mark comments as carried by a sent answer or message.
   * @param address - Plan document address.
   * @param ids - Comment identities.
   */
  resolveComments: (address: string, ids: readonly string[]) => void
}

/** The composer chip additionally sends the comments as their own message. */
export interface PlanCommentChipInjected extends PlanCommentsInjected {
  /**
   * Send every unsent comment of a Session as one user message and resolve them once the Host accepts it.
   * @param sessionId - Session the message goes to.
   * @returns null once accepted; a user-visible failure line otherwise.
   */
  sendComments: (sessionId: PropsRuntime<'conversation.input.dock'>['sessionId']) => Promise<string | null>
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
 * plain message carries them, or Send to agent sends them on their own; the
 * list removes single comments.
 * @param props - Session identity, comment memory, the send verb, and copy.
 * @returns the count chip, its send action, and its list, or null without comments.
 */
export function PlanCommentChip({ sessionId, usePlanComments, removeComments, sendComments, t }: PropsRuntime<'conversation.input.dock'> & InjectFace<PlanCommentChipInjected> & PropsLocale<'plan'>) {
  const documents = usePlanComments(state => state.documents)
  const entries = useMemo(() => sessionComments(documents, sessionId), [documents, sessionId])
  const [expanded, setExpanded] = useState(false)
  const [sending, setSending] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const listId = useId()
  if (entries.length === 0) return null
  const count = entries.length
  const send = (): void => {
    setSending(true)
    setFailure(null)
    void sendComments(sessionId).then((line) => {
      setSending(false)
      setFailure(line)
    })
  }
  return (
    <div className={css.dock} data-plan-comment-chip>
      <div className={css.chipRow}>
        <button type="button" className={css.chip} aria-expanded={expanded} aria-controls={listId}
          onClick={() => { setExpanded(!expanded) }}>
          <IconListPenOutlineRegular size={14} />
          {t(count === 1 ? 'comments.count.one' : 'comments.count.other', { count })}
        </button>
        <button type="button" className={css.chip} disabled={sending} data-plan-comment-send onClick={send}>
          <IconSendOutlineRegular size={14} />
          {t('comments.send')}
        </button>
      </div>
      {failure !== null && <p className={css.failure} role="alert">{failure}</p>}
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
 * Decide a plan review. Without comments this is Request changes, which
 * returns the composer, and Approve. With comments, Request changes sends
 * them as Keep planning feedback so the model revises the plan at once, and
 * approval becomes the explicit "Approve without comments", which discards
 * them once the approval is sent.
 * @param props - Review decision owner, comment memory, and copy.
 * @returns the decision buttons.
 */
export function PlanReviewDecision({ review, requestKey, busy, approve, discuss, keepPlanning, usePlanComments, documentOf, removeComments, resolveComments, t }: PropsRuntime<'conversation.plan-review.decision'> & InjectFace<PlanReviewDecisionInjected> & PropsLocale<'plan'>) {
  const address = documentOf(review, requestKey)
  const stored = usePlanComments(state => state.documents[address] ?? NO_COMMENTS)
  const comments = useMemo(() => unsentComments(stored), [stored])
  const title = review.approve.description === undefined ? {} : { title: review.approve.description }
  const ids = comments.map(comment => comment.id)
  const requestChanges = (count?: number) => (
    <Button variant={count === undefined ? 'outline' : 'primary'} icon={<IconEditOutlineRegular size={14} />} disabled={busy}
      onClick={() => {
        if (count === undefined) { void discuss(); return }
        void keepPlanning(formatPlanFeedback(comments)).then((sent) => { if (sent) resolveComments(address, ids) })
      }}>
      {count === undefined ? t('review.requestChanges') : t(count === 1 ? 'review.send.one' : 'review.send.other', { count })}
    </Button>
  )
  if (comments.length === 0) {
    return (
      <>
        {requestChanges()}
        <Button variant="primary" {...title} disabled={busy} onClick={() => { void approve() }}>{t('review.approve')}</Button>
      </>
    )
  }
  return (
    <>
      <Button variant="outline" {...title} disabled={busy}
        onClick={() => { void approve().then((sent) => { if (sent) removeComments(address, ids) }) }}>{t('review.approveWithout')}</Button>
      {requestChanges(comments.length)}
    </>
  )
}
