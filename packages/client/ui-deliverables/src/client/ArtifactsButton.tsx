/**
 * The Session header's Artifacts button: opens the Artifacts page in the right
 * Sidebar and shows how many files the Session's loaded Turns delivered or
 * changed so far.
 */
import type { ReactNode } from 'react'
import { Button, IconDeliverDocRegular, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { useSessionArtifacts, type ArtifactsInjected } from './ArtifactsTab.tsx'
import type { NS } from './locales.ts'
import css from './ArtifactsButton.module.css'

/** What the button needs: the Session's artifact index and the page opener. */
export interface ArtifactsButtonInjected {
  artifacts: ArtifactsInjected['artifacts']
  /** Open, or focus, the Artifacts page in the right Sidebar. */
  openArtifacts: () => void
}

/** The button's props: the header utilities seat, its injected face, and copy. */
export type ArtifactsButtonProps = PropsRuntime<'conversation.session.header.utilities'>
  & InjectFace<ArtifactsButtonInjected> & PropsLocale<typeof NS>

/**
 * Render the header control.
 * @param props - the viewed Session, the index and opener, and localized copy.
 * @returns the button with its artifact count.
 */
export function ArtifactsButton({ sessionId, artifacts, openArtifacts, t }: ArtifactsButtonProps): ReactNode {
  const turns = useSessionArtifacts(artifacts, sessionId)
  const count = turns.reduce((total, turn) => total + turn.presented.length, 0)
  return (
    <Tooltip label={t('artifacts.open')} side="bottom" delayMs={500}>
      <Button size="sm" className={css.button} aria-label={count > 0 ? t('artifacts.openCountAria', { count: String(count) }) : t('artifacts.open')}
        data-artifacts-open onClick={openArtifacts}>
        <IconDeliverDocRegular className={css.icon} />
        {count > 0 && <span className={css.count} data-artifacts-count>{count}</span>}
      </Button>
    </Tooltip>
  )
}
