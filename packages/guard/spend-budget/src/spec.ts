/**
 * The `spend_budget` storage domain: one record per UTC calendar month and
 * one record per budget-owning Session. Records are authoritative spend, so a
 * record that fails its schema rejects the open instead of being skipped: a
 * skipped record would under-count spend and let a limit pass silently.
 * @module @deepseek-ai/dsh-spend-budget/src/spec
 */

import { z } from 'zod'
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import type { SessionId } from '@deepseek-ai/dsh-session'
import type { SpendMonth } from './types.ts'

/** Accumulated spend of one UTC calendar month across every Session. */
export const monthSpendRecord = z.object({
  /** Priced spend in US dollars. */
  spentUsd: z.number().nonnegative(),
  /** Model calls that reported usage for a route with no known price. */
  unpricedCalls: z.number().int().nonnegative(),
}).strict()

/** One stored month record, inferred from {@link monthSpendRecord}. */
export type MonthSpendRecord = z.infer<typeof monthSpendRecord>

/** Accumulated spend and optional limit of one budget-owning Session. */
export const sessionSpendRecord = z.object({
  /** Priced spend in US dollars, including the Session's subagent descendants. */
  spentUsd: z.number().nonnegative(),
  /** Model calls that reported usage for a route with no known price. */
  unpricedCalls: z.number().int().nonnegative(),
  /** Spend at or above which the Session's next model step is refused; absent means no limit. */
  limitUsd: z.number().nonnegative().optional(),
}).strict()

/** One stored Session record, inferred from {@link sessionSpendRecord}. */
export type SessionSpendRecord = z.infer<typeof sessionSpendRecord>

/**
 * The spend domain spec. Version 1 has no predecessor. `per-record` keeps each
 * accounting write to one small document.
 */
export const spendDomainSpec = defineDomain({
  name: 'spend_budget',
  version: 1,
  layout: 'per-record',
  tables: {
    months: domainTable<SpendMonth, MonthSpendRecord>(monthSpendRecord),
    sessions: domainTable<SessionId, SessionSpendRecord>(sessionSpendRecord),
  },
})
