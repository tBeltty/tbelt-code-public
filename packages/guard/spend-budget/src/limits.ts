/**
 * Limit evaluation and the refusal text a blocked model step shows.
 * @module @deepseek-ai/dsh-spend-budget/src/limits
 */

import { assertNever } from '@deepseek-ai/dsh-util-values'
import { formatUsd } from './cost.ts'
import type { SpendLimitBreach, SpendScopeSummary } from './types.ts'

/** Failure code a refused model step carries on its `turn/end` error. */
export const SPEND_LIMIT_CODE = 'SPEND_LIMIT'

/**
 * Every limit that refuses the next model step: a scope whose spend is at or
 * above its limit. The Session limit is listed first.
 * @param session - the budget Session's spend and limit.
 * @param monthly - the current month's spend and limit.
 * @returns the reached limits; empty when the step may run.
 */
export function findBreaches(session: SpendScopeSummary, monthly: SpendScopeSummary): SpendLimitBreach[] {
  const breaches: SpendLimitBreach[] = []
  if (session.limitUsd !== undefined && session.spentUsd >= session.limitUsd) {
    breaches.push({ scope: 'session', spentUsd: session.spentUsd, limitUsd: session.limitUsd })
  }
  if (monthly.limitUsd !== undefined && monthly.spentUsd >= monthly.limitUsd) {
    breaches.push({ scope: 'month', spentUsd: monthly.spentUsd, limitUsd: monthly.limitUsd })
  }
  return breaches
}

/**
 * The user-facing refusal for reached limits: which limit, spend against
 * limit, and how to change it.
 * @param breaches - non-empty result of {@link findBreaches}.
 * @returns one sentence group per reached limit, space-joined.
 */
export function spendLimitMessage(breaches: readonly SpendLimitBreach[]): string {
  return breaches.map((breach) => {
    const figures = `${formatUsd(breach.spentUsd)} spent of ${formatUsd(breach.limitUsd)}`
    switch (breach.scope) {
      case 'session':
        return `This session reached its spend limit: ${figures}. Raise it with /budget <usd> or remove it with /budget off.`
      case 'month':
        return `This month reached its spend limit: ${figures} (UTC calendar month). `
          + 'Raise it with /budget month <usd>, remove it with /budget month off, or change the monthlyLimitUsd setting.'
      default:
        return assertNever(breach.scope, 'spend limit scope')
    }
  }).join(' ')
}
