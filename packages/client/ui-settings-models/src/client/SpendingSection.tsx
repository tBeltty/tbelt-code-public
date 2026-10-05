/**
 * Spending settings section: this month's spend against its limit, the
 * uncounted calls to models without a price, and the monthly limit editor.
 * The month is re-read when the section mounts and after each save.
 */

import { useEffect, useId, useState } from 'react'
import type { SpendMonthReading } from '@deepseek-ai/dsh-api-remotes/client'
import { SettingsForm, SettingsValueField } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace } from '@deepseek-ai/dsh-client-ui-slots'
import type { SpendingLimitFace } from './spending-controller.ts'
import type { ModelsKey } from './locales.ts'
import styles from './ModelsSection.module.css'

/** Injected face of the Spending section. */
export interface SpendingSectionInjected extends SpendingLimitFace {
  /**
   * Read this month's figures once accounting has settled.
   * @returns the figures, or undefined when the read fails.
   */
  readMonth: () => Promise<SpendMonthReading | undefined>
  /** Section copy. */
  t: (key: ModelsKey, params?: Record<string, string | number>) => string
}

/** Format a spend figure in US dollars to the cent. */
function usd(amount: number): string {
  if (amount > 0 && amount < 0.01) return '<$0.01'
  return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/**
 * Render the Spending section.
 * @param props - the limit form, the month read, and copy.
 * @returns the section.
 */
export function SpendingSection(props: InjectFace<SpendingSectionInjected>) {
  const { t, readMonth } = props
  const state = props.useSpendingLimit(snapshot => snapshot)
  const [month, setMonth] = useState<SpendMonthReading | undefined>(undefined)
  const fieldId = useId()
  useEffect(() => {
    if (state.saving) return
    let live = true
    void readMonth().then((next) => { if (live && next !== undefined) setMonth(next) })
    return () => { live = false }
  }, [readMonth, state.saving])
  const monthly = month?.monthly
  return (
    <div className={styles['section']}>
      <h2 className={styles['title']}>{t('spendingTitle')}</h2>
      <p className={styles['intro']}>{t('spendingIntro')}</p>
      {monthly === undefined
        ? null
        : (
          <div className={styles['spendMonth']}>
            <span className={styles['spendMonthLabel']}>{t('spendingMonth')}</span>
            <span className={styles['spendMonthValue']}>
              {monthly.limitUsd === undefined
                ? t('spendingMonthReading', { spent: usd(monthly.spentUsd) })
                : t('spendingMonthOfLimit', { spent: usd(monthly.spentUsd), limit: usd(monthly.limitUsd) })}
            </span>
            {monthly.unpricedCalls > 0
              ? <span className={styles['spendUnpriced']}>{t('spendingUnpriced', { count: monthly.unpricedCalls })}</span>
              : null}
          </div>
        )}
      <SettingsForm
        labels={{
          unavailable: t('spendingUnavailable'), readOnly: t('readOnly'),
          saveFailed: t('saveFailed'), save: t('save'), saving: t('saving'),
        }}
        state={state} onSave={props.save} onDiscard={props.discard}
      >
        <SettingsValueField
          id={fieldId} label={t('spendingMonthlyLimit')} hint={t('spendingMonthlyLimitHelp')}
          placeholder={t('spendingMonthlyLimitPlaceholder')} numeric
          overriddenLabel={t('overridden')} resetLabel={t('reset')} invalidLabel={t('spendingMonthlyLimitInvalid')}
          disabled={!state.writable || state.saving} {...state.monthlyLimitUsd}
          onEdit={(text) => { props.edit('monthlyLimitUsd', text) }}
          onReset={() => { props.resetField('monthlyLimitUsd') }}
        />
      </SettingsForm>
      <p className={styles['spendHint']}>{t('spendingSessionHint')}</p>
    </div>
  )
}
