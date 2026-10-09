/**
 * A one-line question the person answers in place of the composer: an API key,
 * a path, a model id. The state and reducer are pure; the caller draws the
 * frame while the question is open.
 * @module @deepseek-ai/dsh-terminal-views/prompt
 */
import { t } from './copy.ts'
import type { Style } from './ansi.ts'
import { EMPTY_COMPOSER, reduceComposer, renderComposer } from './composer.ts'
import type { ComposerFrame, ComposerState } from './composer.ts'
import type { Key } from './keys.ts'
import { sanitizeOutput } from './tool-lines.ts'
import { truncate } from './width.ts'

/** An open question. */
export interface PromptState {
  /** What is being asked. */
  readonly label: string
  /** Dim line under the label, such as the current value or what an empty answer does. */
  readonly hint?: string | undefined
  /** Show typed characters as `*`, for keys. */
  readonly secret: boolean
  readonly input: ComposerState
}

/** What the caller does besides redrawing. */
export type PromptEffect =
  | { readonly type: 'submit'; readonly text: string }
  | { readonly type: 'cancel' }

/** Result of applying one key. */
export interface PromptStep {
  readonly state: PromptState
  readonly effect?: PromptEffect
}

/** Options of {@link createPrompt}. */
export interface PromptOptions {
  readonly hint?: string | undefined
  readonly secret?: boolean | undefined
  /** Text the answer starts with. */
  readonly initial?: string | undefined
}

/**
 * Open a question.
 * @param label - what is being asked.
 * @param options - hint, masking and the starting text.
 * @returns the initial state, with the cursor after the starting text.
 */
export function createPrompt(label: string, options: PromptOptions = {}): PromptState {
  const initial = (options.initial ?? '').replace(/[\r\n]+/gu, ' ')
  return {
    label,
    hint: options.hint,
    secret: options.secret === true,
    input: { ...EMPTY_COMPOSER, text: initial, cursor: initial.length },
  }
}

/** Keys that mean something only to a multi-line composer. */
const IGNORED = new Set(['up', 'down', 'tab', 'newline', 'clear-screen'])

/**
 * Apply one key.
 * @param state - the open question.
 * @param key - a decoded key.
 * @returns the new state and, when the person answered or left, the effect. Enter sends the text as typed, trimmed,
 * so an empty answer is possible; Escape, Ctrl+C and Ctrl+D on an empty line leave.
 */
export function reducePrompt(state: PromptState, key: Key): PromptStep {
  if (key.type === 'key') {
    if (key.name === 'enter') return { state, effect: { type: 'submit', text: state.input.text.trim() } }
    if (key.name === 'escape' || key.name === 'interrupt' || (key.name === 'eof' && state.input.text === '')) {
      return { state, effect: { type: 'cancel' } }
    }
    if (IGNORED.has(key.name)) return { state }
  }
  const single: Key = key.type === 'key' ? key : { type: key.type, text: key.text.replace(/[\r\n]+/gu, '') }
  return { state: { ...state, input: reduceComposer(state.input, single).state } }
}

/**
 * Draw the question in place of the composer.
 * @param style - text styles.
 * @param state - the open question.
 * @param columns - terminal width in cells.
 * @returns the frame, with the cursor in the answer line.
 */
export function renderPrompt(style: Style, state: PromptState, columns: number): ComposerFrame {
  const header = [
    style.bold(truncate(sanitizeOutput(state.label), columns)),
    ...state.hint === undefined ? [] : [style.dim(truncate(sanitizeOutput(state.hint), columns))],
  ]
  // One `*` per UTF-16 unit keeps the cursor offset of the real text.
  const shown = state.secret ? { ...state.input, text: '*'.repeat(state.input.text.length) } : state.input
  const answer = renderComposer(shown, { columns, prompt: '› ', placeholder: '', dim: style.dim })
  return {
    lines: [...header, ...answer.lines, style.dim(truncate(`  ${t('prompt.keys')}`, columns))],
    cursor: { row: answer.cursor.row + header.length, column: answer.cursor.column },
  }
}
