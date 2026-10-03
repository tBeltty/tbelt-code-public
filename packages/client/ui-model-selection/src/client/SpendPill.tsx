/**
 * Composer spend reading under the composer card: the budget Session's priced
 * spend, with its limit when one is set. Hovering names the month's spend and
 * limit and the model calls left uncounted for want of a price; a click opens
 * the Spending section of Settings while a settings shell provides it. Nothing
 * renders until the Session has spent, has an uncounted call, or has a limit.
 */
import { useEffect, useState } from 'react'
import type { SpendScopeSummary, SpendSummaryReading } from '@deepseek-ai/dsh-api-remotes/client'
import { Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { SpendPillInjected } from './slots.ts'
import css from './SpendPill.module.css'

/**
 * Format a spend figure in US dollars to the cent, keeping a non-zero amount
 * under one cent visible as such.
 * @param usd - amount in US dollars.
 * @returns the amount with a leading `$`.
 */
export function formatSpend(usd: number): string {
  if (usd > 0 && usd < 0.01) return '<$0.01'
  return `$${usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/** One scope's spend, followed by its limit when one is set. */
function scopeReading(scope: SpendScopeSummary, t: PropsLocale<'model'>['t']): string {
  return scope.limitUsd === undefined
    ? formatSpend(scope.spentUsd)
    : t('spend.ofLimit', { spent: formatSpend(scope.spentUsd), limit: formatSpend(scope.limitUsd) })
}

/**
 * Build the hover text for one summary.
 * @param summary - the Session's and the month's figures.
 * @param t - model namespace translator.
 * @returns localized sentences joined for the tooltip.
 */
export function spendTitle(summary: SpendSummaryReading, t: PropsLocale<'model'>['t']): string {
  const lines = [
    t('spend.session', { reading: scopeReading(summary.session, t) }),
    t('spend.month', { reading: scopeReading(summary.monthly, t) }),
  ]
  if (summary.session.unpricedCalls > 0) {
    lines.push(t('spend.unpriced', { count: summary.session.unpricedCalls }))
  }
  return lines.join(' · ')
}

/**
 * Render the composer spend reading.
 * @param props - injected reads and the locale seat.
 * @returns the reading, or nothing before the Session has anything to show.
 */
export function SpendPill({ read, subscribe, spendSettings, t }: SpendPillInjected & PropsLocale<'model'>) {
  const [summary, setSummary] = useState<SpendSummaryReading | undefined>(undefined)
  useEffect(() => {
    let latest = 0
    const refresh = (): void => {
      const request = ++latest
      void read().then((next) => {
        if (request === latest && next !== undefined) setSummary(next)
      })
    }
    refresh()
    const dispose = subscribe(refresh)
    return () => {
      latest = Number.NaN
      dispose()
    }
  }, [read, subscribe])
  if (summary === undefined) return null
  const { session } = summary
  if (session.spentUsd === 0 && session.unpricedCalls === 0 && session.limitUsd === undefined) return null
  const reached = session.limitUsd !== undefined && session.spentUsd >= session.limitUsd
  const label = (
    <>
      <span className={css.amount}>{scopeReading(session, t)}</span>
      {session.unpricedCalls > 0 && <span className={css.unpriced} aria-hidden />}
    </>
  )
  const title = spendTitle(summary, t)
  const open = spendSettings()
  return (
    <div className={css.root} data-composer-spend data-reached={reached || undefined}>
      <Tooltip label={title} side="top" delayMs={300}>
        {open === undefined
          ? <span className={css.pill} aria-label={title}>{label}</span>
          : <button type="button" className={css.pill} aria-label={title} onClick={open}>{label}</button>}
      </Tooltip>
    </div>
  )
}
