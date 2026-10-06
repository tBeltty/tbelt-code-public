/** Shared file comparison for the turn-tail hover preview and Sidebar review. */
import { Fragment, useMemo, useRef } from 'react'
import type { ReactNode, UIEvent } from 'react'
import { Button, languageForPath, useCodeHighlighter } from '@deepseek-ai/dsh-client-ui-primitives'
import type { CodeHighlighter, HighlightSpan } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { WorkspaceDiffHunk } from '@deepseek-ai/dsh-workspace-changes/types'
import type { ChangesDiff } from '../changes.ts'
import type { ChangesDiffState } from './changes-diff.ts'
import type { NS } from './locales.ts'
import { AddCommentButton, LineComments, type DiffCommenting } from './DiffComments.tsx'
import css from './FileDiff.module.css'

/** The line number cell; with commenting on, a new-side number carries the button that opens a comment. */
function NumberCell({ no, commenting, t }: {
  no: number | undefined
  commenting: DiffCommenting | undefined
} & PropsLocale<typeof NS>): ReactNode {
  if (commenting === undefined || no === undefined) return <span className={css.number}>{no ?? ''}</span>
  return <span className={`${css.number} ${css.commentable}`}>{no}<AddCommentButton commenting={commenting} line={no} t={t} /></span>
}

/** The comments of one new-side line, drawn under its row. */
function CommentsAfter({ no, commenting, ghost, t }: {
  no: number | undefined
  commenting: DiffCommenting | undefined
  ghost?: boolean
} & PropsLocale<typeof NS>): ReactNode {
  if (commenting === undefined || no === undefined) return null
  return <LineComments commenting={commenting} line={no} t={t} {...ghost === true ? { ghost } : {}} />
}

/** Maximum rendered lines per comparison. */
export const MAX_RENDERED_LINES = 5000

/** One drawn line of a hunk with its line numbers on each side. */
export interface DiffRow {
  kind: 'add' | 'del' | 'context'
  old: number | undefined
  new: number | undefined
  text: string
}

/** One side-by-side row: the old side, the new side, or both. */
export interface SplitRow {
  left?: { no: number; text: string; kind: 'del' | 'context' }
  right?: { no: number; text: string; kind: 'add' | 'context' }
}

interface HunkHighlights {
  old: ReadonlyMap<number, readonly HighlightSpan[]> | undefined
  new: ReadonlyMap<number, readonly HighlightSpan[]> | undefined
}

function highlightedSide(rows: readonly DiffRow[], side: 'old' | 'new', highlighter: CodeHighlighter): HunkHighlights['old'] {
  const source = rows.flatMap((row) => {
    const no = row[side]
    return no === undefined ? [] : [{ no, text: row.text }]
  })
  if (source.length === 0) return new Map()
  const highlighted = highlighter(source.map(line => line.text).join('\n'))
  if (highlighted === undefined) return undefined
  return new Map(source.map((line, index) => {
    // Shiki omits one terminal empty token row; retain an aligned empty run for that source line.
    return [line.no, highlighted[index] ?? []]
  }))
}

function hunkHighlights(hunk: WorkspaceDiffHunk, highlighter: CodeHighlighter): HunkHighlights {
  const rows = hunkRows(hunk)
  return { old: highlightedSide(rows, 'old', highlighter), new: highlightedSide(rows, 'new', highlighter) }
}

function DiffText({ text, spans }: { text: string; spans: readonly HighlightSpan[] | undefined }): ReactNode {
  return <span className={css.text} data-diff-code={spans === undefined ? undefined : ''}>
    {spans === undefined ? text : spans.map((span, index) => <span key={index} style={span.style}>{span.text}</span>)}
  </span>
}

/**
 * Number a hunk's lines: context lines count on both sides, deletions on the
 * old side, additions on the new side.
 * @param hunk - a served hunk.
 * @returns the rows in order.
 */
export function hunkRows(hunk: WorkspaceDiffHunk): DiffRow[] {
  let oldNo = hunk.oldStart
  let newNo = hunk.newStart
  return hunk.lines.map((line) => {
    const text = line.slice(1)
    switch (line[0]) {
      case '+': return { kind: 'add', old: undefined, new: newNo++, text }
      case '-': return { kind: 'del', old: oldNo++, new: undefined, text }
      default: return { kind: 'context', old: oldNo++, new: newNo++, text }
    }
  })
}

/**
 * Pair a hunk's lines for the side-by-side view: each run of deletions is
 * aligned with the run of additions that follows it, row by row, and context
 * lines sit on both sides.
 * @param hunk - a served hunk.
 * @returns the rows in order.
 */
export function splitRows(hunk: WorkspaceDiffHunk): SplitRow[] {
  const rows: SplitRow[] = []
  let dels: NonNullable<SplitRow['left']>[] = []
  let adds: NonNullable<SplitRow['right']>[] = []
  const flush = (): void => {
    for (let at = 0; at < Math.max(dels.length, adds.length); at += 1) {
      const left = dels[at]
      const right = adds[at]
      rows.push({ ...left === undefined ? {} : { left }, ...right === undefined ? {} : { right } })
    }
    dels = []
    adds = []
  }
  for (const row of hunkRows(hunk)) {
    if (row.kind === 'del') dels.push({ no: row.old as number, text: row.text, kind: 'del' })
    else if (row.kind === 'add') adds.push({ no: row.new as number, text: row.text, kind: 'add' })
    else {
      flush()
      rows.push({ left: { no: row.old as number, text: row.text, kind: 'context' }, right: { no: row.new as number, text: row.text, kind: 'context' } })
    }
  }
  flush()
  return rows
}

/**
 * The hunks to draw, cut at {@link MAX_RENDERED_LINES} lines in total.
 * @param hunks - served hunks.
 * @returns the hunks with the last one shortened as needed, and whether anything was cut.
 */
export function renderedHunks(hunks: readonly WorkspaceDiffHunk[]): { hunks: WorkspaceDiffHunk[]; truncated: boolean } {
  let budget = MAX_RENDERED_LINES
  const kept: WorkspaceDiffHunk[] = []
  for (const hunk of hunks) {
    if (budget === 0) return { hunks: kept, truncated: true }
    kept.push(hunk.lines.length <= budget ? hunk : { ...hunk, lines: hunk.lines.slice(0, budget) })
    budget -= Math.min(budget, hunk.lines.length)
  }
  return { hunks: kept, truncated: hunks.some((hunk, at) => kept[at] !== hunk) }
}

/** The one-line fact about a text comparison worth stating above its hunks, if any. */
function noteOf(diff: Extract<ChangesDiff, { kind: 'text' }>): 'diff.created' | 'diff.deleted' | 'diff.unchanged' | undefined {
  if (!diff.before) return 'diff.created'
  if (!diff.after) return 'diff.deleted'
  if (diff.hunks.length === 0) return 'diff.unchanged'
  return undefined
}

/**
 * Render a file comparison with the same states and highlighting in previews and review tabs.
 * Addition-only and deletion-only comparisons use one column without changing the requested layout.
 * @param props - comparison state, layout choices, retry action, optional line comments, and localized copy.
 * @returns the comparison or its loading, unavailable, or error state.
 */
export function FileDiff({ state, split, wrap, retry, commenting, t }: {
  state: ChangesDiffState | undefined
  split: boolean
  wrap: boolean
  retry: () => void
  /** Line comments on the modified side; absent in read-only previews. */
  commenting?: DiffCommenting | undefined
} & PropsLocale<typeof NS>): ReactNode {
  if (state === undefined || state === 'loading') return <p className={css.status} role="status">{t('diff.loading')}</p>
  if (state === 'missing') return <p className={css.status}>{t('diff.missing')}</p>
  if (state === 'error') {
    return <div className={css.status}><span>{t('diff.error')}</span><Button size="sm" onClick={retry}>{t('presented.retry')}</Button></div>
  }
  if (state.kind === 'binary') return <p className={css.status}>{t('diff.binary')}</p>
  if (state.kind === 'oversized') return <p className={css.status}>{t('diff.oversized')}</p>
  const hasAdditions = state.hunks.some(hunk => hunk.lines.some(line => line.startsWith('+')))
  const hasDeletions = state.hunks.some(hunk => hunk.lines.some(line => line.startsWith('-')))
  const oneSided = hasAdditions !== hasDeletions
  return <TextDiff diff={state} split={split && !oneSided} wrap={wrap} commenting={commenting} t={t} />
}

/** The kind a paired row carries: a deletion or addition on either side, otherwise context. */
function splitRowKind(row: SplitRow): DiffRow['kind'] {
  return row.left?.kind === 'del' ? 'del' : row.right?.kind === 'add' ? 'add' : 'context'
}

function hunkHeader(hunk: WorkspaceDiffHunk): string {
  return `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`
}

/**
 * The side-by-side view without wrapping: two columns that clip their long
 * lines and scroll together on both axes, so a long line on one side never
 * runs under the other and both sides show the same rows and columns of text.
 * Every line is one fixed-height row, which keeps the sides aligned.
 * The columns suppress elastic overscroll while retaining native in-range scrolling.
 * A comment under a new-side line is drawn in the right column and as a hidden copy in the left, so both keep the same rows.
 */
function SplitColumns({ hunks, highlights, commenting, t }: {
  hunks: readonly WorkspaceDiffHunk[]
  highlights: readonly HunkHighlights[]
  commenting: DiffCommenting | undefined
} & PropsLocale<typeof NS>): ReactNode {
  const paired = useMemo(() => hunks.map(hunk => ({ header: hunkHeader(hunk), rows: splitRows(hunk) })), [hunks])
  const columns = useRef<Record<'left' | 'right', HTMLDivElement | null>>({ left: null, right: null })
  const offsets = useRef({ left: { scrollLeft: 0, scrollTop: 0 }, right: { scrollLeft: 0, scrollTop: 0 } })
  const follow = (side: 'left' | 'right') => (event: UIEvent<HTMLDivElement>): void => {
    const peer = side === 'left' ? 'right' : 'left'
    const other = columns.current[peer]
    /* v8 ignore next -- Both column refs are attached before browser scroll events can run. */
    if (other === null) return
    for (const axis of ['scrollLeft', 'scrollTop'] as const) {
      const value = event.currentTarget[axis]
      if (offsets.current[side][axis] === value) continue
      offsets.current[side][axis] = value
      other[axis] = value
      // Record the browser-clamped offset so its scroll event cannot pull the source back.
      offsets.current[peer][axis] = other[axis]
    }
  }
  return (
    <div className={css.columns}>
      {(['left', 'right'] as const).map(side => (
        <div key={side} className={css.column} data-diff-side={side}
          ref={(element) => { columns.current[side] = element }} onScroll={follow(side)}>
          {paired.map((hunk, position) => (
            <section key={position} className={css.hunk}>
              <div className={css.hunkHeader} data-diff-hunk-header>{hunk.header}</div>
              {hunk.rows.map((row, at) => {
                const cell = row[side]
                const spans = cell === undefined ? undefined : highlights[position]?.[side === 'left' ? 'old' : 'new']?.get(cell.no)
                return (
                  <Fragment key={at}>
                    <div className={`${css.sideLine} ${cell === undefined ? css.empty : css[cell.kind]}`} data-diff-line={splitRowKind(row)}>
                      <NumberCell no={cell?.no} commenting={side === 'right' ? commenting : undefined} t={t} />
                      <DiffText text={cell?.text ?? ''} spans={spans} />
                    </div>
                    <CommentsAfter no={row.right?.no} commenting={commenting} ghost={side === 'left'} t={t} />
                  </Fragment>
                )
              })}
            </section>
          ))}
        </div>
      ))}
    </div>
  )
}

/** The hunks of a text comparison with their line numbers, unified or side by side. */
function TextDiff({ diff, split, wrap, commenting, t }: {
  diff: Extract<ChangesDiff, { kind: 'text' }>
  split: boolean
  wrap: boolean
  commenting: DiffCommenting | undefined
} & PropsLocale<typeof NS>): ReactNode {
  const note = noteOf(diff)
  const { hunks, truncated } = useMemo(() => renderedHunks(diff.hunks), [diff.hunks])
  const highlighter = useCodeHighlighter(languageForPath(diff.path))
  const highlights = useMemo(() => hunks.map(hunk => hunkHighlights(hunk, highlighter)), [hunks, highlighter])
  return (
    <div className={css.body} data-review-view={split ? 'split' : 'unified'} data-review-wrap={wrap || undefined}>
      {note !== undefined && <p className={css.note} data-diff-note={hunks.length === 0 ? 'empty' : 'metadata'}>{t(note)}</p>}
      {diff.coarse && <p className={css.note} data-diff-coarse>{t('diff.coarse')}</p>}
      {truncated && <p className={css.note} data-diff-truncated>{t('diff.truncated', { count: String(MAX_RENDERED_LINES) })}</p>}
      {split && !wrap ? <SplitColumns {...{ hunks, highlights, commenting, t }} /> : hunks.map((hunk, position) => {
        const highlighted = highlights[position]
        return <section key={position} className={css.hunk}>
          <div className={css.hunkHeader} data-diff-hunk-header>{hunkHeader(hunk)}</div>
          {split ? splitRows(hunk).map((row, at) => (
            <Fragment key={at}>
              <div className={css.splitLine} data-diff-line={splitRowKind(row)}>
                <span className={`${css.cell} ${row.left === undefined ? css.empty : css[row.left.kind]}`}>
                  <span className={css.number}>{row.left?.no ?? ''}</span>
                  <DiffText text={row.left?.text ?? ''} spans={row.left === undefined ? undefined : highlighted?.old?.get(row.left.no)} />
                </span>
                <span className={`${css.cell} ${row.right === undefined ? css.empty : css[row.right.kind]}`}>
                  <NumberCell no={row.right?.no} commenting={commenting} t={t} />
                  <DiffText text={row.right?.text ?? ''} spans={row.right === undefined ? undefined : highlighted?.new?.get(row.right.no)} />
                </span>
              </div>
              <CommentsAfter no={row.right?.no} commenting={commenting} t={t} />
            </Fragment>
          )) : hunkRows(hunk).map((row, at) => (
            <Fragment key={at}>
              <div className={`${css.line} ${css[row.kind]}`} data-diff-line={row.kind}>
                <span className={css.number}>{row.old ?? ''}</span>
                <NumberCell no={row.new} commenting={commenting} t={t} />
                <span className={css.sign}>{row.kind === 'add' ? '+' : row.kind === 'del' ? '-' : ' '}</span>
                <DiffText text={row.text} spans={row.kind === 'add' ? highlighted?.new?.get(row.new as number) : highlighted?.old?.get(row.old as number)} />
              </div>
              <CommentsAfter no={row.new} commenting={commenting} t={t} />
            </Fragment>
          ))}
        </section>
      })}
    </div>
  )
}
