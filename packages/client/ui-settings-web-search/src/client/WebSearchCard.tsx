/**
 * The web-search page: which provider the agent searches through, and that
 * provider's key — which is written through the credentials domain, never
 * into the settings section, so the literal never rides a response.
 */

import type {} from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
import { SettingsForm, SettingsSecretField } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { formLabels, PROVIDER_NAMES, type WebSearchSettingsLocaleKey } from './locales.ts'
import type { WebSearchCardFace, WebSearchKeyStatus } from './web-search-card-controller.ts'
import css from './WebSearchCard.module.css'

/** Props the renderer binds for the web-search page. */
export type WebSearchCardProps =
  PropsRuntime<'plugins.item'>
  & PropsLocale<'settings.webSearch'>
  & InjectFace<WebSearchCardFace>

/** Base id of the provider radio group; each option is `<id>-<provider>`. */
const PROVIDER_GROUP = 'plugin-config-web-search-provider'

/**
 * Render the last key verdict, if any.
 * @param status - the controller's verdict.
 * @param t - the page's locale reader.
 * @returns the status line, or nothing while idle.
 */
function KeyStatus({ status, t }: { status: WebSearchKeyStatus; t: (key: WebSearchSettingsLocaleKey) => string }) {
  switch (status.kind) {
    case 'idle':
      return null
    case 'checking':
      return <p className={css.status} role="status">{t('checking')}</p>
    case 'missing':
      return <p className={css.error} role="status">{t('keyMissing')}</p>
    case 'quota':
      return <p className={css.status} role="status">{t('keyQuota')}<span className={css.detail}>{status.message}</span></p>
    case 'auth':
    case 'error':
      return (
        <p className={css.error} role="status">
          {t(status.kind === 'auth' ? 'keyRejected' : 'keyError')}
          <span className={css.detail}>{status.message}</span>
        </p>
      )
  }
}

/**
 * Render the web-search page's one-liner or its settings form, as the Plugins page asks.
 * @param props - the view asked for, locale copy, the form snapshot, and its actions.
 * @returns the one-liner, or the form.
 */
export function WebSearchCard(props: WebSearchCardProps) {
  const { t } = props
  const state = props.useWebSearchCard(snapshot => snapshot)
  if (props.view === 'summary') return t('description')
  const selected = state.providers.find(provider => provider.id === state.provider.text)
  const nameOf = (id: string) => {
    const key = PROVIDER_NAMES[id]
    return key === undefined ? id : t(key)
  }
  return (
    <SettingsForm labels={formLabels(t)} state={{ ...state, saving: state.saving || state.keyStatus.kind === 'checking' }} onSave={props.save} onDiscard={props.discard}>
      <fieldset className={css.field} disabled={!state.writable}>
        <legend className={css.label}>{t('provider')}</legend>
        {state.providers.length === 0
          ? <p className={css.hint}>{t('noProviders')}</p>
          : (
            <div className={css.options}>
              {state.providers.map(provider => (
                <label key={provider.id} className={css.option} htmlFor={`${PROVIDER_GROUP}-${provider.id}`}>
                  <input
                    id={`${PROVIDER_GROUP}-${provider.id}`}
                    type="radio"
                    name={PROVIDER_GROUP}
                    value={provider.id}
                    checked={provider.id === state.provider.text}
                    onChange={() => { props.edit('searchProvider', provider.id) }}
                  />
                  {nameOf(provider.id)}
                </label>
              ))}
            </div>
          )}
        <p className={css.hint}>{t('providerHint')}</p>
      </fieldset>
      {selected === undefined
        ? null
        : (
          <>
            <SettingsSecretField
              id="plugin-config-web-search-key"
              label={`${t('apiKey')} · ${nameOf(selected.id)}`}
              hint={t('apiKeyHint')}
              // The credentials domain accepts a key even when the settings
              // document itself is read-only; a key the process environment
              // supplies is what cannot be written from here.
              disabled={!selected.writable}
              text={state.apiKey.text}
              configured={selected.configured}
              stateLabel={selected.configured ? t('apiKeySet') : t('apiKeyUnset')}
              onEdit={(text) => { props.edit('apiKey', text) }}
            />
            <KeyStatus status={state.keyStatus} t={t} />
          </>
        )}
    </SettingsForm>
  )
}
