/**
 * Chat quotes: assistant text the user selected for the next plain message.
 * Unsent quotes live in browser memory per Session. Sending a message places
 * them before the typed text as Markdown blockquotes, so the model and the
 * Session log receive them as part of the user message.
 */
import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { SessionId } from '@deepseek-ai/dsh-session/types'

/** One unsent quote. */
export interface ChatQuote {
  /** Browser-local identity, unique within one store. */
  readonly id: number
  /** Normalized quoted text; never empty. */
  readonly text: string
  /** Normalized comment written beside the quote; undefined for a plain quote. */
  readonly comment?: string
}

/** Unsent quotes by Session, in insertion order. */
export type ChatQuoteState = Readonly<Record<SessionId, readonly ChatQuote[]>>

/** Per-Session quote memory owned by one Chat plugin instance. */
export interface ChatQuotes {
  /** Observable quote state. */
  readonly store: SnapshotStore<ChatQuoteState>
  /**
   * Append one quote to a Session; text that normalizes to empty is ignored.
   * @param sessionId - Session whose next message carries the quote.
   * @param text - Selected text.
   * @param comment - Optional comment that travels with the quote; blank text is dropped.
   */
  add(sessionId: SessionId, text: string, comment?: string): void
  /**
   * Remove quotes from a Session.
   * @param sessionId - Session that holds the quotes.
   * @param ids - Quote identities to remove.
   */
  remove(sessionId: SessionId, ids: readonly number[]): void
}

/** Shared empty list so selectors return a stable value. */
export const NO_QUOTES: readonly ChatQuote[] = []

/**
 * Normalize selected text: line endings become `\n`, trailing spaces leave each line,
 * runs of blank lines collapse to one, and the result is trimmed.
 * @param text - Raw selection text.
 * @returns normalized text, possibly empty.
 */
export function normalizeQuoteText(text: string): string {
  return text.replace(/\r\n?/g, '\n').replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n').trim()
}

/**
 * Create an empty quote memory.
 * @returns the store and its mutators.
 */
export function createChatQuotes(): ChatQuotes {
  const store = createSnapshotStore<ChatQuoteState>({})
  let nextId = 0
  return {
    store,
    add: (sessionId, text, comment) => {
      const normalized = normalizeQuoteText(text)
      if (normalized === '') return
      const normalizedComment = normalizeQuoteText(comment ?? '')
      const entry: ChatQuote = normalizedComment === ''
        ? { id: ++nextId, text: normalized }
        : { id: ++nextId, text: normalized, comment: normalizedComment }
      const state = store.getSnapshot()
      store.set({ ...state, [sessionId]: [...state[sessionId] ?? NO_QUOTES, entry] })
    },
    remove: (sessionId, ids) => {
      const state = store.getSnapshot()
      const current = state[sessionId]
      if (current === undefined) return
      const kept = current.filter(quote => !ids.includes(quote.id))
      if (kept.length === current.length) return
      const others = Object.entries(state).filter(([key]) => key !== sessionId)
      store.set(Object.fromEntries(kept.length === 0 ? others : [...others, [sessionId, kept]]))
    },
  }
}

/**
 * Format quotes as the message prefix: each quote is one Markdown blockquote, followed by its comment paragraph when
 * it has one, and entries are separated by one blank line.
 * @param quotes - Normalized quote texts with their optional comments.
 * @returns prefix text for the composer message.
 */
export function formatQuotes(quotes: readonly Pick<ChatQuote, 'text' | 'comment'>[]): string {
  return quotes.map(({ text, comment }) => {
    const block = text.split('\n').map(line => line === '' ? '>' : `> ${line}`).join('\n')
    return comment === undefined ? block : `${block}\n\n${comment}`
  }).join('\n\n')
}

/**
 * Split a sent user message into leading quotes and the remaining text. A
 * leading block counts as a quote only when every line is a blockquote line
 * and text follows it after a blank line; otherwise the message is returned
 * unchanged.
 * @param text - Joined text of one user message.
 * @returns the quotes in message order and the text after them.
 */
export function splitQuotedMessage(text: string): { readonly quotes: readonly string[]; readonly body: string } {
  const quotes: string[] = []
  let rest = text
  for (;;) {
    const end = rest.indexOf('\n\n')
    if (end === -1) break
    const lines = rest.slice(0, end).split('\n')
    if (!lines.every(line => line === '>' || line.startsWith('> '))) break
    quotes.push(lines.map(line => line === '>' ? '' : line.slice(2)).join('\n'))
    rest = rest.slice(end + 2)
  }
  if (quotes.length === 0 || rest.trim() === '') return { quotes: [], body: text }
  return { quotes, body: rest }
}
