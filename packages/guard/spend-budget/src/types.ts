/**
 * Public types of the spend budget service.
 * @module @deepseek-ai/dsh-spend-budget/src/types
 */

import type { SessionId } from '@deepseek-ai/dsh-session'

/** A UTC calendar month as `YYYY-MM`, the key of one month record. */
export type SpendMonth = `${number}-${number}`

/** Spend, limit, and unpriced-call count of one accounting scope. */
export interface SpendScopeSummary {
  /** Priced spend in US dollars. */
  readonly spentUsd: number
  /** Spend at or above which model steps are refused; absent means no limit. */
  readonly limitUsd?: number
  /** Model calls that reported usage for a route with no known price; their cost is not in `spentUsd`. */
  readonly unpricedCalls: number
}

/** Spend summary for one Session and the current UTC month. */
export interface SpendSummary {
  /** The Session whose record holds the spend: the queried Session, or the top Session of its subagent lineage. */
  readonly budgetSession: SessionId
  /** The budget Session's spend and limit. */
  readonly session: SpendScopeSummary
  /** The UTC month the `month` figures belong to. */
  readonly month: SpendMonth
  /** The month's spend across every Session, and the configured monthly limit. */
  readonly monthly: SpendScopeSummary
}

/** One limit that refuses the next model step. */
export interface SpendLimitBreach {
  /** Which limit is reached. */
  readonly scope: 'session' | 'month'
  /** Spend in US dollars when the step was refused. */
  readonly spentUsd: number
  /** The reached limit in US dollars. */
  readonly limitUsd: number
}
