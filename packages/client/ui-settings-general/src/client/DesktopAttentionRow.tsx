/** General Settings controls for native agent notifications and sleep prevention in the Desktop application. */
import { useState } from 'react'
import { Switch } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { DesktopAttentionSettings } from '../types.ts'
import css from './DesktopAttentionRow.module.css'

/** Accepted preferences and ordered mutation supplied by the settings owner. */
export interface DesktopAttentionRowInjected {
  hooks: { attention: ObservableSnapshot<DesktopAttentionSettings | undefined> }
  update(patch: Partial<DesktopAttentionSettings>): Promise<void>
}

/**
 * Render the notification and keep-awake toggles.
 * @param props - accepted preferences, writer and localized copy.
 * @returns the General Settings rows, or nothing until the shell reports the preferences.
 */
export function DesktopAttentionRow({ useAttention, update, t }:
  PropsRuntime<'settings.general.item'> & PropsLocale<'settings'> & InjectFace<DesktopAttentionRowInjected>) {
  const settings = useAttention(value => value)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  if (settings === undefined) return null
  const toggle = (patch: Partial<DesktopAttentionSettings>): void => {
    setFailed(false)
    setBusy(true)
    void update(patch).catch(() => { setFailed(true) }).finally(() => { setBusy(false) })
  }
  const rows = [
    { key: 'notifications', value: settings.notifications, title: t('attention.notifications.title'), description: t('attention.notifications.description') },
    { key: 'notifyWhenFocused', value: settings.notifyWhenFocused, title: t('attention.focused.title'), description: t('attention.focused.description') },
    { key: 'keepAwake', value: settings.keepAwake, title: t('attention.keepAwake.title'), description: t('attention.keepAwake.description') },
  ] as const
  return <>
    {rows.map(row => <div className={css.row} key={row.key}>
      <div>
        <div className={css.title}>{row.title}</div>
        <div className={css.description}>{row.description}</div>
      </div>
      <Switch checked={row.value} disabled={busy} label={row.title}
        onChange={(next) => { toggle({ [row.key]: next }) }} />
    </div>)}
    {failed && <div role="alert">{t('attention.error')}</div>}
  </>
}
