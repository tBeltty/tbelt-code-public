/** Sign-in action on the DeepSeek Account row of the Models page. */
import { useState } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-settings-models/client'
import type { AccountSectionInjected } from './AccountSection.tsx'
import css from './AccountProviderSignIn.module.css'

/** Composed props of the account sign-in seat on a provider card. */
export type AccountProviderSignInProps =
  PropsRuntime<'settings.models.provider-card'> & PropsLocale<'settings.account'> & InjectFace<AccountSectionInjected>

/**
 * Offer the account login beside the provider row while no account is signed in. The login dialog itself is owned
 * by the settings launcher, which renders it from the same account snapshot.
 * @param props - account snapshot hook, login start and localized copy.
 * @returns the sign-in prompt, or nothing while signed in or before the first account frame.
 */
export function AccountProviderSignIn({ useAccount, start, t }: AccountProviderSignInProps) {
  const account = useAccount(value => value)
  const [failed, setFailed] = useState(false)
  if (account.view === undefined || account.view.status === 'credential-stored') return null
  const attempt = account.view.attempt
  const running = attempt !== null && attempt !== undefined
    && ['initializing', 'waiting-browser', 'exchanging', 'committing'].includes(attempt.phase)
  return (
    <div className={css.root}>
      <span className={css.copy} role="status">{failed || account.loginFailed ? t('failed') : t('providerSignIn')}</span>
      <Button variant="primary" disabled={running} onClick={() => {
        setFailed(false)
        // The snapshot publishes `loginFailed` before start rejects, so the card only reports the refusal.
        start().catch(() => { setFailed(true) })
      }}>{t('signIn')}</Button>
    </div>
  )
}
