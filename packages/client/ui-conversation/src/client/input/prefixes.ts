/**
 * Composer message prefixes: the one way another plugin adds text to a plain
 * message the user sends. The composer cannot import the plugins that own such
 * text, so they register a provider here and the default send path consults
 * every provider for each message.
 */
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type {
  ComposerMessagePrefix, ComposerMessagePrefixes, ComposerMessagePrefixProvider,
} from '../contract/composer-prefixes.ts'

/** The provider registry (one instance per plugin fiber). */
export class ComposerMessagePrefixRegistry implements ComposerMessagePrefixes {
  private readonly providers = new Set<ComposerMessagePrefixProvider>()

  /** @inheritdoc */
  register(provider: ComposerMessagePrefixProvider): () => void {
    this.providers.add(provider)
    return () => { this.providers.delete(provider) }
  }

  /**
   * Collect the contributions for one message.
   * @param sessionId - Session the message is sent to.
   * @returns non-empty contributions in provider registration order.
   */
  collect(sessionId: SessionId): readonly ComposerMessagePrefix[] {
    return [...this.providers].flatMap((provider) => {
      const prefix = provider(sessionId)
      return prefix === undefined || prefix.text === '' ? [] : [prefix]
    })
  }
}
