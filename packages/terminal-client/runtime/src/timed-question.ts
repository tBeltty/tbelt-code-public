/**
 * A question with a countdown. The terminal holds the Host's claim on the countdown while the person answers,
 * ends the question when its own clock reaches zero, and releases the claim only after the Host has settled.
 * @module @deepseek-ai/dsh-terminal-runtime/timed-question
 */
import { questionError } from './question-error.ts'
import type { QuestionAnswerPort, QuestionRequestPort, RemotePort } from './ports.ts'

/** What a timed question needs from the terminal. */
export interface TimedQuestionOptions {
  /** The Remote namespace that holds the claim. */
  readonly remote: Pick<RemotePort, 'userQuestions'>
  /** The session that owns the question. */
  readonly sessionId: string
  /** The tool call that waits. */
  readonly callId: string
  /** The forwarded questions. */
  readonly request: QuestionRequestPort
  /** Show the questions; the returned promise rejects with `ASK_ABORTED` when the signal in the request aborts. */
  readonly ask: (request: QuestionRequestPort, remainingMs: number) => Promise<QuestionAnswerPort>
  /** Hand the question to the next listener. */
  readonly next: () => Promise<QuestionAnswerPort>
}

/**
 * Ask a timed question and settle it by answer, countdown or Host.
 * @param options - the claim, the questions and how to show them.
 * @returns the answers given before the countdown ends, or what the next listener answers when the Host has no wait to claim.
 * @throws a `UserQuestionError` with code `ASK_TIMED_OUT` when the countdown ends first, which the Host reports to the
 * agent as a pending question, and one with code `ASK_ABORTED` when the Host closes the wait first.
 */
export async function answerTimedQuestion(options: TimedQuestionOptions): Promise<QuestionAnswerPort> {
  const { remote, sessionId, callId, request, ask, next } = options
  const lifetime = new AbortController()
  const signal = request.signal === undefined ? lifetime.signal : AbortSignal.any([lifetime.signal, request.signal])
  const claim = remote.userQuestions.attachWait(sessionId, callId, signal)
  const iterator = claim[Symbol.asyncIterator]()
  const release = (): void => {
    lifetime.abort()
    claim.dispose?.()
  }
  const opening = await iterator.next().catch((error: unknown) => {
    release()
    throw error
  })
  if (opening.done === true) {
    release()
    return next()
  }
  const { remainingMs } = opening.value
  // The Host closes the claim once it has accepted this outcome; releasing earlier would let its own
  // countdown settle the question while the answer is still in flight.
  const closed = iterator.next()
  void closed.then(release, release)
  const hostEnded = closed.then(() => { throw questionError('ASK_ABORTED') })
  hostEnded.catch((_ended: unknown) => { /* the race below reports it; after the race nobody is left to tell */ })
  const asking = new AbortController()
  const shownSignal = request.signal === undefined ? asking.signal : AbortSignal.any([asking.signal, request.signal])
  const shown = ask({ ...request, signal: shownSignal }, remainingMs)
  shown.catch((_withdrawn: unknown) => { /* the race below reports it; withdrawing the questions rejects them once more */ })
  const timer = Promise.withResolvers<never>()
  const countdown = setTimeout(() => { timer.reject(questionError('ASK_TIMED_OUT')) }, remainingMs)
  try {
    return await Promise.race([shown, timer.promise, hostEnded])
  } finally {
    clearTimeout(countdown)
    asking.abort()
  }
}
