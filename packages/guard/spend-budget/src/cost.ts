/**
 * Pure spend arithmetic: which usage a durable Assistant settlement reports,
 * what that usage costs under a route's list price, and which UTC month a
 * timestamp belongs to.
 * @module @deepseek-ai/dsh-spend-budget/src/cost
 */

import { lastAssistantStreamChunk } from '@deepseek-ai/dsh-llm'
import type { LlmModelPricing, TokenUsage } from '@deepseek-ai/dsh-llm'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type { SpendMonth } from './types.ts'

/** Tokens per unit of a {@link LlmModelPricing} rate. */
const TOKENS_PER_PRICE_UNIT = 1_000_000

/**
 * The usage one durable Assistant settlement reports for its model request,
 * read the way `dsh-token-meter` reads it: an `assistant/message`'s `usage`
 * field, otherwise the last `usage` chunk of the settlement's stream.
 * @param event - any committed Session event.
 * @returns the reported usage, or `undefined` for other events and for settlements without usage.
 */
export function settlementUsage(event: SessionEvent): TokenUsage | undefined {
  if (event.type === 'assistant/message' && event.data.usage !== undefined) return event.data.usage
  if (event.type !== 'assistant/message' && event.type !== 'assistant/attempt') return undefined
  return lastAssistantStreamChunk(event.data.stream, 'usage')?.usage
}

/**
 * Cost of one request's usage under a list price. `inputTokens` is the
 * uncached input bucket; cache-read and cache-write tokens use their own
 * rates when priced and the input rate otherwise; `outputTokens` already
 * includes reasoning tokens.
 * @param usage - provider-reported token usage of one request.
 * @param pricing - the route's list price in US dollars per million tokens.
 * @returns the cost in US dollars.
 */
export function usageCostUsd(usage: TokenUsage, pricing: LlmModelPricing): number {
  const tokenDollars = usage.inputTokens * pricing.input
    + usage.outputTokens * pricing.output
    + (usage.cacheReadTokens ?? 0) * (pricing.cacheRead ?? pricing.input)
    + (usage.cacheWriteTokens ?? 0) * (pricing.cacheWrite ?? pricing.input)
  return tokenDollars / TOKENS_PER_PRICE_UNIT
}

/**
 * The UTC calendar month containing a timestamp.
 * @param time - milliseconds since the Unix epoch.
 * @returns the month as `YYYY-MM`.
 */
export function utcMonthOf(time: number): SpendMonth {
  const date = new Date(time)
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  return `${date.getUTCFullYear()}-${month}` as SpendMonth
}

/**
 * Format a dollar amount for messages: `$` and two decimals.
 * @param usd - amount in US dollars.
 * @returns the formatted amount, for example `$2.00`.
 */
export function formatUsd(usd: number): string {
  return `$${usd.toFixed(2)}`
}
