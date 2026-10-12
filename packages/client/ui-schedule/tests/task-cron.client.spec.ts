/** Client-side cron parsing and the localized sentence the Run time card derives from it. */
import { describe, expect, it } from 'vitest'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { cronPreview, cronShapeExpression, parseCronExpression, recognizeCronShape } from '../src/client/task-cron.ts'
import type { CronBuilderState } from '../src/client/task-cron.ts'
import { en, es } from '../src/client/task-manager-locales.ts'

const tEn = makeTranslate(en)
const tEs = makeTranslate(es)

/**
 * Parse one expression the Host accepts, failing the case when it does not.
 * @param expression - five-field expression.
 * @returns the parsed expression.
 */
function parsed(expression: string) {
  const value = parseCronExpression(expression)
  if (value === undefined) throw new Error(`expected ${expression} to parse`)
  return value
}

describe('Vixie star flags mirrored from the Host', () => {
  it('flags a stepped star field without calling it unrestricted', () => {
    const value = parsed('0 9 */2 * 1')
    // The Host's `parseCronField` reads the first character: `*/2` is a star
    // (DOM_STAR) that still restricts, while `1-31` covers everything and is not
    // a star.
    expect(value.daysOfMonth.starred).toBe(true)
    expect(value.daysOfMonth.full).toBe(false)
    expect(value.daysOfMonth.unrestricted).toBe(false)
    expect(value.daysOfWeek.starred).toBe(false)
    expect(parsed('0 9 1-31 * 1').daysOfMonth.starred).toBe(false)
    expect(parsed('0 9 1-31 * 1').daysOfMonth.full).toBe(true)
    // `*/1` normalizes to `*`.
    expect(parsed('0 0 */1 * *').daysOfMonth.starred).toBe(true)
    expect(parsed('0 0 */1 * *').daysOfMonth.unrestricted).toBe(true)
  })

  it('phrases both day fields with "and" once either side is a star field', () => {
    // The Host requires both day fields when either field text starts with `*`,
    // so the sentence must not present them as alternatives.
    const conjunction = cronPreview(parsed('0 9 */2 * 1'), tEn, 'en')
    expect(conjunction).toContain(' and ')
    expect(conjunction).not.toContain(' or ')
    expect(cronPreview(parsed('0 9 */2 * 1'), tEs, 'es')).toContain(' y ')
    // Without a star on either side the fields stay alternatives.
    expect(cronPreview(parsed('0 9 1 * 1'), tEn, 'en')).toContain(' or ')
  })

  it('keeps a stepped star on the clock as a restriction', () => {
    // The star flag must not turn `*/2` minutes into an unrestricted field.
    const everyTwoMinutes = cronPreview(parsed('*/2 * * * *'), tEn, 'en')
    expect(everyTwoMinutes).toContain('2 minutes')
    expect(everyTwoMinutes).not.toContain('Every minute')
  })

  it('reads a day field that covers every value as no restriction without a star', () => {
    // Without a star either side matches independently, so a day field holding
    // every value makes the union every day, whichever side holds it.
    expect(cronPreview(parsed('0 9 1-31 * 1'), tEn, 'en')).toBe('Every day at 09:00')
    expect(cronPreview(parsed('0 9 1 * 0-6'), tEn, 'en')).toBe('Every day at 09:00')
    // Neither side covers every value: both are named as alternatives.
    expect(cronPreview(parsed('0 9 1,2 * 1,3'), tEn, 'en')).toBe('Day 1, 2 of every month or Mon, Wed at 09:00')
    expect(cronPreview(parsed('0 9 1,2 * 1,3'), tEs, 'es')).toBe('Día 1, 2 de cada mes o lun, mié a las 09:00')
  })
})

describe('parseCronExpression', () => {
  it('reads every field of a valid expression into ascending matched values', () => {
    const value = parsed('0 9 * * 1-5')
    expect(value.minutes.values).toEqual([0])
    expect(value.hours.values).toEqual([9])
    expect(value.daysOfMonth.values).toHaveLength(31)
    expect(value.months.values).toHaveLength(12)
    expect(value.daysOfWeek.values).toEqual([1, 2, 3, 4, 5])
    expect(value.minutes.unrestricted).toBe(false)
    expect(value.daysOfMonth.unrestricted).toBe(true)
    expect(value.daysOfWeek.unrestricted).toBe(false)
  })

  it('marks the unrestricted star of every field, including a Sunday range', () => {
    const value = parsed('* * * * *')
    for (const field of [value.minutes, value.hours, value.daysOfMonth, value.months, value.daysOfWeek]) {
      expect(field.unrestricted).toBe(true)
    }
    expect(value.daysOfWeek.values).toEqual([0, 1, 2, 3, 4, 5, 6])
  })

  it('folds Sunday 7 onto 0 and keeps a stepped star unrestricted', () => {
    expect(parsed('0 0 * * 7').daysOfWeek.values).toEqual([0])
    expect(parsed('0 0 * * 0').daysOfWeek.values).toEqual([0])
    expect(parsed('*/1 * * * *').minutes.unrestricted).toBe(true)
    expect(parsed('*/1 * * * *').minutes.values).toHaveLength(60)
    expect(parsed('0-59/1 * * * *').minutes.unrestricted).toBe(false)
    expect(parsed('0-59/1 * * * *').minutes.values).toHaveLength(60)
  })

  it('expands lists, ranges, steps, and bounded ranges', () => {
    expect(parsed('1,20,45 * * * *').minutes.values).toEqual([1, 20, 45])
    expect(parsed('0 9-11 * * *').hours.values).toEqual([9, 10, 11])
    expect(parsed('*/15 * * * *').minutes.values).toEqual([0, 15, 30, 45])
    expect(parsed('0 0 1-15/7 * *').daysOfMonth.values).toEqual([1, 8, 15])
    expect(parsed('0 0 * 1,12 *').months.values).toEqual([1, 12])
  })

  it('accepts the dialect without an extra value the Host would reject', () => {
    expect(parsed('0 9 * * *').minutes.values).toEqual([0])
  })

  it.each([
    ['an empty expression', ''],
    ['an untrimmed expression', ' 0 9 * * *'],
    ['four fields', '0 9 * *'],
    ['six fields', '0 9 * * * *'],
    ['an empty list element', '0,,1 * * * *'],
    ['a malformed element', 'a * * * *'],
    ['a range with two dashes', '1-2-3 * * * *'],
    ['a trailing star', '*5 * * * *'],
    ['a zero step', '*/0 * * * *'],
    ['a step outside the safe integer range', '*/99999999999999999999 * * * *'],
    ['a value outside the safe integer range', '99999999999999999999 * * * *'],
    ['a step on a single value', '5/2 * * * *'],
    ['a zero step on a range', '10-20/0 * * * *'],
    ['a minute above its maximum', '60 * * * *'],
    ['a range end above its maximum', '10-70 * * * *'],
    ['an hour above its maximum', '0 24 * * *'],
    ['a day of month below its minimum', '0 0 0 * *'],
    ['a month above its maximum', '0 0 * 13 *'],
    ['a weekday above its maximum', '0 0 * * 8'],
    ['an inverted range', '30-10 * * * *'],
    ['an inverted hour range', '0 20-9 * * *'],
  ])('rejects %s', (_case, expression) => {
    expect(parseCronExpression(expression)).toBeUndefined()
  })
})

describe('cronPreview', () => {
  // Every minute of an hour, as each locale's list separator spells it.
  const everyMinuteEn = Array.from({ length: 60 }, (_value, index) => index).join(', ')
  it.each([
    ['0 9 * * 1-5', 'Mon–Fri at 09:00', 'lun–vie a las 09:00'],
    ['0 9 * * *', 'Every day at 09:00', 'Todos los días a las 09:00'],
    ['*/15 * * * *', 'Every 15 minutes', 'Cada 15 minutos'],
    ['* * * * *', 'Every minute', 'Cada minuto'],
    ['0 9 * * 1,3', 'Mon, Wed at 09:00', 'lun, mié a las 09:00'],
    ['0 9 * * 1-3,6', 'Mon–Wed, Sat at 09:00', 'lun–mié, sáb a las 09:00'],
    ['0 9 * * 0', 'Sun at 09:00', 'dom a las 09:00'],
    ['0 9 * * 6,7', 'Sat, Sun at 09:00', 'sáb, dom a las 09:00'],
    ['30 8 1 * *', 'Day 1 of every month at 08:30', 'Día 1 de cada mes a las 08:30'],
    ['0 9 1,15 * *', 'Day 1, 15 of every month at 09:00', 'Día 1, 15 de cada mes a las 09:00'],
    ['0 9 1 3 *', 'Day 1 of every month in March at 09:00', 'Día 1 de cada mes en marzo a las 09:00'],
    ['0 9 1 * 1', 'Day 1 of every month or Mon at 09:00', 'Día 1 de cada mes o lun a las 09:00'],
    ['0 9 * 1,12 *', 'Every day in January, December at 09:00', 'Todos los días en enero, diciembre a las 09:00'],
    ['* 9-17 * * *', 'Every day every minute during hours 09–17', 'Todos los días cada minuto durante las horas 09–17'],
    ['*/15 9-17 * * *', 'Every day every 15 minutes during hours 09–17', 'Todos los días cada 15 minutos durante las horas 09–17'],
    ['0 9,15 * * *', 'Every day at 09:00, 15:00', 'Todos los días a las 09:00, 15:00'],
    ['0,30 * * * *', 'Every 30 minutes', 'Cada 30 minutos'],
    ['0 * * * *', 'Every hour', 'Cada hora'],
    ['0 */2 * * *', 'Every 2 hours', 'Cada 2 horas'],
    // A restricted day phrase joins the repetition into one sentence, so the
    // interval is spelled in its lower-case form instead of as a second title.
    ['0 * * * 1', 'Mon every hour', 'lun cada hora'],
    ['0 */2 * * 1', 'Mon every 2 hours', 'lun cada 2 horas'],
    ['0-59/1 * * * *', `Every day every hour at minute ${everyMinuteEn}`,
      'Todos los días cada hora, en el minuto 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59'],
    ['0-30/15 * * * *', 'Every day every hour at minute 0, 15, 30', 'Todos los días cada hora, en el minuto 0, 15, 30'],
    ['5,20,35,50 * * * *', 'Every day every hour at minute 5, 20, 35, 50', 'Todos los días cada hora, en el minuto 5, 20, 35, 50'],
    ['0,15,40 * * * *', 'Every day every hour at minute 0, 15, 40', 'Todos los días cada hora, en el minuto 0, 15, 40'],
    ['* 9 * * *', 'Every day every minute during hours 09', 'Todos los días cada minuto durante las horas 09'],
    ['0-59/1 9 * * *', `Every day at minute ${everyMinuteEn} of hours 09`, 'Todos los días en el minuto 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59 de las horas 09'],
    ['5,10,25,40,50 1,7,13 * * *', 'Every day at minute 5, 10, 25, 40, 50 of hours 01, 07, 13',
      'Todos los días en el minuto 5, 10, 25, 40, 50 de las horas 01, 07, 13'],
    ['*/15 * * 3 *', 'Every day in March every 15 minutes', 'Todos los días en marzo cada 15 minutos'],
  ])('describes %s', (expression, english, chinese) => {
    expect(cronPreview(parsed(expression), tEn, 'en')).toBe(english)
    expect(cronPreview(parsed(expression), tEs, 'es')).toBe(chinese)
  })

  it('joins a repeated hour phrase in its lower-case form after a day phrase', () => {
    const hourly = cronPreview(parsed('0 * * * 1'), tEn, 'en')
    const stepped = cronPreview(parsed('0 */2 * * 1'), tEn, 'en')
    // Each repetition states itself as the whole sentence `Every hour` /
    // `Every 2 hours`; behind a day phrase it continues that sentence, so the
    // joined wording is what a catalog row must carry.
    expect(hourly).toBe(`Mon ${tEn('cron.time.joinedEveryHour')}`)
    expect(stepped).toBe(`Mon ${tEn('cron.time.joinedEveryNHours', { count: 2 })}`)
    // Neither sentence is the standalone wording, which capitalizes the phrase
    // and would read as two stacked titles.
    expect(hourly).not.toContain(tEn('cron.time.everyHour'))
    expect(stepped).not.toContain(tEn('cron.time.everyNHours', { count: 2 }))
  })
})

describe('recognizeCronShape', () => {
  it.each([
    ['* * * * *', { kind: 'minutely', step: 1 }],
    ['*/5 * * * *', { kind: 'minutely', step: 5 }],
    // Written-out equivalents of a step carry no star semantics on the clock.
    ['0,30 * * * *', { kind: 'minutely', step: 30 }],
    ['0 * * * *', { kind: 'hourly', step: 1, minute: 0 }],
    ['15 */2 * * *', { kind: 'hourly', step: 2, minute: 15 }],
    ['30 9 * * *', { kind: 'daily', hour: 9, minute: 30 }],
    ['0 23 * * *', { kind: 'daily', hour: 23, minute: 0 }],
    ['0 9 * * 1-5', { kind: 'weekly', weekdays: [1, 2, 3, 4, 5], hour: 9, minute: 0 }],
    // Sunday reads as ISO 7 whichever cron spelling stored it.
    ['0 9 * * 0', { kind: 'weekly', weekdays: [7], hour: 9, minute: 0 }],
    ['0 9 * * 7', { kind: 'weekly', weekdays: [7], hour: 9, minute: 0 }],
    ['30 18 * * 6,0', { kind: 'weekly', weekdays: [6, 7], hour: 18, minute: 30 }],
    // A written-out full weekday set stays weekly; only a star weekday states
    // the day-free shapes, so the all-days pill row never collapses.
    ['0 9 * * 0-6', { kind: 'weekly', weekdays: [1, 2, 3, 4, 5, 6, 7], hour: 9, minute: 0 }],
    ['0 9 15 * *', { kind: 'monthly', days: [15], hour: 9, minute: 0 }],
    ['30 8 1,15 * *', { kind: 'monthly', days: [1, 15], hour: 8, minute: 30 }],
    // A stepped star restricts (DOM_STAR), so it reads as the dates it matches.
    ['0 9 */2 * *', {
      kind: 'monthly', days: Array.from({ length: 16 }, (_value, index) => index * 2 + 1), hour: 9, minute: 0,
    }],
    // The written-out full date set stays monthly, mirroring the weekday rule,
    // so the all-dates grid never collapses either.
    ['0 9 1-31 * *', {
      kind: 'monthly', days: Array.from({ length: 31 }, (_value, index) => index + 1), hour: 9, minute: 0,
    }],
  ] satisfies readonly [string, CronBuilderState][])('recognizes %s', (expression, state) => {
    expect(recognizeCronShape(parsed(expression))).toEqual(state)
  })

  it.each([
    ['a restricted day of month beside weekdays', '0 9 15 * 1'],
    ['an unrestricted minute under a monthly date', '* * 15 * *'],
    ['several hours under a monthly date', '0 9,15 15 * *'],
    ['an unrestricted minute under a fixed hour', '* 9 * * *'],
    ['several hours', '0 9,15 * * *'],
    ['a stepped minute under restricted weekdays', '*/5 * * * 1-5'],
    ['a restricted month', '0 9 * 3 *'],
    ['a non-uniform minute list', '0,15,40 * * * *'],
    ['a non-uniform hour list', '0 1,2,4 * * *'],
    ['a stepped hour without one minute', '* */2 * * *'],
    // A written-out full day-of-month field beside restricted weekdays matches
    // every day under the Host's union rule, so it is not a weekly rule.
    ['a written-out day-of-month union', '0 9 1-31 * 1'],
    ['a starred day of month beside weekdays', '0 9 */2 * 1'],
  ])('rejects %s', (_case, expression) => {
    expect(recognizeCronShape(parsed(expression))).toBeUndefined()
  })
})

describe('cronShapeExpression', () => {
  it.each([
    [{ kind: 'minutely', step: 1 }, '* * * * *'],
    [{ kind: 'minutely', step: 5 }, '*/5 * * * *'],
    [{ kind: 'hourly', step: 1, minute: 0 }, '0 * * * *'],
    [{ kind: 'hourly', step: 3, minute: 15 }, '15 */3 * * *'],
    [{ kind: 'daily', hour: 9, minute: 30 }, '30 9 * * *'],
    // Runs of three or more weekdays compress into a range; shorter runs list.
    [{ kind: 'weekly', weekdays: [1, 2, 3, 4, 5], hour: 9, minute: 0 }, '0 9 * * 1-5'],
    [{ kind: 'weekly', weekdays: [1, 3], hour: 9, minute: 0 }, '0 9 * * 1,3'],
    // ISO Sunday 7 writes cron 0, which sorts ahead of Saturday.
    [{ kind: 'weekly', weekdays: [6, 7], hour: 18, minute: 30 }, '30 18 * * 0,6'],
    [{ kind: 'weekly', weekdays: [5, 6, 7], hour: 8, minute: 0 }, '0 8 * * 0,5,6'],
    [{ kind: 'weekly', weekdays: [1, 2, 3, 4, 5, 6, 7], hour: 7, minute: 0 }, '0 7 * * 0-6'],
    [{ kind: 'monthly', days: [15], hour: 9, minute: 0 }, '0 9 15 * *'],
    [{ kind: 'monthly', days: [1, 15], hour: 8, minute: 30 }, '30 8 1,15 * *'],
    // Date runs compress like weekday runs, and the full set written out still
    // recognizes as monthly, so the all-dates grid round-trips.
    [{ kind: 'monthly', days: [1, 2, 3, 10], hour: 7, minute: 0 }, '0 7 1-3,10 * *'],
    [{
      kind: 'monthly', days: Array.from({ length: 31 }, (_value, index) => index + 1), hour: 9, minute: 0,
    }, '0 9 1-31 * *'],
  ] satisfies readonly [CronBuilderState, string][])('writes %j', (state, expression) => {
    expect(cronShapeExpression(state)).toBe(expression)
    // Every generated expression parses back to the shape family it was
    // written from, so the builder never locks itself out of its own edit.
    const roundTrip = recognizeCronShape(parsed(expression))
    expect(roundTrip?.kind).toBe(state.kind)
  })
})
