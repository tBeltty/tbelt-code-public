/**
 * Tool lines: the call line printed when a tool starts and the outcome lines
 * printed when it settles, built from the shared row and card presenters.
 * @module @deepseek-ai/dsh-terminal-views/tool-lines
 */
import {
  toolRowModel,
  type PreparingToolCall,
  type StartedToolCall,
  type ToolResultNode,
} from '@deepseek-ai/dsh-presentation-tool-call'
import {
  diffCardModel,
  diffSummary,
  diffSummaryParts,
  readCardModel,
  searchCardModel,
  terminalCardModel,
  terminalFailed,
} from '@deepseek-ai/dsh-presentation-tool-card'
import { copyKey, t } from './copy.ts'
import type { Style } from './ansi.ts'
import { stripAnsi } from './ansi.ts'
import { truncate } from './width.ts'

/** What the tool views need to know about the session and the terminal. */
export interface ToolViewContext {
  readonly style: Style
  /** Session working directory; paths inside it display relative. */
  readonly cwd?: string | undefined
  /** Account home directory; a leftover home path displays as `~`. */
  readonly home?: string | undefined
  /** Terminal width in cells. */
  readonly columns: number
  /** Most output lines shown for one result. */
  readonly maxOutputLines: number
}

const RESULT_LEAD = '  ⎿ '
const RESULT_INDENT = '    '

/** Output may hold cursor movement and other control bytes that would corrupt the screen; keep visible text only. */
export function sanitizeOutput(text: string): string {
  return stripAnsi(text)
    .split('\n')
    .map(line => line.slice(line.lastIndexOf('\r') + 1).replace(/[\u0000-\u0008\u000B-\u001F\u007F]/gu, ''))
    .join('\n')
}

/**
 * The line shown when a tool starts.
 * @param ctx - session and terminal facts.
 * @param block - the call that was dispatched or is still being prepared.
 * @returns one line without a trailing newline.
 */
export function toolCallLine(ctx: ToolViewContext, block: PreparingToolCall | StartedToolCall): string {
  const row = toolRowModel(block.name, block, ctx.cwd, ctx.home)
  const title = ctx.style.bold(t(copyKey(row.titleKey)))
  const room = Math.max(8, ctx.columns - 6 - title.length)
  const summary = row.summary === '' ? '' : `  ${ctx.style.dim(truncate(sanitizeOutput(row.summary), room))}`
  return `${ctx.style.cyan('●')} ${title}${summary}`
}

/** Lines of output shown under a call: the end of the output, since errors and results come last. */
function outputLines(ctx: ToolViewContext, output: string): string[] {
  const lines = sanitizeOutput(output).replace(/\n+$/u, '').split('\n')
  const shown = lines.length > ctx.maxOutputLines ? lines.slice(-ctx.maxOutputLines) : lines
  const room = Math.max(8, ctx.columns - RESULT_INDENT.length - 1)
  const result = shown.map(line => ctx.style.dim(truncate(line, room)))
  if (lines.length > shown.length) {
    result.unshift(ctx.style.dim(t('tool.moreLines', { count: lines.length - shown.length })))
  }
  return result
}

/** Put the lead on the first line and the indent on the rest. */
function lead(lines: readonly string[]): string[] {
  return lines.map((line, index) => (index === 0 ? RESULT_LEAD : RESULT_INDENT) + line)
}

/**
 * The lines shown when a tool settles.
 * @param ctx - session and terminal facts.
 * @param node - the settled call and its result.
 * @returns lines without trailing newlines; empty when the call needs no outcome line.
 */
export function toolResultLines(ctx: ToolViewContext, node: ToolResultNode): string[] {
  const { style } = ctx
  const row = toolRowModel(node.call?.name ?? '', node, ctx.cwd, ctx.home)
  if (row.autoReviewDenial !== null) {
    const { reason } = row.autoReviewDenial
    return lead([style.red(reason === null
      ? t('tool.autoReviewNoReason')
      : t('tool.autoReview', { reason: sanitizeOutput(reason) }))])
  }
  if (row.state === 'stopped') return lead([style.dim(t('tool.stopped'))])
  if (row.state === 'error') {
    return lead([style.red(truncate(sanitizeOutput(row.errorSummary ?? ''), Math.max(8, ctx.columns - 6)))])
  }

  const shell = terminalCardModel(node, ctx.cwd)
  if (shell !== null) {
    const { exitCode, signal, output } = shell.card
    const body = output === undefined || output.trim() === '' ? [] : outputLines(ctx, output)
    const status = terminalFailed(shell)
      ? [style.red(signal === undefined ? t('tool.exit', { code: String(exitCode) }) : t('tool.signal', { signal }))]
      : []
    const lines = [...body, ...status]
    return lead(lines.length === 0 ? [style.dim(t('tool.done'))] : lines)
  }

  const diff = diffCardModel(node)
  if (diff !== null) {
    const parts = diffSummaryParts(diffSummary(diff.card.diffs))
    const text = parts.map(part => (part.tone === 'added' ? style.green(part.text) : style.red(part.text))).join(' ')
    return lead([text === '' ? style.dim(t('tool.done')) : text])
  }

  const read = readCardModel(node, ctx.cwd, ctx.home)
  if (read !== null) {
    return lead([style.dim(t('tool.readLines', { count: read.lines.length, total: read.totalLines }))])
  }

  const search = searchCardModel(node)
  if (search !== null) {
    const { card } = search
    const summary = card.kind === 'matches'
      ? t('tool.matches', { count: card.total, files: card.files.length })
      : t('tool.paths', { count: card.total })
    return lead([style.dim(summary)])
  }

  return row.output === null ? [] : lead(outputLines(ctx, row.output).slice(0, ctx.maxOutputLines))
}
