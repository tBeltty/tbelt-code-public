import { describe, expect, it } from 'vitest'
import { createStyle } from '../src/ansi.ts'
import { goalActions, goalLines } from '../src/goal.ts'
import type { GoalRow } from '../src/goal.ts'
import { deliveryLines, parseTiming, scheduleItems, timingText } from '../src/schedule.ts'
import type { ScheduleRow } from '../src/schedule.ts'

const plain = createStyle(false)

const row = (over: Partial<ScheduleRow> = {}): ScheduleRow => ({
  id: 's1', kind: 'at', title: 'Check the build', scheduledAt: '2026-10-09T12:00:00.000Z', sessionId: 'session-1', status: 'active', ...over,
})

describe('schedule rows', () => {
  it('describes each kind of timing', () => {
    expect([
      row({ kind: 'after' }), row(), row({ kind: 'every', everySeconds: 300 }), row({ kind: 'every' }),
      row({ kind: 'daily', time: '09:00' }), row({ kind: 'daily' }), row({ kind: 'weekly', time: '08:30' }), row({ kind: 'weekly' }),
      row({ kind: 'cron', expression: '0 9 * * 1' }), row({ kind: 'cron' }),
    ].map(timingText)).toEqual([
      'once', 'once', 'every 5m 00s', 'every 0ms', 'daily at 09:00', 'daily at ', 'weekly at 08:30', 'weekly at ', 'cron 0 9 * * 1', 'cron ',
    ])
  })

  it('lists the soonest first with the next run and whether the follow-up is switched off', () => {
    const now = Date.parse('2026-10-09T11:55:00.000Z')
    expect(scheduleItems([
      row({ id: 'late', title: 'Later', scheduledAt: '2026-10-09T13:00:00.000Z', status: 'inactive' }),
      row({ id: 'soon' }),
      row({ id: 'broken', scheduledAt: 'not a date', title: 'Odd' }),
      row({ id: 'broken-too', scheduledAt: 'also not', title: 'Odd' }),
    ], now).map(item => [item.value, item.detail])).toEqual([
      ['soon', 'once · next in 5m 00s'],
      ['late', 'once · next in 1h 05m · inactive'],
      ['broken', 'once'],
      ['broken-too', 'once'],
    ])
  })
})

describe('delivery lines', () => {
  it('lists deliveries with the message that went out, or says there were none', () => {
    expect(deliveryLines(plain, [])).toEqual(['It has not run yet.'])
    expect(deliveryLines(plain, [
      { scheduledAt: 'a', deliveredAt: '2026-10-09T09:00:00Z', prompt: 'Check\nthe build' },
      { scheduledAt: 'b', deliveredAt: '2026-10-08T09:00:00Z' },
    ])).toEqual(['2026-10-09T09:00:00Z  Check the build', '2026-10-08T09:00:00Z'])
  })
})

describe('parseTiming', () => {
  it('reads a date, a number of seconds, a time of day and a cron expression', () => {
    expect(parseTiming('at', ' 2026-12-01T09:00:00Z ', 'UTC')).toEqual({ ok: true, change: { kind: 'at', at: '2026-12-01T09:00:00.000Z' } })
    expect(parseTiming('every', '90', 'UTC')).toEqual({ ok: true, change: { kind: 'every', every_seconds: 90 } })
    expect(parseTiming('daily', '09:30', 'Europe/Madrid')).toEqual({
      ok: true, change: { kind: 'daily', daily: { time: '09:30', time_zone: 'Europe/Madrid' } },
    })
    expect(parseTiming('cron', '0  9 * *   1', 'UTC')).toEqual({
      ok: true, change: { kind: 'cron', cron: { expression: '0 9 * * 1', time_zone: 'UTC' } },
    })
  })

  it('says what each timing should look like when the text does not fit', () => {
    expect(parseTiming('at', 'tomorrow-ish', 'UTC')).toEqual({ ok: false, problem: 'Use a date and time such as 2026-12-01 09:00.' })
    expect(parseTiming('every', '0', 'UTC')).toEqual({ ok: false, problem: 'Use a whole number of seconds above zero.' })
    expect(parseTiming('every', '1.5', 'UTC')).toMatchObject({ ok: false })
    expect(parseTiming('daily', '25:00', 'UTC')).toEqual({ ok: false, problem: 'Use HH:MM on a 24-hour clock.' })
    expect(parseTiming('cron', '0 9 * *', 'UTC')).toEqual({ ok: false, problem: 'Use five fields, such as 0 9 * * 1.' })
  })
})

const goal = (over: Partial<GoalRow> = {}): GoalRow => ({
  objective: 'Ship it', phase: 'active', maxGoalRounds: 5, roundsStarted: 2, activation: 'armed', ...over,
})

describe('goal', () => {
  it('shows the objective, the phase and the rounds used', () => {
    expect(goalLines(plain, goal())).toEqual(['Ship it', 'active · round 2 of 5'])
    expect(goalLines(plain, goal({ phase: 'blocked', activation: 'disarmed', blockedReason: { message: 'Needs a key' } }))).toEqual([
      'Ship it', 'blocked · round 2 of 5 · not armed', 'Needs a key',
    ])
  })

  it('offers only the actions the phase allows', () => {
    const values = (over: Partial<GoalRow>): string[] => goalActions(goal(over)).map(item => item.value)
    expect(values({})).toEqual(['edit', 'pause', 'complete', 'clear'])
    expect(values({ phase: 'paused' })).toEqual(['edit', 'resume', 'complete', 'clear'])
    expect(values({ phase: 'blocked' })).toEqual(['edit', 'resume', 'complete', 'clear'])
    expect(values({ phase: 'complete' })).toEqual(['edit', 'clear'])
  })
})
