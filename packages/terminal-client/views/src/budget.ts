/**
 * Spend budget: this session's and this month's spend against their limits.
 * @module @deepseek-ai/dsh-terminal-views/budget
 */
import { t } from './copy.ts'
import type { Style } from './ansi.ts'

/** Spend and limit of one scope. */
export interface SpendScope {
  readonly spentUsd: number
  readonly limitUsd?: number | undefined
  readonly unpricedCalls: number
}

/** What the Host reports about spend. */
export interface SpendSummary {
  readonly session: SpendScope
  readonly month: string
  readonly monthly: SpendScope
}

/** A dollar amount with at least two decimals. */
function usd(amount: number): string {
  return `$${amount.toFixed(2)}`
}

/** One scope as `$0.42 of $2.00`, or `$0.42` without a limit. */
function scopeText(scope: SpendScope): string {
  return scope.limitUsd === undefined
    ? usd(scope.spentUsd)
    : t('budget.of', { spent: usd(scope.spentUsd), limit: usd(scope.limitUsd) })
}

/**
 * The spend in words.
 * @param style - text styles.
 * @param summary - what the Host reports.
 * @returns lines to print: this session, this month, calls with no known price, and how to change a limit.
 */
export function budgetLines(style: Style, summary: SpendSummary): string[] {
  const unpriced = summary.session.unpricedCalls + summary.monthly.unpricedCalls
  return [
    t('budget.session', { spend: scopeText(summary.session) }),
    t('budget.month', { month: summary.month, spend: scopeText(summary.monthly) }),
    ...unpriced === 0 ? [] : [style.yellow(t('budget.unpriced', { session: summary.session.unpricedCalls, month: summary.monthly.unpricedCalls }))],
    style.dim(t('budget.hint')),
  ]
}
