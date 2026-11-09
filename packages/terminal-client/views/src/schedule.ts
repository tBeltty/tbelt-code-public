/**
 * Scheduled follow-ups: the rows of the `/schedule` list, their delivery
 * history and the parsing of a new timing.
 * @module @deepseek-ai/dsh-terminal-views/schedule
 */
import { t } from './copy.ts'
import type { Style } from './ansi.ts'
import type { PickerItem } from './picker.ts'
import { durationText, oneLine, relativeText } from './lines.ts'

/** One scheduled follow-up as the catalog reports it. */
export interface ScheduleRow {
  readonly id: string
  readonly kind: 'after' | 'at' | 'every' | 'daily' | 'weekly' | 'cron'
  readonly title: string
  readonly scheduledAt: string
  readonly sessionId: string
  readonly status: 'active' | 'inactive'
  readonly everySeconds?: number | undefined
  readonly time?: string | undefined
  readonly expression?: string | undefined
}

/** One delivery of a follow-up. */
export interface ScheduleDelivery {
  readonly scheduledAt: string
  readonly deliveredAt: string
  readonly prompt?: string | undefined
}

/** The ways a person can set a new timing. */
export type TimingKind = 'at' | 'every' | 'daily' | 'cron'

/** A new timing in the form the Host takes. */
export type TimingChange =
  | { readonly kind: 'at'; readonly at: string }
  | { readonly kind: 'every'; readonly every_seconds: number }
  | { readonly kind: 'daily'; readonly daily: { readonly time: string; readonly time_zone: string } }
  | { readonly kind: 'cron'; readonly cron: { readonly expression: string; readonly time_zone: string } }

/** A timing the person typed: the change, or what is wrong with it. */
export type TimingResult =
  | { readonly ok: true; readonly change: TimingChange }
  | { readonly ok: false; readonly problem: string }

/**
 * How often a follow-up runs, in words.
 * @param row - the follow-up.
 * @returns `once`, `every 5m 00s`, `daily 09:00`, `weekly 09:00` or `cron 0 9 * * *`.
 */
export function timingText(row: ScheduleRow): string {
  switch (row.kind) {
    case 'after':
    case 'at': return t('schedule.once')
    case 'every': return t('schedule.every', { duration: durationText((row.everySeconds ?? 0) * 1000) })
    case 'daily': return t('schedule.daily', { time: row.time ?? '' })
    case 'weekly': return t('schedule.weekly', { time: row.time ?? '' })
    case 'cron': return t('schedule.cron', { expression: row.expression ?? '' })
  }
}

/**
 * Rows of the follow-up list.
 * @param rows - the catalog, in any order.
 * @param now - the current time, in epoch milliseconds.
 * @returns one item per follow-up, soonest first, with timing, next run and status as detail.
 */
export function scheduleItems(rows: readonly ScheduleRow[], now: number): PickerItem[] {
  const dated = rows.map(row => ({ row, moment: Date.parse(row.scheduledAt) }))
  // A follow-up with no readable time sorts last.
  const key = (moment: number): number => Number.isNaN(moment) ? Number.POSITIVE_INFINITY : moment
  return dated
    .sort((a, b) => (key(a.moment) < key(b.moment) ? -1 : key(a.moment) > key(b.moment) ? 1 : 0))
    .map(({ row, moment }) => ({
      value: row.id,
      label: oneLine(row.title),
      detail: [
        timingText(row),
        ...Number.isNaN(moment) ? [] : [t('schedule.next', { when: relativeText(moment, now) })],
        ...row.status === 'inactive' ? [t('schedule.inactive')] : [],
      ].join(' · '),
    }))
}

/**
 * The deliveries of one follow-up.
 * @param style - text styles.
 * @param records - the deliveries, newest first.
 * @returns lines to print; one says there are none.
 */
export function deliveryLines(style: Style, records: readonly ScheduleDelivery[]): string[] {
  if (records.length === 0) return [style.dim(t('schedule.noHistory'))]
  return records.map(record => `${record.deliveredAt}${record.prompt === undefined ? '' : `  ${oneLine(record.prompt, 60)}`}`)
}

/**
 * Read the text a person typed for a new timing.
 * @param kind - which timing is being set.
 * @param value - the typed text: a date and time, a number of seconds, `HH:MM` or a cron expression.
 * @param timeZone - the IANA time zone for `daily` and `cron`.
 * @returns the change, or a sentence saying what the text should look like.
 */
export function parseTiming(kind: TimingKind, value: string, timeZone: string): TimingResult {
  const text = value.trim()
  switch (kind) {
    case 'at': {
      const moment = Date.parse(text)
      return Number.isNaN(moment) ? { ok: false, problem: t('schedule.badAt') } : { ok: true, change: { kind, at: new Date(moment).toISOString() } }
    }
    case 'every': {
      const seconds = Number(text)
      return /^\d+$/u.test(text) && seconds > 0
        ? { ok: true, change: { kind, every_seconds: seconds } }
        : { ok: false, problem: t('schedule.badEvery') }
    }
    case 'daily':
      return /^([01]\d|2[0-3]):[0-5]\d$/u.test(text)
        ? { ok: true, change: { kind, daily: { time: text, time_zone: timeZone } } }
        : { ok: false, problem: t('schedule.badDaily') }
    case 'cron':
      return text.split(/\s+/u).length === 5
        ? { ok: true, change: { kind, cron: { expression: text.split(/\s+/u).join(' '), time_zone: timeZone } } }
        : { ok: false, problem: t('schedule.badCron') }
  }
}
