import { useCallback, useMemo, useState } from 'react'
import clsx from 'clsx'
import { diffHunks, diffTotals, type DiffHunk } from '@deepseek-ai/dsh-presentation-tool-card'
import { FoldToggle } from './FoldToggle.tsx'
import { writeClipboard } from './clipboard.ts'
import { CodeToolbar, type CodeToolbarLabels } from './CodeToolbar.tsx'
import { languageForPath } from './code-highlighting.ts'
import cardCss from './CodeCard.module.css'
import css from './DiffBlock.module.css'

/** Output lines shown before the height cap collapses the middle. */
export const DEFAULT_DIFF_MAX_LINES = 16

export { diffTotals }
export type { DiffHunk }

export interface DiffBlockProps {
  /** One entry per applied hunk, in file order; empty renders nothing. */
  diffs: DiffHunk[]
  /** Localized chrome supplied by the owning render site. */
  labels: DiffBlockLabels
  /** Height cap in body lines before the middle collapses (default {@link DEFAULT_DIFF_MAX_LINES}). */
  maxLines?: number | undefined
  /** Extra class merged onto the wrapper (callers position; this component draws). */
  className?: string | undefined
}

/** Localized chrome for {@link DiffBlock}. */
export interface DiffBlockLabels extends CodeToolbarLabels {
  copy: string
  copied: string
  collapseAria: string
  expandAria: (hidden: number) => string
  collapse: string
  expand: (hidden: number) => string
}

/** A single rendered body line and its role, so the height cap slices a flat list. */
interface DiffRow {
  kind: 'path' | 'del' | 'add' | 'context' | 'gap'
  text: string
}

/** Local exhaustiveness helper — this package does not depend on `dsh-llm`. */
/* v8 ignore next 3 -- closed-union backstop; only reached if a row kind is forged */
function assertNever(value: never): never {
  throw new Error(`unreachable diff row kind: ${String(value)}`)
}

/** The dim class per row kind (path/gap chrome vs the diff's own +/- colors). */
const ROW_CLASS: Record<DiffRow['kind'], string | undefined> = {
  path: css.path,
  del: css.del,
  add: css.add,
  context: css.context,
  gap: css.gap,
}

/**
 * Flatten local patches into rows.
 * A path header opens each new file. A `⋯` gap separates consecutive same-file
 * fragments and distant patches within a fragment.
 * @param diffs - the hunks to render.
 * @returns the body rows.
 */
function buildRows(diffs: DiffHunk[]): DiffRow[] {
  const rows: DiffRow[] = []
  let prevPath: string | undefined
  for (const diff of diffs) {
    if (diff.path !== prevPath) rows.push({ kind: 'path', text: diff.path })
    else rows.push({ kind: 'gap', text: '⋯' })
    prevPath = diff.path
    for (const [index, hunk] of diffHunks(diff).entries()) {
      if (index > 0) rows.push({ kind: 'gap', text: '⋯' })
      for (const line of hunk.lines) {
        const kind = line.startsWith('-') ? 'del' : line.startsWith('+') ? 'add' : 'context'
        rows.push({ kind, text: line.slice(1) })
      }
    }
  }
  return rows
}

/**
 * Copy the full local diff, including folded rows: removed/added lines have
 * `- `/`+ ` prefixes, context has two spaces, and paths and gaps stay verbatim.
 * @param rows - the flattened body rows.
 * @returns the diff as plain text.
 */
function copyText(rows: DiffRow[]): string {
  return rows.map((row) => {
    switch (row.kind) {
      case 'del': return `- ${row.text}`
      case 'add': return `+ ${row.text}`
      case 'context': return `  ${row.text}`
      case 'path': return row.text
      case 'gap': return row.text
      /* v8 ignore next -- closed-union backstop; only reached if a row kind is forged */
      default: return assertNever(row.kind)
    }
  }).join('\n')
}

/**
 * Render a file mutation as an inline diff surface.
 * @param props - see {@link DiffBlockProps}.
 * @returns the diff block element.
 */
export function DiffBlock({ diffs, labels, maxLines = DEFAULT_DIFF_MAX_LINES, className }: DiffBlockProps) {
  const rows = useMemo(() => buildRows(diffs), [diffs])
  const [expanded, setExpanded] = useState(false)
  const [copied, setCopied] = useState(false)
  const [wrapped, setWrapped] = useState(false)
  const firstLanguage = diffs[0] === undefined ? undefined : languageForPath(diffs[0].path)
  const language = diffs.every(diff => languageForPath(diff.path) === firstLanguage) ? firstLanguage : undefined

  const onCopy = useCallback(() => {
    if (copied) return
    void writeClipboard(copyText(rows)).then((ok) => {
      if (!ok) return
      setCopied(true)
      window.setTimeout(() => { setCopied(false) }, 1000)
    })
  }, [copied, rows])

  const onToggle = useCallback(() => { setExpanded(value => !value) }, [])

  if (rows.length === 0) return null

  const hidden = rows.length - maxLines
  const capped = hidden > 0 && !expanded
  // Same split arithmetic as TerminalBlock and the TUI transcript's collapsed
  // card, so a body's head and tail slices agree across the front ends.
  const headLines = Math.ceil(maxLines / 2)
  const tailLines = maxLines - headLines
  const head = capped ? rows.slice(0, headLines) : rows
  const tail = capped ? rows.slice(rows.length - tailLines) : []

  return (
    <div className={clsx(cardCss.card, css.block, className)} data-diff="" data-code-wrap={wrapped}>
      <CodeToolbar lang={language} labels={labels} copyLabel={labels.copy} copiedLabel={labels.copied}
        copied={copied} wrapped={wrapped} onCopy={onCopy} onWrap={() => { setWrapped(value => !value) }} />
      <div className={css.body}>
        {head.map((row, index) => (
          <div key={index} className={clsx(css.line, ROW_CLASS[row.kind])}>{row.text}</div>
        ))}
        {hidden > 0 && (
          <FoldToggle
            className={css.expand}
            expanded={expanded}
            hidden={hidden}
            labels={labels}
            onToggle={onToggle}
          />
        )}
        {tail.map((row, index) => (
          <div key={index} className={clsx(css.line, ROW_CLASS[row.kind])}>{row.text}</div>
        ))}
      </div>
    </div>
  )
}
