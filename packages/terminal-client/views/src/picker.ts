/**
 * A filterable list the person chooses from: sessions, models and similar.
 * The state and reducer are pure; the caller draws the frame in place of the
 * composer while the picker is open.
 * @module @deepseek-ai/dsh-terminal-views/picker
 */
import { t } from './copy.ts'
import type { Style } from './ansi.ts'
import type { ComposerFrame } from './composer.ts'
import type { Key } from './keys.ts'
import { sanitizeOutput } from './tool-lines.ts'
import { textWidth, truncate } from './width.ts'

/** One choice. */
export interface PickerItem {
  /** What the caller receives back when the item is chosen. */
  readonly value: string
  readonly label: string
  /** Dim text after the label, also searched. */
  readonly detail?: string | undefined
  /** Whether this is the current choice; shown with a mark. */
  readonly current?: boolean | undefined
}

/** The ticks of a picker that lets the person choose several items. */
export interface PickerChecks {
  /** Values of the items ticked so far. */
  readonly checked: ReadonlySet<string>
  /** Text of the row that confirms the choice, given the number ticked. */
  readonly doneLabel: (count: number) => string
}

/** An open picker. */
export interface PickerState {
  readonly title: string
  readonly items: readonly PickerItem[]
  readonly query: string
  /** Index into {@link visibleItems}. */
  readonly index: number
  /** Present when Enter ticks an item instead of choosing it. */
  readonly checks?: PickerChecks
}

/** What the caller does besides redrawing. */
export type PickerEffect =
  | { readonly type: 'select'; readonly item: PickerItem }
  | { readonly type: 'confirm'; readonly values: readonly string[] }
  | { readonly type: 'cancel' }

/** Value of the row that confirms a multiple choice. */
export const PICKER_DONE = '\u0000done'

/** Result of applying one key. */
export interface PickerStep {
  readonly state: PickerState
  readonly effect?: PickerEffect
}

/** Most item rows drawn at once. */
export const PICKER_ROWS = 8

/**
 * Open a picker with the current item highlighted.
 * @param title - heading line.
 * @param items - choices in display order.
 * @returns the initial state.
 */
export function createPicker(title: string, items: readonly PickerItem[]): PickerState {
  const current = items.findIndex(item => item.current === true)
  return { title, items, query: '', index: Math.max(0, current) }
}

/**
 * Open a picker in which Enter ticks and unticks items.
 * @param title - heading line.
 * @param items - choices in display order.
 * @param options - the items ticked at the start and the text of the confirming row.
 * @returns the initial state, with the confirming row highlighted.
 */
export function createMultiPicker(
  title: string,
  items: readonly PickerItem[],
  options: { readonly checked?: readonly string[] | undefined; readonly doneLabel: (count: number) => string },
): PickerState {
  return { title, items, query: '', index: 0, checks: { checked: new Set(options.checked ?? []), doneLabel: options.doneLabel } }
}

/**
 * Items matching the query: every word must appear in the label or detail, ignoring case.
 * @param state - the picker.
 * @returns the matching items in their original order. A multiple choice lists its confirming row first, whatever
 * the query says.
 */
export function visibleItems(state: PickerState): readonly PickerItem[] {
  const words = state.query.toLowerCase().split(/\s+/u).filter(word => word !== '')
  const matching = words.length === 0
    ? state.items
    : state.items.filter((item) => {
      const haystack = `${item.label} ${item.detail ?? ''}`.toLowerCase()
      return words.every(word => haystack.includes(word))
    })
  if (state.checks === undefined) return matching
  return [{ value: PICKER_DONE, label: state.checks.doneLabel(state.checks.checked.size) }, ...matching]
}

/** The same picker with a new query and the highlight back on the first match; a multiple choice skips its confirming row. */
function withQuery(state: PickerState, query: string): PickerState {
  const next = { ...state, query, index: 0 }
  return state.checks !== undefined && visibleItems(next).length > 1 ? { ...next, index: 1 } : next
}

/**
 * Apply one key.
 * @param state - the open picker.
 * @param key - a decoded key.
 * @returns the new state and, when the person chose or left, the effect.
 */
export function reducePicker(state: PickerState, key: Key): PickerStep {
  const visible = visibleItems(state)
  if (key.type === 'text') return { state: withQuery(state, state.query + key.text.replace(/[\r\n]+/gu, ' ')) }
  if (key.type === 'paste') return { state: withQuery(state, state.query + key.text.replace(/\s+/gu, ' ')) }
  switch (key.name) {
    case 'up':
      return { state: { ...state, index: visible.length === 0 ? 0 : (state.index - 1 + visible.length) % visible.length } }
    case 'down':
    case 'tab':
      return { state: { ...state, index: visible.length === 0 ? 0 : (state.index + 1) % visible.length } }
    case 'backspace':
      return { state: withQuery(state, Array.from(state.query).slice(0, -1).join('')) }
    case 'kill-to-start':
      return { state: withQuery(state, '') }
    case 'enter':
    case 'newline': {
      const item = visible[state.index]
      if (item === undefined) return { state }
      if (state.checks === undefined) return { state, effect: { type: 'select', item } }
      if (item.value === PICKER_DONE) {
        const values = state.items.filter(row => state.checks?.checked.has(row.value) === true).map(row => row.value)
        return { state, effect: { type: 'confirm', values } }
      }
      const checked = new Set(state.checks.checked)
      if (!checked.delete(item.value)) checked.add(item.value)
      return { state: { ...state, checks: { ...state.checks, checked } } }
    }
    case 'escape':
    case 'interrupt':
    case 'eof':
      return { state, effect: { type: 'cancel' } }
    default:
      return { state }
  }
}

/**
 * Draw the picker in place of the composer.
 * @param style - text styles.
 * @param state - the open picker.
 * @param columns - terminal width in cells.
 * @returns the frame, with the cursor after the query.
 */
export function renderPicker(style: Style, state: PickerState, columns: number): ComposerFrame {
  const visible = visibleItems(state)
  const first = Math.max(0, Math.min(state.index - Math.floor(PICKER_ROWS / 2), visible.length - PICKER_ROWS))
  const lines = [style.bold(truncate(sanitizeOutput(state.title), columns))]
  const prompt = `› ${state.query}`
  lines.push(truncate(prompt, columns))
  if (visible.length === 0) lines.push(style.dim(`  ${t('picker.empty')}`))
  for (const [offset, item] of visible.slice(first, first + PICKER_ROWS).entries()) {
    const selected = first + offset === state.index
    const mark = state.checks === undefined || item.value === PICKER_DONE
      ? item.current === true ? '*' : ' '
      : state.checks.checked.has(item.value) ? 'x' : '·'
    const label = sanitizeOutput(item.label)
    const room = Math.max(0, columns - 4)
    const labelText = truncate(label, room)
    const detailRoom = room - textWidth(labelText)
    const detailText = item.detail === undefined || detailRoom < 4 ? '' : truncate(`  ${sanitizeOutput(item.detail)}`, detailRoom)
    lines.push(`${selected ? style.cyan('❯') : ' '}${mark} ${selected ? style.bold(labelText) : labelText}${style.dim(detailText)}`)
  }
  lines.push(style.dim(truncate(`  ${t(state.checks === undefined ? 'picker.keys' : 'picker.keysMulti')}`, columns)))
  return { lines, cursor: { row: 1, column: Math.min(textWidth(prompt), Math.max(0, columns - 1)) } }
}
