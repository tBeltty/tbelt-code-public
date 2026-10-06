/**
 * Session-wide artifact index for the Artifacts tab: every loaded Turn whose
 * Deliverables data carries a change announcement or delivered files, newest
 * Turn first. It reads the same engine-published Turn data the turn-tail cards
 * read, so the tab and the transcript never disagree about a Turn.
 */
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { ConversationTimelineSnapshot, TurnLocation } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { ChangesTurnData, DeliverablesTurnData, PresentedPath } from './turn-deliverables.ts'

/** One Turn's artifacts as the Artifacts tab lists them. */
export interface ArtifactTurn {
  readonly turn: number
  readonly changes: ChangesTurnData | null
  /** Latest declaration of each delivered path in this Turn, in first-seen path order. */
  readonly presented: readonly PresentedPath[]
}

const EMPTY: readonly ArtifactTurn[] = []

/**
 * Select one Turn's artifacts from its Deliverables data.
 * @param turn - Turn number.
 * @param data - engine-published Deliverables data, absent when the Turn recorded none.
 * @returns the Turn's artifacts, or null when it announced no change and delivered no file.
 */
export function artifactTurn(turn: number, data: Readonly<DeliverablesTurnData> | undefined): ArtifactTurn | null {
  if (data === undefined) return null
  const files = new Map<string, PresentedPath>()
  for (const file of data.presented ?? []) files.set(file.path, file)
  const changes = data.changes ?? null
  return changes === null && files.size === 0 ? null : { turn, changes, presented: [...files.values()] }
}

/**
 * Follow a Session's timeline and each loaded Turn's Deliverables data.
 *
 * The snapshot keeps its identity until a listed Turn's data value or the Turn
 * order changes, so `useSyncExternalStore` consumers re-render only for an
 * artifact change.
 * @param timeline - the Session's timeline source; undefined before the target publishes.
 * @returns an observable list of Turns with artifacts, newest first.
 */
export function sessionArtifacts(
  timeline: ObservableSnapshot<ConversationTimelineSnapshot | undefined>,
): ObservableSnapshot<readonly ArtifactTurn[]> {
  let keys: readonly unknown[] = []
  let current = EMPTY
  const turnsOf = (): readonly TurnLocation[] => {
    const snapshot = timeline.getSnapshot()
    if (snapshot === undefined) return []
    return snapshot.turnOrder.flatMap(turn => snapshot.turns.get(turn) ?? [])
  }
  const getSnapshot = (): readonly ArtifactTurn[] => {
    const turns = turnsOf()
    const next = turns.flatMap(turn => [turn.turn, turn.data.get('deliverables')])
    if (next.length === keys.length && next.every((value, index) => value === keys[index])) return current
    keys = next
    const listed: ArtifactTurn[] = []
    for (const turn of turns) {
      const entry = artifactTurn(turn.turn, turn.data.get('deliverables'))
      if (entry !== null) listed.push(entry)
    }
    current = listed.length === 0 ? EMPTY : listed.reverse()
    return current
  }
  const subscribe = (listener: () => void): (() => void) => {
    let turnStops: Array<() => void> = []
    const follow = (): void => {
      for (const stop of turnStops) stop()
      turnStops = turnsOf().map(turn => turn.data.source('deliverables').subscribe(listener))
    }
    follow()
    const stopTimeline = timeline.subscribe(() => {
      follow()
      listener()
    })
    return () => {
      stopTimeline()
      for (const stop of turnStops) stop()
    }
  }
  return { getSnapshot, subscribe }
}
