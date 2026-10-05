import { describe, expect, it } from 'vitest'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import { SessionId } from '@deepseek-ai/dsh-session'
import * as commandBudget from '../src/index.ts'
import { BUDGET_USAGE, describeSummary, parseBudgetInput } from '../src/index.ts'

describe('parseBudgetInput', () => {
  it('reads the summary, session, and monthly forms', () => {
    expect(parseBudgetInput('')).toEqual({ kind: 'summary' })
    expect(parseBudgetInput('   ')).toEqual({ kind: 'summary' })
    expect(parseBudgetInput(' 2')).toEqual({ kind: 'set', scope: 'session', limitUsd: 2 })
    expect(parseBudgetInput(' $2.50')).toEqual({ kind: 'set', scope: 'session', limitUsd: 2.5 })
    expect(parseBudgetInput(' .5')).toEqual({ kind: 'set', scope: 'session', limitUsd: 0.5 })
    expect(parseBudgetInput(' 0')).toEqual({ kind: 'set', scope: 'session', limitUsd: 0 })
    expect(parseBudgetInput(' OFF')).toEqual({ kind: 'set', scope: 'session', limitUsd: undefined })
    expect(parseBudgetInput(' month 20')).toEqual({ kind: 'set', scope: 'month', limitUsd: 20 })
    expect(parseBudgetInput(' Month off')).toEqual({ kind: 'set', scope: 'month', limitUsd: undefined })
  })

  it('rejects anything else', () => {
    for (const input of [' -1', ' 2 3', ' abc', ' month', ' month 2 3', ' 1e3', ' $', ' 2.', ' month -5', ' Infinity']) {
      expect(parseBudgetInput(input)).toBeUndefined()
    }
  })
})

describe('describeSummary', () => {
  const base = { budgetSession: SessionId('s'), month: '2026-10' as const }

  it('omits a missing limit and mentions unpriced calls only when present', () => {
    expect(describeSummary({
      ...base,
      session: { spentUsd: 0.42, unpricedCalls: 0, limitUsd: 2 },
      monthly: { spentUsd: 3.1, unpricedCalls: 0, limitUsd: 20 },
    })).toBe('This session: $0.42 of $2.00. This month: $3.10 of $20.00.')
    expect(describeSummary({
      ...base,
      session: { spentUsd: 0.42, unpricedCalls: 0 },
      monthly: { spentUsd: 3.1, unpricedCalls: 0 },
    })).toBe('This session: $0.42. This month: $3.10.')
    expect(describeSummary({
      ...base,
      session: { spentUsd: 0, unpricedCalls: 1 },
      monthly: { spentUsd: 1, unpricedCalls: 4 },
    })).toBe('This session: $0.00. This month: $1.00. Model calls with no known price, not counted: 1 this session, 4 this month.')
  })
})

describe('plugin exports', () => {
  it('keeps the function-plugin form the Loader reads', () => {
    expect(commandBudget.name).toBe('command-budget')
    expect(commandBudget.inject).toEqual(['commands', 'spendBudget'])
    expect('default' in commandBudget).toBe(false)
    const loader = Object.create(Loader.prototype) as Loader
    expect(loader.unwrapExports(commandBudget)).toBe(commandBudget)
    expect(BUDGET_USAGE).toBe('Usage: /budget, /budget <usd>, /budget off, /budget month <usd>, or /budget month off')
  })
})
