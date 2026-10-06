/** Chips above the composer for the page elements the next message carries. */
import type { ReactNode } from 'react'
import { IconCloseOutlineRegular, IconInspectOutlineRegular, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { HostObservable, InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { NO_PICKS, type PickState } from './picks.ts'
import css from './PickDock.module.css'

/** Business face of the composer pick dock. */
export interface PickDockInjected {
  readonly hooks: {
    /** Unsent picks of every Session. */
    readonly picks: HostObservable<PickState>
  }
  /**
   * Remove one unsent pick.
   * @param sessionId - Session that holds the pick.
   * @param id - pick identity.
   */
  removePick: (sessionId: PropsRuntime<'conversation.input.dock'>['sessionId'], id: number) => void
}

/**
 * Show this Session's unsent element picks above the composer; the next plain message carries them.
 * @param props - Session identity, pick memory, removal, and copy.
 * @returns the chip row, or null without picks.
 */
export function PickDock({ sessionId, usePicks, removePick, t }: Pick<PropsRuntime<'conversation.input.dock'>, 'sessionId'>
  & InjectFace<PickDockInjected> & PropsLocale<'sidebarBrowser'>): ReactNode {
  const picks = usePicks(state => state[sessionId] ?? NO_PICKS)
  if (picks.length === 0) return null
  return (
    <div className={css.dock} role="list" aria-label={t('pick.dock')} data-pick-dock="">
      {picks.map(({ id, pick }) => {
        const label = pick.target.textSnippet === '' ? `<${pick.target.tagName}>` : `<${pick.target.tagName}> ${pick.target.textSnippet}`
        return (
          <div key={id} role="listitem" className={css.chip}>
            <IconInspectOutlineRegular size={12} className={css.glyph} />
            <Tooltip label={pick.target.selector} side="top" portal maxWidth={420} delayMs={300}>
              <span className={css.text} tabIndex={0}>{label}</span>
            </Tooltip>
            <button type="button" className={css.remove} aria-label={t('pick.remove')} title={t('pick.remove')}
              onClick={() => { removePick(sessionId, id) }}>
              <IconCloseOutlineRegular size={12} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
