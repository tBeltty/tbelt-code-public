/**
 * Human-facing `/budget` command over `@deepseek-ai/dsh-spend-budget`: shows
 * this Session's and this month's spend, and sets or clears either limit.
 * @module @deepseek-ai/dsh-command-budget
 */

import type { Context } from '@deepseek-ai/cordis'
import { CommandDefinitionId } from '@deepseek-ai/dsh-commands/brand'
import type { CommandInvocation, CommandResult } from '@deepseek-ai/dsh-commands'
import { formatUsd } from '@deepseek-ai/dsh-spend-budget'
import type { SpendScopeSummary, SpendSummary } from '@deepseek-ai/dsh-spend-budget'
import { assertNever } from '@deepseek-ai/dsh-util-values'

export const name = 'command-budget'
export const inject = ['commands', 'spendBudget']

/** Usage text returned for input the command does not accept. */
export const BUDGET_USAGE = 'Usage: /budget, /budget <usd>, /budget off, /budget month <usd>, or /budget month off'

/** One parsed `/budget` request. */
export type BudgetRequest =
  | { readonly kind: 'summary' }
  | { readonly kind: 'set'; readonly scope: 'session' | 'month'; readonly limitUsd: number | undefined }

/** A dollar amount: digits with an optional fraction, optionally prefixed by `$`. */
const AMOUNT = /^\$?(\d+(?:\.\d+)?|\.\d+)$/

/**
 * Parse one limit argument.
 * @returns the amount, `undefined` for `off`, or `null` when the argument is neither.
 */
function parseLimit(argument: string): number | undefined | null {
  if (argument.toLowerCase() === 'off') return undefined
  const match = AMOUNT.exec(argument)
  if (match?.[1] === undefined) return null
  const limitUsd = Number(match[1])
  return Number.isFinite(limitUsd) ? limitUsd : null
}

/**
 * Parse the text after `/budget`.
 * @param rawInput - the invocation's raw input.
 * @returns the request, or `undefined` when the input matches no accepted form.
 */
export function parseBudgetInput(rawInput: string): BudgetRequest | undefined {
  const words = rawInput.trim().split(/\s+/).filter(word => word.length > 0)
  if (words.length === 0) return { kind: 'summary' }
  const monthly = words[0]?.toLowerCase() === 'month'
  const args = monthly ? words.slice(1) : words
  if (args.length !== 1 || args[0] === undefined) return undefined
  const limitUsd = parseLimit(args[0])
  if (limitUsd === null) return undefined
  return { kind: 'set', scope: monthly ? 'month' : 'session', limitUsd }
}

/** `$0.42 of $2.00`, or `$0.42` without a limit. */
function describeScope(scope: SpendScopeSummary): string {
  return scope.limitUsd === undefined
    ? formatUsd(scope.spentUsd)
    : `${formatUsd(scope.spentUsd)} of ${formatUsd(scope.limitUsd)}`
}

/**
 * The one-line `/budget` summary.
 * @param summary - the service's summary for the invoking Session.
 * @returns for example `This session: $0.42 of $2.00. This month: $3.10 of $20.00.`
 */
export function describeSummary(summary: SpendSummary): string {
  const line = `This session: ${describeScope(summary.session)}. This month: ${describeScope(summary.monthly)}.`
  const { unpricedCalls: sessionUnpriced } = summary.session
  const { unpricedCalls: monthUnpriced } = summary.monthly
  if (sessionUnpriced === 0 && monthUnpriced === 0) return line
  return `${line} Model calls with no known price, not counted: ${String(sessionUnpriced)} this session, ${String(monthUnpriced)} this month.`
}

/** Confirmation text for one applied limit change. */
function describeChange(scope: 'session' | 'month', limitUsd: number | undefined): string {
  switch (scope) {
    case 'session':
      return limitUsd === undefined
        ? 'This session has no spend limit now.'
        : `This session's spend limit is now ${formatUsd(limitUsd)}.`
    case 'month':
      return limitUsd === undefined
        ? 'There is no monthly spend limit now.'
        : `The monthly spend limit is now ${formatUsd(limitUsd)}.`
    default:
      return assertNever(scope, 'budget scope')
  }
}

/** Execute one `/budget` request. */
async function executeBudget(ctx: Context, invocation: CommandInvocation): Promise<CommandResult> {
  const request = parseBudgetInput(invocation.rawInput)
  if (request === undefined) return { kind: 'error', text: BUDGET_USAGE }
  const sessionId = invocation.agent.session.id
  switch (request.kind) {
    case 'summary':
      await ctx.spendBudget.whenSettled()
      return { kind: 'success', text: describeSummary(ctx.spendBudget.summary(sessionId)) }
    case 'set':
      if (request.scope === 'session') {
        await ctx.spendBudget.setSessionLimit(sessionId, request.limitUsd)
      } else {
        try {
          await ctx.spendBudget.setMonthlyLimit(request.limitUsd)
        } catch (error: unknown) {
          return { kind: 'error', text: `Could not change the monthly spend limit: ${error instanceof Error ? error.message : String(error)}` }
        }
      }
      return { kind: 'success', text: describeChange(request.scope, request.limitUsd) }
    default:
      return assertNever(request, 'budget request')
  }
}

/**
 * Register `/budget` for every composed human-command adapter.
 * @param ctx - context carrying the command registry and `ctx.spendBudget`.
 */
export function apply(ctx: Context): void {
  const active = new Set<Promise<CommandResult>>()
  const handler = (invocation: CommandInvocation): Promise<CommandResult> => {
    const operation = executeBudget(ctx, invocation)
    active.add(operation)
    const retire = (): void => { active.delete(operation) }
    // Both branches retire without rethrowing, so the derived observer promise
    // cannot become an unhandled mirror of an expected handler rejection.
    void operation.then(retire, retire)
    return operation
  }

  ctx.effect(function* () {
    // Drain before registration: composite teardown is LIFO, so no new
    // invocation enters while started handlers settle.
    yield async () => { await Promise.allSettled(active) }
    yield ctx.commands.register({
      definitionId: CommandDefinitionId('@deepseek-ai/dsh-command-budget'),
      name: 'budget',
      description: 'Show model spend for this session and month, or set a spend limit',
      input: { hint: '<usd> | off | month <usd> | month off' },
      handler,
    })
  }, 'command-budget lifecycle')
}
