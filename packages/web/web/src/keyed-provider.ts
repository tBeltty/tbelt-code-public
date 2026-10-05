/**
 * The base of a search provider that authenticates with a user API key: the
 * key resolution at each search and the key check share one implementation,
 * and each provider supplies only its request and its availability rules.
 * @module @deepseek-ai/dsh-web/keyed-provider
 */

import { KEY_CHECK_QUERY, requireSearchKey, searchKeySource, type SearchKeySource } from './api-key.ts'
import type { WebSearchProvider, WebSearchRequest, WebSearchResult } from './types.ts'

/** A {@link WebSearchProvider} whose key comes from a {@link SearchKeySource}. */
export abstract class KeyedSearchProvider implements WebSearchProvider {
  abstract readonly id: string
  readonly credentialRef: string | undefined
  /** Where the key is read from at each search. */
  protected readonly key: SearchKeySource

  /**
   * @param apiKey - the literal key, or its source.
   * @param label - provider name used in error messages.
   */
  constructor(apiKey: string | SearchKeySource, private readonly label: string) {
    this.key = searchKeySource(apiKey)
    this.credentialRef = this.key.ref
  }

  abstract available(): boolean

  async search(request: WebSearchRequest, signal?: AbortSignal): Promise<WebSearchResult> {
    return this.send(await requireSearchKey(this.key, this.label), request, false, signal)
  }

  async checkKey(apiKey: string, signal?: AbortSignal): Promise<void> {
    await this.send(apiKey, { query: KEY_CHECK_QUERY, maxResults: 1 }, true, signal)
  }

  /**
   * Send one search with the given key.
   * @param apiKey - the key to authenticate with.
   * @param request - the query and optional result bound.
   * @param check - true for a key check, which should request as little as the provider allows.
   * @param signal - optional cancellation signal.
   * @returns the normalized result.
   */
  protected abstract send(apiKey: string, request: WebSearchRequest, check: boolean, signal?: AbortSignal): Promise<WebSearchResult>
}
