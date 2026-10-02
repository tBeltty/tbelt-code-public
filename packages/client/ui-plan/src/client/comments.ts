/**
 * Unsent plan comments. They live in browser memory, keyed by plan document
 * address, until a review answer or a composer message carries them; the
 * Session log then records the text the model received.
 */
import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { parsePlanAddress } from './plan.ts'
import { reviewPreviewSession } from './review-preview.ts'

/** Where a comment points inside a rendered plan document. */
export interface PlanCommentAnchor {
  /** Index of the anchored block among the document's top-level rendered blocks. */
  readonly block: number
  /** Anchored text; a whole-block comment quotes the block's complete text. */
  readonly quote: string
  /** Character offset of `quote` in the block text when anchored; selects among repeated occurrences. */
  readonly offset: number
}

/** One unsent comment. */
export interface PlanComment extends PlanCommentAnchor {
  /** Browser-local identity. */
  readonly id: string
  /** The user's comment text, trimmed and non-empty. */
  readonly text: string
}

/** Unsent comments of every plan document opened in this browser runtime. */
export interface PlanCommentState {
  /** Comments per plan document address, in block and offset order; documents keep first-comment order. */
  readonly documents: Readonly<Record<string, readonly PlanComment[]>>
}

/** Observable comment memory shared by the preview, the review decision, the composer chip, and the send path. */
export type PlanCommentStore = SnapshotStore<PlanCommentState>

/** One comment with the document that owns it. */
export interface AddressedPlanComment {
  readonly address: string
  readonly comment: PlanComment
}

/** Longest excerpt, in characters, quoted before a comment in model-visible feedback. */
const EXCERPT_LIMIT = 200

/**
 * Create empty comment memory.
 * @returns a store that lives as long as the plugin fiber and is never persisted.
 */
export function createPlanCommentStore(): PlanCommentStore {
  return createSnapshotStore<PlanCommentState>({ documents: {} })
}

/**
 * Name the Session whose next message carries a document's comments.
 * @param address - Plan document address.
 * @returns the Session that submitted the plan, or undefined when the document does not accept comments.
 */
export function commentSession(address: string): SessionId | undefined {
  const plan = parsePlanAddress(address)
  if (plan !== undefined) return plan.session.kind === 'session' ? plan.session.sessionId : undefined
  return reviewPreviewSession(address)
}

/**
 * Add one comment in anchor order.
 * @param store - Comment memory.
 * @param address - Plan document address.
 * @param comment - New comment.
 */
export function addPlanComment(store: PlanCommentStore, address: string, comment: PlanComment): void {
  const list = [...store.getSnapshot().documents[address] ?? [], comment]
  list.sort((a, b) => a.block - b.block || a.offset - b.offset)
  replaceDocument(store, address, list)
}

/**
 * Replace one comment's text.
 * @param store - Comment memory.
 * @param address - Plan document address.
 * @param id - Comment identity.
 * @param text - Replacement text, trimmed and non-empty.
 */
export function updatePlanComment(store: PlanCommentStore, address: string, id: string, text: string): void {
  const list = store.getSnapshot().documents[address]
  if (list === undefined) return
  replaceDocument(store, address, list.map(comment => comment.id === id ? { ...comment, text } : comment))
}

/**
 * Remove comments; documents left without comments disappear.
 * @param store - Comment memory.
 * @param address - Plan document address.
 * @param ids - Comment identities to remove.
 */
export function removePlanComments(store: PlanCommentStore, address: string, ids: readonly string[]): void {
  const list = store.getSnapshot().documents[address]
  if (list === undefined) return
  replaceDocument(store, address, list.filter(comment => !ids.includes(comment.id)))
}

function replaceDocument(store: PlanCommentStore, address: string, list: readonly PlanComment[]): void {
  const entries = Object.entries(store.getSnapshot().documents)
  const kept = entries.some(([key]) => key === address) ? entries : [...entries, [address, list] as const]
  store.set({ documents: Object.fromEntries(kept.flatMap(([key, comments]) => {
    if (key !== address) return [[key, comments] as const]
    return list.length === 0 ? [] : [[key, list] as const]
  })) })
}

/**
 * List the comments a Session's next message carries.
 * @param documents - Current comment memory.
 * @param sessionId - Session the message goes to.
 * @returns comments in document order, then anchor order.
 */
export function sessionComments(documents: PlanCommentState['documents'], sessionId: SessionId): readonly AddressedPlanComment[] {
  return Object.entries(documents).flatMap(([address, comments]) =>
    commentSession(address) === sessionId ? comments.map(comment => ({ address, comment })) : [])
}

/**
 * Shorten an anchored quote for model-visible feedback.
 * @param quote - Anchored text.
 * @returns whitespace-collapsed text of at most {@link EXCERPT_LIMIT} characters plus an ellipsis when cut at a word boundary.
 */
export function planCommentExcerpt(quote: string): string {
  const text = quote.replace(/\s+/gu, ' ').trim()
  if (text.length <= EXCERPT_LIMIT) return text
  const cut = text.slice(0, EXCERPT_LIMIT)
  const space = cut.lastIndexOf(' ')
  return `${(space > EXCERPT_LIMIT / 2 ? cut.slice(0, space) : cut).trimEnd()}…`
}

/**
 * Format comments as the feedback text the model receives.
 * @param comments - Comments in the order the model reads them.
 * @returns one paragraph per comment: the Markdown-quoted excerpt, then the comment.
 */
export function formatPlanFeedback(comments: readonly PlanComment[]): string {
  return comments.map(comment => `> ${planCommentExcerpt(comment.quote)}\n${comment.text}`).join('\n\n')
}
