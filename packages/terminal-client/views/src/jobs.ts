/**
 * Background jobs: the rows of the `/jobs` list and the output of one job.
 * @module @deepseek-ai/dsh-terminal-views/jobs
 */
import { t } from './copy.ts'
import type { Style } from './ansi.ts'
import type { PickerItem } from './picker.ts'
import { durationText, oneLine } from './lines.ts'
import { sanitizeOutput } from './tool-lines.ts'

/** One background job as the roster reports it. */
export interface JobRow {
  readonly id: string
  readonly kind: string
  readonly label: string
  readonly status: 'running' | 'stopping' | 'completed' | 'killed' | 'failed'
  readonly progress?: string | undefined
  readonly startedAt: number
  readonly finishedAt?: number | undefined
}

/** The live output of one observed job. */
export interface JobOutput {
  readonly text: string
  /** Whether output before `text` was dropped. */
  readonly gapBefore: boolean
  readonly streaming: boolean
  readonly error?: string | undefined
}

/**
 * Whether a job can still be stopped.
 * @param row - the job.
 * @returns true while the job runs.
 */
export function jobIsLive(row: JobRow): boolean {
  return row.status === 'running'
}

/**
 * Rows of the job list.
 * @param rows - the jobs the session can see.
 * @param now - the current time, in epoch milliseconds.
 * @returns one item per job, with its status, run time and progress as detail.
 */
export function jobItems(rows: readonly JobRow[], now: number): PickerItem[] {
  return rows.map((row) => {
    const elapsed = durationText((row.finishedAt ?? now) - row.startedAt)
    const progress = row.progress === undefined || row.progress === '' ? [] : [oneLine(row.progress, 40)]
    return {
      value: row.id,
      label: oneLine(row.label),
      detail: [t(`jobs.status.${row.status}`), elapsed, ...progress].join(' · '),
    }
  })
}

/**
 * The last lines of a job's output.
 * @param style - text styles.
 * @param output - the observed output, or undefined before the Host has opened it.
 * @param maxLines - most output lines shown; earlier lines are summarized.
 * @returns lines to print, without trailing newlines.
 */
export function jobOutputLines(style: Style, output: JobOutput | undefined, maxLines: number): string[] {
  if (output === undefined) return [style.dim(t('jobs.noOutput'))]
  const lines = sanitizeOutput(output.text).replace(/\n$/u, '').split('\n')
  const empty = output.text === ''
  const shown = lines.slice(-maxLines)
  return [
    ...output.gapBefore ? [style.dim(t('jobs.gap'))] : [],
    ...lines.length > shown.length ? [style.dim(t('jobs.earlier', { count: lines.length - shown.length }))] : [],
    ...empty ? [style.dim(t('jobs.noOutput'))] : shown,
    ...output.error === undefined ? [] : [style.red(t('jobs.observeFailed', { message: output.error }))],
    ...output.streaming ? [style.dim(t('jobs.streaming'))] : [],
  ]
}
