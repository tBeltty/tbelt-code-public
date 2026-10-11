/**
 * Rejections of the question waterfall that the terminal produces.
 * @module @deepseek-ai/dsh-terminal-runtime/question-error
 */

/** Codes the Host reads from a rejected question; `name` and `code` survive the Remote Event wire. */
export type QuestionRejectionCode = 'ASK_CANCELLED' | 'ASK_ABORTED' | 'ASK_TIMED_OUT'

const MESSAGES: Record<QuestionRejectionCode, string> = {
  ASK_CANCELLED: 'the user cancelled ask_user_question',
  ASK_ABORTED: 'ask_user_question was aborted before the user answered',
  ASK_TIMED_OUT: 'ask_user_question timed out before the user answered',
}

/**
 * Build a rejection of the question waterfall.
 * @param code - the reason the Host reads.
 * @returns an error named `UserQuestionError` that carries the code.
 */
export function questionError(code: QuestionRejectionCode): Error {
  const error = new Error(MESSAGES[code]) as Error & { code: string }
  error.name = 'UserQuestionError'
  error.code = code
  return error
}
