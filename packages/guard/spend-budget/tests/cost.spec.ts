import { describe, expect, it } from 'vitest'
import {
  findBreaches, formatUsd, spendLimitMessage, usageCostUsd, utcMonthOf,
} from '../src/index.ts'

describe('usageCostUsd', () => {
  it('prices uncached input, output, and cache traffic at their own rates', () => {
    const cost = usageCostUsd(
      { inputTokens: 1_000_000, outputTokens: 500_000, cacheReadTokens: 2_000_000, cacheWriteTokens: 100_000 },
      { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
    )
    expect(cost).toBeCloseTo(3 + 7.5 + 0.6 + 0.375, 10)
  })

  it('prices unpriced cache buckets at the input rate', () => {
    const cost = usageCostUsd(
      { inputTokens: 1_000_000, outputTokens: 0, cacheReadTokens: 1_000_000, cacheWriteTokens: 1_000_000 },
      { input: 2, output: 8 },
    )
    expect(cost).toBeCloseTo(6, 10)
  })

  it('counts reasoning only through outputTokens', () => {
    const cost = usageCostUsd(
      { inputTokens: 0, outputTokens: 1_000_000, reasoningTokens: 900_000 },
      { input: 1, output: 4 },
    )
    expect(cost).toBeCloseTo(4, 10)
  })

  it('is zero for a free price', () => {
    expect(usageCostUsd({ inputTokens: 10, outputTokens: 10 }, { input: 0, output: 0 })).toBe(0)
  })
})

describe('utcMonthOf', () => {
  it('uses the UTC calendar month', () => {
    expect(utcMonthOf(Date.UTC(2026, 0, 31, 23, 59, 59))).toBe('2026-01')
    expect(utcMonthOf(Date.UTC(2026, 1, 1, 0, 0, 0))).toBe('2026-02')
    expect(utcMonthOf(Date.UTC(2026, 11, 15))).toBe('2026-12')
  })
})

describe('limits', () => {
  it('formats dollars with two decimals', () => {
    expect(formatUsd(0.4249)).toBe('$0.42')
    expect(formatUsd(20)).toBe('$20.00')
  })

  it('reports a limit once spend reaches it, session first', () => {
    expect(findBreaches({ spentUsd: 1.99, unpricedCalls: 0, limitUsd: 2 }, { spentUsd: 1, unpricedCalls: 0 })).toEqual([])
    expect(findBreaches(
      { spentUsd: 2, unpricedCalls: 0, limitUsd: 2 },
      { spentUsd: 20.5, unpricedCalls: 0, limitUsd: 20 },
    )).toEqual([
      { scope: 'session', spentUsd: 2, limitUsd: 2 },
      { scope: 'month', spentUsd: 20.5, limitUsd: 20 },
    ])
    expect(findBreaches({ spentUsd: 0, unpricedCalls: 0, limitUsd: 0 }, { spentUsd: 0, unpricedCalls: 0 }))
      .toEqual([{ scope: 'session', spentUsd: 0, limitUsd: 0 }])
  })

  it('names the limit, spend against limit, and how to change it', () => {
    expect(spendLimitMessage([{ scope: 'session', spentUsd: 2.034, limitUsd: 2 }])).toBe(
      'This session reached its spend limit: $2.03 spent of $2.00. Raise it with /budget <usd> or remove it with /budget off.',
    )
    expect(spendLimitMessage([{ scope: 'month', spentUsd: 20.1, limitUsd: 20 }])).toBe(
      'This month reached its spend limit: $20.10 spent of $20.00 (UTC calendar month). '
      + 'Raise it with /budget month <usd>, remove it with /budget month off, or change the monthlyLimitUsd setting.',
    )
  })
})
