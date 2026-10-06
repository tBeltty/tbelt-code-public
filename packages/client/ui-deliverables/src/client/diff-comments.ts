/**
 * Line comments on a turn's changed files. They live in browser memory per
 * Session; the next plain composer message or the review tab's send action
 * carries the unsent ones and marks them sent, and the Session log records the
 * text the model received. The record fields and the `File / Line / User
 * comment` text follow Orca's `diff-comment-types.ts` and
 * `diff-comments-format.ts` (MIT, see `LICENSES/Orca-MIT.txt`).
 */
import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { SessionId } from '@deepseek-ai/dsh-session/types'

/** One comment on a line of the modified side of a changed file. */
export interface DiffComment {
  /** Browser-local identity. */
  readonly id: string
  /** The file as the review tab names it: workspace-relative, or `~`-relative outside the workspace. */
  readonly filePath: string
  /** Line number in the file after the turn. */
  readonly lineNumber: number
  /** The user's comment text, trimmed and non-empty. */
  readonly body: string
  /** Set once a sent message carried the comment; editing the comment clears it. */
  readonly sentAt?: number
}

/** Comments of every Session reviewed in this browser runtime, in creation order. */
export type DiffCommentState = Readonly<Record<string, readonly DiffComment[]>>

/**
 * Format one comment as the text the model receives.
 * @param comment - the comment to format.
 * @returns the file, line, and quoted comment with backslashes, quotes, and line breaks escaped.
 */
export function formatDiffComment(comment: DiffComment): string {
  const escaped = comment.body
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')
  return [`File: ${comment.filePath}`, `Line: ${comment.lineNumber}`, `User comment: "${escaped}"`].join('\n')
}

/**
 * Format comments as one message.
 * @param comments - comments in the order the model reads them.
 * @returns the formatted comments separated by blank lines.
 */
export function formatDiffComments(comments: readonly DiffComment[]): string {
  return comments.map(formatDiffComment).join('\n\n')
}

/** Observable comment memory shared by the review tab, the composer prefix, and the send action. */
export class DiffCommentStore {
  readonly state: SnapshotStore<DiffCommentState> = createSnapshotStore<DiffCommentState>({})
  private sequence = 0

  /**
   * Add a comment.
   * @param sessionId - Session that owns the reviewed file.
   * @param filePath - file as the review tab names it.
   * @param lineNumber - line number after the turn.
   * @param body - trimmed, non-empty comment text.
   */
  add(sessionId: SessionId, filePath: string, lineNumber: number, body: string): void {
    this.sequence += 1
    this.write(sessionId, list => [...list, { id: `diff-comment-${this.sequence}`, filePath, lineNumber, body }])
  }

  /**
   * Replace a comment's text and make it unsent again.
   * @param sessionId - Session that owns the comment.
   * @param id - comment identity.
   * @param body - trimmed, non-empty comment text.
   */
  update(sessionId: SessionId, id: string, body: string): void {
    this.write(sessionId, list => list.map(({ id: current, filePath, lineNumber, ...rest }) =>
      current === id ? { id, filePath, lineNumber, body } : { id: current, filePath, lineNumber, ...rest }))
  }

  /**
   * Remove a comment.
   * @param sessionId - Session that owns the comment.
   * @param id - comment identity.
   */
  remove(sessionId: SessionId, id: string): void {
    this.write(sessionId, list => list.filter(comment => comment.id !== id))
  }

  /**
   * List the comments a Session's next message carries.
   * @param sessionId - Session the message goes to.
   * @returns the unsent comments in creation order.
   */
  unsent(sessionId: SessionId): readonly DiffComment[] {
    return (this.state.getSnapshot()[sessionId] ?? []).filter(comment => comment.sentAt === undefined)
  }

  /**
   * Mark comments as carried by an accepted message.
   * @param sessionId - Session that owns the comments.
   * @param ids - identities of the comments the message carried.
   */
  markSent(sessionId: SessionId, ids: readonly string[]): void {
    const sentAt = Date.now()
    this.write(sessionId, list => list.map(comment => ids.includes(comment.id) ? { ...comment, sentAt } : comment))
  }

  private write(sessionId: SessionId, change: (list: readonly DiffComment[]) => readonly DiffComment[]): void {
    const state = this.state.getSnapshot()
    this.state.set({ ...state, [sessionId]: change(state[sessionId] ?? []) })
  }
}
