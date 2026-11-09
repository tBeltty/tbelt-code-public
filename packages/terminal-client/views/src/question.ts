/**
 * The agent's questions: `ask_user_question` batches and plan reviews, answered
 * one at a time in place of the composer. The state and reducer are pure and
 * reuse the picker and the one-line prompt, so a question reads and answers like
 * the other screens.
 * @module @deepseek-ai/dsh-terminal-views/question
 */
import { t } from './copy.ts'
import type { Style } from './ansi.ts'
import type { ComposerFrame } from './composer.ts'
import type { Key } from './keys.ts'
import { createMultiPicker, createPicker, reducePicker, renderPicker } from './picker.ts'
import type { PickerItem, PickerState } from './picker.ts'
import { createPrompt, reducePrompt, renderPrompt } from './prompt.ts'
import type { PromptState } from './prompt.ts'
import { sanitizeOutput } from './tool-lines.ts'

/** One choice the agent offers. */
export interface QuestionOptionFacts {
  readonly label: string
  readonly description?: string | undefined
}

/** One question of a batch, as the Host forwards it. */
export interface QuestionFacts {
  /** Id the answer echoes. */
  readonly id: string
  readonly question: string
  /** Supporting text, such as the plan under review. */
  readonly detail?: string | undefined
  readonly header?: string | undefined
  readonly options?: readonly QuestionOptionFacts[] | undefined
  /** Whether several options may be chosen. */
  readonly multiSelect?: boolean | undefined
  /** `plan-review` marks a plan awaiting a decision. */
  readonly intent?: { readonly kind: 'plan-review' } | undefined
}

/** The answer to one question, in the shape the Host reads. */
export interface QuestionAnswerFacts {
  readonly id: string
  /** Labels of the options chosen. */
  readonly selected: readonly string[]
  /** Text the person typed instead of, or beside, the options. */
  readonly custom?: string | undefined
}

/** What the person is doing in the current question. */
type QuestionStep =
  | { readonly kind: 'pick'; readonly state: PickerState }
  | { readonly kind: 'type'; readonly state: PromptState; readonly selected: readonly string[] }

/** A batch of questions in progress. */
export interface QuestionFlow {
  readonly questions: readonly QuestionFacts[]
  /** Index of the question on screen. */
  readonly index: number
  /** Answers to the questions before it. */
  readonly answers: readonly QuestionAnswerFacts[]
  readonly step: QuestionStep
}

/** What the caller does besides redrawing. */
export type QuestionEffect =
  /** A question was answered; `done` is true after the last one, and the returned flow then holds every answer. */
  | { readonly type: 'answered'; readonly answer: QuestionAnswerFacts; readonly done: boolean }
  | { readonly type: 'cancel' }

/** Result of applying one key. */
export interface QuestionStepResult {
  readonly flow: QuestionFlow
  readonly effect?: QuestionEffect
}

/** Value of the row that lets the person type an answer. */
export const QUESTION_OTHER = '\u0000other'

/** The picker or prompt for the question at `index`. */
function stepFor(question: QuestionFacts): QuestionStep {
  const options = question.options ?? []
  if (options.length === 0) return { kind: 'type', state: typedAnswer(question), selected: [] }
  const items: PickerItem[] = [
    ...options.map(option => ({ value: option.label, label: option.label, detail: option.description })),
    { value: QUESTION_OTHER, label: t('question.other') },
  ]
  const title = question.question
  return {
    kind: 'pick',
    state: question.multiSelect === true
      ? createMultiPicker(title, items, { doneLabel: count => t('picker.done', { count }) })
      : createPicker(title, items),
  }
}

/** The one-line prompt for a typed answer. */
function typedAnswer(question: QuestionFacts): PromptState {
  return createPrompt(question.question, { hint: t('question.typeHint') })
}

/**
 * Open a batch.
 * @param questions - the questions in ask order; at least one.
 * @returns the flow on its first question.
 */
export function startQuestions(questions: readonly QuestionFacts[]): QuestionFlow {
  const [first] = questions as readonly [QuestionFacts, ...QuestionFacts[]]
  return { questions, index: 0, answers: [], step: stepFor(first) }
}

/** Record `answer` and move to the next question, if any. */
function advance(flow: QuestionFlow, answer: QuestionAnswerFacts): QuestionStepResult {
  const answers = [...flow.answers, answer]
  const question = flow.questions[flow.index + 1]
  const next = question === undefined ? undefined : { ...flow, index: flow.index + 1, answers, step: stepFor(question) }
  return { flow: next ?? { ...flow, answers }, effect: { type: 'answered', answer, done: next === undefined } }
}

/** The question on screen. */
function current(flow: QuestionFlow): QuestionFacts {
  return flow.questions[flow.index] as QuestionFacts
}

/**
 * Apply one key.
 * @param flow - the batch in progress.
 * @param key - a decoded key.
 * @returns the new flow and, when a question was answered or the person gave up, the effect. Escape in the list gives
 * up the whole batch; Escape in the typed answer goes back to the list when there is one.
 */
export function reduceQuestions(flow: QuestionFlow, key: Key): QuestionStepResult {
  const { step } = flow
  const question = current(flow)
  if (step.kind === 'type') {
    const result = reducePrompt(step.state, key)
    const { effect } = result
    if (effect === undefined) return { flow: { ...flow, step: { ...step, state: result.state } } }
    if (effect.type === 'cancel') {
      return (question.options?.length ?? 0) === 0
        ? { flow, effect: { type: 'cancel' } }
        : { flow: { ...flow, step: stepFor(question) } }
    }
    return effect.text === '' && step.selected.length === 0
      ? { flow: { ...flow, step: { ...step, state: result.state } } }
      : advance(flow, { id: question.id, selected: step.selected, custom: effect.text === '' ? undefined : effect.text })
  }
  const result = reducePicker(step.state, key)
  const { effect } = result
  if (effect === undefined) return { flow: { ...flow, step: { ...step, state: result.state } } }
  if (effect.type === 'cancel') return { flow, effect: { type: 'cancel' } }
  if (effect.type === 'select') {
    if (effect.item.value !== QUESTION_OTHER) return advance(flow, { id: question.id, selected: [effect.item.value] })
    return { flow: { ...flow, step: { kind: 'type', state: typedAnswer(question), selected: [] } } }
  }
  const chosen = effect.values.filter(value => value !== QUESTION_OTHER)
  if (effect.values.includes(QUESTION_OTHER)) {
    return { flow: { ...flow, step: { kind: 'type', state: typedAnswer(question), selected: chosen } } }
  }
  return advance(flow, { id: question.id, selected: chosen })
}

/**
 * Draw the question in place of the composer.
 * @param style - text styles.
 * @param flow - the batch in progress.
 * @param columns - terminal width in cells.
 * @returns the frame of the list or the typed answer.
 */
export function renderQuestions(style: Style, flow: QuestionFlow, columns: number): ComposerFrame {
  const { step } = flow
  return step.kind === 'pick' ? renderPicker(style, step.state, columns) : renderPrompt(style, step.state, columns)
}

/**
 * The text printed above the composer when a question opens: its heading, and the supporting text such as a plan.
 * @param style - text styles.
 * @param flow - the batch with the question on screen.
 * @returns lines without trailing newlines.
 */
export function questionLines(style: Style, flow: QuestionFlow): string[] {
  const question = current(flow)
  const position = flow.questions.length > 1 ? ` (${t('question.position', { index: flow.index + 1, total: flow.questions.length })})` : ''
  const heading = question.header === undefined || question.header === '' ? t('question.heading') : question.header
  const lines = [style.yellow(`? ${sanitizeOutput(heading)}${position}`)]
  if (question.detail !== undefined && question.detail.trim() !== '') {
    lines.push('', ...question.detail.split('\n').map(line => `  ${sanitizeOutput(line)}`), '')
  }
  return lines
}

/**
 * The line printed after a question is answered.
 * @param style - text styles.
 * @param answer - the answer given.
 * @returns the dim summary, without a trailing newline.
 */
export function answerLine(style: Style, answer: QuestionAnswerFacts): string {
  const parts = [...answer.selected, ...answer.custom === undefined ? [] : [answer.custom]]
  return style.dim(`  ${t('question.answered', { answer: sanitizeOutput(parts.join(', ')) })}`)
}
