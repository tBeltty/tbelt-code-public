/**
 * The message composer: a multi-line editor state, the reducer that applies
 * decoded keys to it, and the frame that draws it.
 * @module @deepseek-ai/dsh-terminal-views/composer
 */
import type { Key, KeyName } from './keys.ts'
import { graphemes, textWidth, truncate, wrapRows } from './width.ts'

/** Editor contents, cursor and message history. */
export interface ComposerState {
  /** Text being written; lines are separated by `\n`. */
  readonly text: string
  /** Cursor position as an offset into {@link text}, always on a grapheme boundary. */
  readonly cursor: number
  /** Sent messages, oldest first. */
  readonly history: readonly string[]
  /** Index into {@link history} while browsing, or undefined while writing. */
  readonly browsing: number | undefined
  /** What was being written when browsing began, restored when browsing ends. */
  readonly draft: string
}

/** What the caller must do besides redrawing. */
export type ComposerEffect =
  | { readonly type: 'submit'; readonly text: string }
  | { readonly type: 'interrupt' }
  | { readonly type: 'eof' }
  | { readonly type: 'clear-screen' }

/** Result of applying one key. */
export interface ComposerStep {
  readonly state: ComposerState
  readonly effect?: ComposerEffect
}

/** The empty composer. */
export const EMPTY_COMPOSER: ComposerState = {
  text: '', cursor: 0, history: [], browsing: undefined, draft: '',
}

/**
 * Start a composer with earlier messages.
 * @param history - sent messages, oldest first.
 * @returns an empty composer that can browse them.
 */
export function composerWithHistory(history: readonly string[]): ComposerState {
  return { ...EMPTY_COMPOSER, history }
}

const WORD = /[\p{L}\p{N}_]/u

/** Offset of the grapheme boundary before `cursor`. */
function previousBoundary(text: string, cursor: number): number {
  let boundary = 0
  for (const grapheme of graphemes(text)) {
    if (boundary + grapheme.length >= cursor) return boundary
    boundary += grapheme.length
  }
  return boundary
}

/** Offset of the grapheme boundary after `cursor`. */
function nextBoundary(text: string, cursor: number): number {
  let boundary = 0
  for (const grapheme of graphemes(text)) {
    boundary += grapheme.length
    if (boundary > cursor) return boundary
  }
  return text.length
}

/** Start of the word before `cursor`, skipping spaces first. */
function wordStart(text: string, cursor: number): number {
  let index = cursor
  while (index > 0 && !WORD.test(text.charAt(index - 1))) index--
  while (index > 0 && WORD.test(text.charAt(index - 1))) index--
  return index
}

/** End of the word after `cursor`, skipping spaces first. */
function wordEnd(text: string, cursor: number): number {
  let index = cursor
  while (index < text.length && !WORD.test(text.charAt(index))) index++
  while (index < text.length && WORD.test(text.charAt(index))) index++
  return index
}

/** Start offset of the line that holds `cursor`. */
function lineStart(text: string, cursor: number): number {
  return text.lastIndexOf('\n', cursor - 1) + 1
}

/** End offset (before the newline) of the line that holds `cursor`. */
function lineEnd(text: string, cursor: number): number {
  const index = text.indexOf('\n', cursor)
  return index === -1 ? text.length : index
}

function edit(state: ComposerState, text: string, cursor: number): ComposerState {
  return { ...state, text, cursor, browsing: undefined, draft: '' }
}

function insert(state: ComposerState, inserted: string): ComposerState {
  const text = state.text.slice(0, state.cursor) + inserted + state.text.slice(state.cursor)
  return edit(state, text, state.cursor + inserted.length)
}

function move(state: ComposerState, cursor: number): ComposerState {
  return { ...state, cursor }
}

/** Move up or down one logical line, keeping the column when the target line is long enough. */
function moveLine(state: ComposerState, direction: -1 | 1): ComposerState | undefined {
  const start = lineStart(state.text, state.cursor)
  const column = state.cursor - start
  if (direction === -1) {
    if (start === 0) return undefined
    const previousStart = lineStart(state.text, start - 1)
    return move(state, previousStart + Math.min(column, start - 1 - previousStart))
  }
  const end = lineEnd(state.text, state.cursor)
  if (end === state.text.length) return undefined
  const nextStart = end + 1
  return move(state, nextStart + Math.min(column, lineEnd(state.text, nextStart) - nextStart))
}

/** Step through sent messages when the cursor cannot move further inside the text. */
function browse(state: ComposerState, direction: -1 | 1): ComposerState {
  const { history } = state
  if (direction === -1) {
    if (history.length === 0 || state.browsing === 0) return state
    const index = state.browsing === undefined ? history.length - 1 : state.browsing - 1
    const text = history[index] as string
    return {
      ...state, text, cursor: text.length, browsing: index,
      draft: state.browsing === undefined ? state.text : state.draft,
    }
  }
  if (state.browsing === undefined) return state
  const index = state.browsing + 1
  if (index >= history.length) {
    return { ...state, text: state.draft, cursor: state.draft.length, browsing: undefined, draft: '' }
  }
  const text = history[index] as string
  return { ...state, text, cursor: text.length, browsing: index }
}

/** A trailing backslash before Enter inserts a line break, for terminals that cannot send Shift+Enter. */
function enter(state: ComposerState): ComposerStep {
  const before = state.text.slice(0, state.cursor)
  if (before.endsWith('\\')) {
    const text = before.slice(0, -1) + '\n' + state.text.slice(state.cursor)
    return { state: edit(state, text, state.cursor) }
  }
  const submitted = state.text.trim()
  if (submitted === '') return { state }
  const history = state.history.at(-1) === submitted ? state.history : [...state.history, submitted]
  return {
    state: { ...EMPTY_COMPOSER, history },
    effect: { type: 'submit', text: submitted },
  }
}

function applyKey(state: ComposerState, name: KeyName): ComposerStep {
  const { text, cursor } = state
  switch (name) {
    case 'enter': return enter(state)
    case 'newline': return { state: insert(state, '\n') }
    case 'tab': return { state: insert(state, '  ') }
    case 'escape': return { state }
    case 'backspace': {
      const from = previousBoundary(text, cursor)
      return { state: edit(state, text.slice(0, from) + text.slice(cursor), from) }
    }
    case 'delete': {
      const to = nextBoundary(text, cursor)
      return { state: edit(state, text.slice(0, cursor) + text.slice(to), cursor) }
    }
    case 'left': return { state: move(state, previousBoundary(text, cursor)) }
    case 'right': return { state: move(state, nextBoundary(text, cursor)) }
    case 'word-left': return { state: move(state, wordStart(text, cursor)) }
    case 'word-right': return { state: move(state, wordEnd(text, cursor)) }
    case 'home': return { state: move(state, lineStart(text, cursor)) }
    case 'end': return { state: move(state, lineEnd(text, cursor)) }
    case 'up': return { state: moveLine(state, -1) ?? browse(state, -1) }
    case 'down': return { state: moveLine(state, 1) ?? browse(state, 1) }
    case 'kill-line': return { state: edit(state, text.slice(0, cursor) + text.slice(lineEnd(text, cursor)), cursor) }
    case 'kill-to-start': {
      const from = lineStart(text, cursor)
      return { state: edit(state, text.slice(0, from) + text.slice(cursor), from) }
    }
    case 'delete-word': {
      const from = wordStart(text, cursor)
      return { state: edit(state, text.slice(0, from) + text.slice(cursor), from) }
    }
    case 'clear-screen': return { state, effect: { type: 'clear-screen' } }
    case 'interrupt': return { state, effect: { type: 'interrupt' } }
    case 'eof': return text === '' ? { state, effect: { type: 'eof' } } : { state: applyKey(state, 'delete').state }
  }
}

/**
 * Apply one key to the composer.
 * @param state - the current editor.
 * @param key - a decoded key.
 * @returns the next editor and, when the key sends, interrupts or leaves, the effect the caller performs.
 */
export function reduceComposer(state: ComposerState, key: Key): ComposerStep {
  if (key.type === 'text') return { state: insert(state, key.text) }
  if (key.type === 'paste') return { state: insert(state, key.text) }
  return applyKey(state, key.name)
}

/** Pixels-free description of what the composer looks like. */
export interface ComposerFrame {
  /** Display rows, each no wider than the terminal. */
  readonly lines: readonly string[]
  /** Row and column of the cursor within {@link lines}. */
  readonly cursor: { readonly row: number; readonly column: number }
}

/** Options for {@link renderComposer}. */
export interface ComposerRenderOptions {
  /** Terminal width in cells. */
  readonly columns: number
  /** Text drawn before the first line. */
  readonly prompt: string
  /** Text shown dimmed while the composer is empty. */
  readonly placeholder: string
  /** Dims text, so the placeholder is distinct. */
  readonly dim: (text: string) => string
}

/**
 * Draw the composer.
 * @param state - the editor.
 * @param options - width, prompt and placeholder.
 * @returns the display rows and the cursor cell.
 */
export function renderComposer(state: ComposerState, options: ComposerRenderOptions): ComposerFrame {
  const indent = ' '.repeat(textWidth(options.prompt))
  const room = Math.max(2, options.columns - textWidth(options.prompt))
  const lines: string[] = []
  let cursorRow = 0
  let cursorColumn = 0
  let offset = 0
  const logical = state.text.split('\n')
  for (const [index, line] of logical.entries()) {
    const rows = wrapRows(line, room)
    for (const [rowIndex, row] of rows.entries()) {
      const lead = index === 0 && rowIndex === 0 ? options.prompt : indent
      const isPlaceholder = state.text === ''
      lines.push(lead + (isPlaceholder ? options.dim(truncate(options.placeholder, room)) : row.text))
      const rowStart = offset + row.start
      const rowEnd = rowStart + row.text.length
      const isLastRowOfLine = rowIndex === rows.length - 1
      if (state.cursor >= rowStart && (state.cursor < rowEnd || (isLastRowOfLine && state.cursor <= rowEnd))) {
        cursorRow = lines.length - 1
        cursorColumn = textWidth(lead) + textWidth(state.text.slice(rowStart, state.cursor))
      }
    }
    offset += line.length + 1
  }
  return { lines, cursor: { row: cursorRow, column: cursorColumn } }
}
