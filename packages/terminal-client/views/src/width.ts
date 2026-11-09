/**
 * Display width of text in terminal cells, so a wrapped composer line occupies
 * the rows the terminal will actually draw.
 * @module @deepseek-ai/dsh-terminal-views/width
 */
import { eastAsianWidth } from 'get-east-asian-width'

const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
const EMOJI_PRESENTATION = /\p{Emoji_Presentation}|\uFE0F/u
const CONTROL = /^[\u0000-\u001F\u007F-\u009F]$/u

/**
 * Split text into user-perceived characters.
 * @param text - any text.
 * @returns the grapheme clusters in order.
 */
export function graphemes(text: string): string[] {
  return Array.from(segmenter.segment(text), part => part.segment)
}

/**
 * Cells one grapheme occupies.
 * @param grapheme - one grapheme cluster.
 * @returns 0 for control characters, 2 for wide and emoji clusters, otherwise 1.
 */
export function graphemeWidth(grapheme: string): number {
  if (CONTROL.test(grapheme)) return 0
  if (EMOJI_PRESENTATION.test(grapheme)) return 2
  // A grapheme is never empty, so its first code point exists.
  return eastAsianWidth(grapheme.codePointAt(0) as number)
}

/**
 * Cells a string occupies on one row.
 * @param text - text without escape sequences.
 * @returns the summed grapheme widths.
 */
export function textWidth(text: string): number {
  let width = 0
  for (const grapheme of graphemes(text)) width += graphemeWidth(grapheme)
  return width
}

/** One display row produced by {@link wrapRows}. */
export interface WrappedRow {
  /** The row's text. */
  readonly text: string
  /** Offset in the source string where the row starts. */
  readonly start: number
}

/**
 * Break one logical line into rows no wider than the terminal.
 * @param line - a line without newlines.
 * @param columns - terminal width in cells; values below 2 are treated as 2 so a wide character always fits.
 * @returns at least one row; an empty line yields one empty row.
 */
export function wrapRows(line: string, columns: number): WrappedRow[] {
  const limit = Math.max(2, columns)
  const rows: WrappedRow[] = []
  let text = ''
  let width = 0
  let start = 0
  let offset = 0
  for (const grapheme of graphemes(line)) {
    const cells = graphemeWidth(grapheme)
    if (width + cells > limit) {
      rows.push({ text, start })
      text = ''
      width = 0
      start = offset
    }
    text += grapheme
    width += cells
    offset += grapheme.length
  }
  rows.push({ text, start })
  return rows
}

/**
 * Cut text to a number of cells.
 * @param text - a line without newlines or escape sequences.
 * @param cells - the room available.
 * @returns the text, or its longest prefix that fits.
 */
export function truncate(text: string, cells: number): string {
  let width = 0
  let result = ''
  for (const grapheme of graphemes(text)) {
    width += graphemeWidth(grapheme)
    if (width > cells) break
    result += grapheme
  }
  return result
}
