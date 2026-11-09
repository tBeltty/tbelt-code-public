/**
 * The bare `/feedback` panel: rate the last reply or send feedback about the
 * session. The command with text, `/feedback <text>`, still goes to the session.
 * @module @deepseek-ai/dsh-terminal-client/panels/feedback
 */
import { lastReply, ratingItems, t } from '@deepseek-ai/dsh-terminal-views'
import type { Rating } from '@deepseek-ai/dsh-terminal-views'
import { remoteValue } from '../config/ui.ts'
import type { FlowUi } from '../config/ui.ts'
import type { MessageFeedbackItemPort } from '../panel-ports.ts'
import type { RemoteResultPort } from '../ports.ts'
import type { PanelContext } from './context.ts'

/** Marker values of the first choice. */
const RATE = 'rate'
const SEND = 'send'

/** What a feedback call answers: the Host's own success or refusal inside the Remote result. */
type Answer<V> = { readonly ok: true; readonly value?: V } | { readonly ok: false; readonly error: { readonly code: string } }

/**
 * Run a feedback call and report a failure of the call or a refusal by the Host.
 * @param ui - where a failure is printed.
 * @param failed - the line that introduces the failure, given its reason.
 * @param call - the Remote call.
 * @returns the answer's value in a box, which is undefined for a call that carries none; undefined after a failure was printed.
 */
async function feedbackCall<V>(
  ui: FlowUi,
  failed: (message: string) => string,
  call: () => Promise<RemoteResultPort<Answer<V>>>,
): Promise<{ readonly value: V | undefined } | undefined> {
  const answer = await remoteValue(ui, failed, call)
  if (answer === undefined) return undefined
  if (!answer.ok) {
    ui.warn(failed(answer.error.code))
    return undefined
  }
  return { value: answer.value }
}

/**
 * Run the `/feedback` panel once.
 * @param ctx - the session and the Remote namespaces.
 * @param ui - where questions and messages go.
 * @returns settles when the person finished or left the panel.
 */
export async function runFeedback(ctx: PanelContext, ui: FlowUi): Promise<void> {
  const failed = (message: string): string => t('feedback.failed', { message })
  const { sessionId } = ctx.session
  const first = await ui.pick(t('feedback.title'), [
    { value: RATE, label: t('feedback.rate') },
    { value: SEND, label: t('feedback.send') },
  ])
  if (first?.value === SEND) {
    const text = await ui.ask(t('feedback.textPrompt'), { hint: t('feedback.textHint') })
    if (text === undefined || text === '') return
    if (await feedbackCall(ui, failed, () => ctx.remote.sessionFeedback.record({ sessionId, text }))) ui.info(t('feedback.sent'))
    return
  }
  if (first?.value !== RATE) return
  const reply = lastReply(ctx.session.events())
  if (reply === undefined) {
    ui.info(t('feedback.noReply'))
    return
  }
  const listed = await feedbackCall(ui, failed, () => ctx.remote.messageFeedback.list({ sessionId }))
  if (listed === undefined) return
  const current = listed.value?.items.find(item => item.messageId === reply.messageId)
  const rating = await ui.pick(reply.preview, ratingItems(current?.rating))
  if (rating === undefined) return
  if (rating.value === 'remove') {
    // The list offers Remove only when a rating exists.
    const { version } = current as MessageFeedbackItemPort
    const removed = await feedbackCall(ui, failed, () => ctx.remote.messageFeedback.delete({
      sessionId, messageId: reply.messageId, ifVersion: version,
    }))
    if (removed !== undefined) ui.info(t('feedback.removed'))
    return
  }
  const note = await ui.ask(t('feedback.notePrompt'), { hint: t('feedback.noteHint') })
  if (note === undefined) return
  const saved = await feedbackCall(ui, failed, () => ctx.remote.messageFeedback.put({
    sessionId,
    messageId: reply.messageId,
    rating: rating.value as Rating,
    ...note === '' ? {} : { note },
    ifVersion: current?.version ?? null,
  }))
  if (saved !== undefined) ui.info(t('feedback.rated'))
}
