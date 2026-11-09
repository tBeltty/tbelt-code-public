/**
 * Elements the user picked in a Browser tab for the next plain message. They
 * live in browser memory per Session; the next composer message carries the
 * unsent ones before its text and removes them, so the model and the Session
 * log receive the text of {@link formatPicks}.
 */
import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { ElementPick } from './payload.ts'

/** One unsent pick. */
export interface PendingPick {
  /** Browser-local identity, unique within one store. */
  readonly id: number
  readonly pick: ElementPick
}

/** Unsent picks by Session, in pick order. */
export type PickState = Readonly<Record<SessionId, readonly PendingPick[]>>

/** Shared empty list so selectors return a stable value. */
export const NO_PICKS: readonly PendingPick[] = []

/** Observable pick memory shared by the Browser tabs, the composer prefix, and the dock. */
export class ElementPickStore {
  /** Unsent picks by Session. */
  readonly state: SnapshotStore<PickState> = createSnapshotStore<PickState>({})
  private sequence = 0

  /**
   * Append a pick to a Session.
   * @param sessionId - Session whose next message carries the pick.
   * @param pick - clamped element.
   */
  add(sessionId: SessionId, pick: ElementPick): void {
    const state = this.state.getSnapshot()
    this.state.set({ ...state, [sessionId]: [...state[sessionId] ?? NO_PICKS, { id: ++this.sequence, pick }] })
  }

  /**
   * Remove picks from a Session.
   * @param sessionId - Session that holds the picks.
   * @param ids - identities to remove.
   */
  remove(sessionId: SessionId, ids: readonly number[]): void {
    const state = this.state.getSnapshot()
    const current = state[sessionId]
    if (current === undefined) return
    const kept = current.filter(entry => !ids.includes(entry.id))
    const others = Object.entries(state).filter(([key]) => key !== sessionId)
    this.state.set(Object.fromEntries(kept.length === 0 ? others : [...others, [sessionId, kept]]))
  }

  /**
   * List what a Session's next message carries.
   * @param sessionId - Session the message goes to.
   * @returns the unsent picks in pick order.
   */
  unsent(sessionId: SessionId): readonly PendingPick[] {
    return this.state.getSnapshot()[sessionId] ?? NO_PICKS
  }
}
