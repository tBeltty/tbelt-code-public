/** Text other plugins place before a plain composer message. */
import type { SessionId } from '@deepseek-ai/dsh-session/types'

/** One contribution placed before the typed text of a plain composer message. */
export interface ComposerMessagePrefix {
  /** Text placed before the typed message, separated from it by one blank line; it is sent and logged as part of the user message. */
  readonly text: string
  /** Called once after the Host accepted the message that carried `text`; a failed or refused send never calls it. */
  readonly commit: () => void
}

/**
 * Resolve the contribution for one Session's next plain message.
 * @param sessionId - Session the message is sent to.
 * @returns the contribution, or undefined when the provider has none.
 */
export type ComposerMessagePrefixProvider = (sessionId: SessionId) => ComposerMessagePrefix | undefined

/** The registry face other plugins reach through `ctx.conversation.prefixes`. */
export interface ComposerMessagePrefixes {
  /**
   * Add a provider consulted for every plain message that carries text or attachments; commands and empty drafts never consult it.
   * @param provider - Contribution resolver; contributions apply in registration order.
   * @returns the disposer that removes the provider.
   */
  register(provider: ComposerMessagePrefixProvider): () => void
}
