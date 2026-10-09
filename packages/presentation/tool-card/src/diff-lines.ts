/**
 * Line-level diff derivation shared by every client: the local hunks a diff card
 * draws and the subtle added/removed summary a collapsed row shows.
 * @module @deepseek-ai/dsh-presentation-tool-card/diff-lines
 */
import { structuredPatch } from 'diff'

/** One file change: its path and the text before and after the change. */
export interface DiffHunk {
  /** The changed file's path, shown verbatim as the hunk's header (the tool's model-facing path). */
  path: string
  /** Prior content including context, or `null` when no prior content is available. */
  oldText: string | null
  /** Content after the change, including any shared context. */
  newText: string
}

/** Added and removed line counts of a set of hunks. */
export interface DiffTotals {
  added: number
  removed: number
}

/** Added and removed line counts plus the number of distinct files changed. */
export interface DiffSummary extends DiffTotals {
  /** Distinct paths among the hunks. */
  files: number
}

/** One segment of the subtle summary: `+N` in the added tone, `-N` in the removed tone. */
export interface DiffSummaryPart {
  /** `added` draws green and `removed` red; a terminal without color keeps the sign. */
  tone: 'added' | 'removed'
  /** Signed count such as `+3` or `-1`. */
  text: string
}

/** Bound synchronous edit-graph search; one replacement consumes two edits. */
const MAX_DIFF_EDIT_LENGTH = 256

/**
 * Split a side's text into its content lines. Empty text is zero lines (a full
 * deletion's `newText` or a create's absent `oldText` side has none), and a
 * single trailing newline is a line terminator rather than an extra empty line.
 * An interior blank line (a genuine `\n\n`) survives.
 * @param text - the removed or added side's text.
 * @returns the content lines, without the terminating newline.
 */
function contentLines(text: string): string[] {
  if (text === '') return []
  const body = text.endsWith('\n') ? text.slice(0, -1) : text
  return body.split('\n')
}

/**
 * Derive exact local patches for one file change, or a whole-fragment
 * replacement when the edit-graph search exceeds its bound.
 * @param diff - the file change.
 * @returns patches whose lines start with `-`, `+` or a space.
 */
export function diffHunks(diff: DiffHunk): readonly { readonly lines: string[] }[] {
  const oldLines = contentLines(diff.oldText ?? '')
  const newLines = contentLines(diff.newText)
  const normalize = (lines: string[]): string => lines.map(line => `${line}\n`).join('')
  return structuredPatch('', '', normalize(oldLines), normalize(newLines),
    undefined, undefined, { context: 3, maxEditLength: MAX_DIFF_EDIT_LENGTH })?.hunks
    ?? [{ lines: [...oldLines.map(line => `-${line}`), ...newLines.map(line => `+${line}`)] }]
}

/**
 * Count displayed additions and deletions. Exact patches exclude shared context;
 * comparisons exceeding the edit limit count both complete fragments as replaced.
 * @param diffs - the hunks to count.
 * @returns the added and removed line counts.
 */
export function diffTotals(diffs: readonly DiffHunk[]): DiffTotals {
  let added = 0
  let removed = 0
  for (const diff of diffs) {
    for (const hunk of diffHunks(diff)) {
      for (const line of hunk.lines) {
        if (line.startsWith('+')) added++
        if (line.startsWith('-')) removed++
      }
    }
  }
  return { added, removed }
}

/**
 * Summarize a diff for the quiet one-line form: counts plus distinct files.
 * @param diffs - the hunks to summarize.
 * @returns line counts and the number of distinct files.
 */
export function diffSummary(diffs: readonly DiffHunk[]): DiffSummary {
  return { ...diffTotals(diffs), files: new Set(diffs.map(diff => diff.path)).size }
}

/**
 * Break a summary into the colored segments both clients draw: green `+N` for
 * added lines and red `-N` for removed lines. A zero count is omitted, and a
 * change with neither (identical text) yields no segment, so the row shows nothing.
 * @param summary - the counts to draw.
 * @returns zero, one or two segments, added first.
 */
export function diffSummaryParts(summary: DiffTotals): DiffSummaryPart[] {
  const parts: DiffSummaryPart[] = []
  if (summary.added > 0) parts.push({ tone: 'added', text: `+${String(summary.added)}` })
  if (summary.removed > 0) parts.push({ tone: 'removed', text: `-${String(summary.removed)}` })
  return parts
}
