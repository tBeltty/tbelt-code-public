/**
 * The Artifacts page body: the Session's delivered files grouped by Turn,
 * newest Turn first, with the same cards the transcript shows under each
 * closing reply. A delivered file previews in a Sidebar tab beside this page.
 * Code changes never appear here: they stay a quiet added/removed count on the
 * tool row and the transcript's changed-files line.
 */
import { useCallback, useSyncExternalStore, type ReactNode } from 'react'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { InjectFace, PropsLocale, PropsRenderSlots, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { IconDeliverDocRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { fileAddressFor } from '@deepseek-ai/dsh-util-workspace-path'
import { Deliverables, type DeliverablesInjected } from './Deliverables.tsx'
import type { ArtifactTurn } from './session-artifacts.ts'
import type { NS } from './locales.ts'
import css from './ArtifactsTab.module.css'

/** The Artifacts page draws no code changes whatever the developer-tools setting says. */
function hideCodeDiff<T>(select: (value: boolean) => T): T {
  return select(false)
}

const NO_ARTIFACTS: ObservableSnapshot<readonly ArtifactTurn[]> = {
  getSnapshot: () => [],
  subscribe: () => () => {},
}

/** The Session-wide artifact index, on top of the delivery cards' own face. */
export interface ArtifactsInjected extends DeliverablesInjected {
  /**
   * Resolve one Session's artifact index.
   * @param sessionId - the viewed Session.
   * @returns an identity-stable source, or undefined while the Session is not bound in this window.
   */
  artifacts: (sessionId: SessionId) => ObservableSnapshot<readonly ArtifactTurn[]> | undefined
}

/** The body's composed props: the tab it draws, its injected face, its action seat, and its copy. */
export type ArtifactsTabProps = PropsRuntime<'sidebar.right.pane.tab'> & InjectFace<ArtifactsInjected>
  & PropsLocale<typeof NS> & PropsRenderSlots<'deliverables.artifacts.file.actions'>

/**
 * Read one Session's artifact index and follow its changes.
 * @param artifacts - the injected resolver.
 * @param sessionId - the viewed Session.
 * @returns Turns with artifacts, newest first.
 */
export function useSessionArtifacts(
  artifacts: ArtifactsInjected['artifacts'], sessionId: SessionId,
): readonly ArtifactTurn[] {
  const source = artifacts(sessionId) ?? NO_ARTIFACTS
  const subscribe = useCallback((listener: () => void) => source.subscribe(listener), [source])
  return useSyncExternalStore(subscribe, () => source.getSnapshot())
}

/**
 * Render the Session's artifacts by Turn, or one line when no loaded Turn has any.
 * @param props - the tab, the delivery cards' face, and localized copy.
 * @returns the page body.
 */
export function ArtifactsTab(props: ArtifactsTabProps): ReactNode {
  const { useTabInfo, sessionId, useSessions, artifacts, renderSlot, t } = props
  const { tab } = useTabInfo()
  const cwd = useSessions(state => state.byId[sessionId]?.cwd)
  const turns = useSessionArtifacts(artifacts, sessionId)
    .filter(turn => turn.presented.length > 0)
  const openFile = (path: string): void => { tab.actions.openResource(fileAddressFor(sessionId, cwd, path)) }
  if (turns.length === 0) {
    return (
      <div className={css.root} data-artifacts-empty>
        <div className={css.empty}>
          <IconDeliverDocRegular className={css.emptyIcon} />
          <p className={css.emptyTitle}>{t('artifacts.emptyTitle')}</p>
          <p className={css.emptyBody}>{t('artifacts.emptyBody')}</p>
        </div>
      </div>
    )
  }
  return (
    <div className={css.root}>
      <ol className={css.turns}>
        {turns.map(turn => (
          <li key={turn.turn} className={css.turn} data-artifacts-turn={turn.turn}>
            <h3 className={css.turnTitle}>{t('artifacts.turn', { turn: String(turn.turn) })}</h3>
            <Deliverables {...props} useShowCodeDiff={hideCodeDiff} matched={turn} openFile={openFile}
              renderFileActions={owner => renderSlot('deliverables.artifacts.file.actions', owner)} />
          </li>
        ))}
      </ol>
    </div>
  )
}
