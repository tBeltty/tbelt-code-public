/**
 * Small text helpers the panel views share: one-line previews and elapsed or
 * remaining time.
 * @module @deepseek-ai/dsh-terminal-views/lines
 */
import { sanitizeOutput } from './tool-lines.ts'
import { truncate } from './width.ts'

/** Longest one-line preview, in cells. */
const PREVIEW_CELLS = 80

/**
 * Collapse text to one printable line.
 * @param text - text that may span lines or carry escape sequences.
 * @param cells - most cells the result may take.
 * @returns the text on one line, shortened with an ellipsis when it is longer than `cells`.
 */
export function oneLine(text: string, cells: number = PREVIEW_CELLS): string {
  return truncate(sanitizeOutput(text).replace(/\s+/gu, ' ').trim(), cells)
}

/**
 * Elapsed time in the two largest units.
 * @param ms - a duration in milliseconds; a negative value counts as zero.
 * @returns `850ms`, `5s`, `2m 03s` or `1h 02m`.
 */
export function durationText(ms: number): string {
  const total = Math.max(0, ms)
  if (total < 1000) return `${String(Math.round(total))}ms`
  const seconds = Math.floor(total / 1000)
  if (seconds < 60) return `${String(seconds)}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${String(minutes)}m ${String(seconds % 60).padStart(2, '0')}s`
  return `${String(Math.floor(minutes / 60))}h ${String(minutes % 60).padStart(2, '0')}m`
}

/**
 * Distance of a moment from now.
 * @param at - the moment, in epoch milliseconds.
 * @param now - the current time, in epoch milliseconds.
 * @returns `in 5m 00s` for a future moment and `5m 00s ago` for a past one.
 */
export function relativeText(at: number, now: number): string {
  const gap = at - now
  return gap >= 0 ? `in ${durationText(gap)}` : `${durationText(-gap)} ago`
}

/** A record, or undefined for anything else. */
export function recordOf(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}

/**
 * A string field of a value that arrived over a wire.
 * @param value - the value, expected to be a record.
 * @param key - the field name.
 * @returns the field, or undefined when the value is not a record or the field is not a string.
 */
export function stringField(value: unknown, key: string): string | undefined {
  const field = recordOf(value)?.[key]
  return typeof field === 'string' ? field : undefined
}

/**
 * A number field of a value that arrived over a wire.
 * @param value - the value, expected to be a record.
 * @param key - the field name.
 * @returns the field, or undefined when the value is not a record or the field is not a finite number.
 */
export function numberField(value: unknown, key: string): number | undefined {
  const field = recordOf(value)?.[key]
  return typeof field === 'number' && Number.isFinite(field) ? field : undefined
}
