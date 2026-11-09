/**
 * `BraveSearchProvider`: a `WebSearchProvider` backed by the Brave Search web
 * API. It maps `description` (highlight markup removed) to `snippet` and
 * `page_age` to `publishedAt`, and omits `content` because Brave's web
 * endpoint returns no generated answer.
 * @module @deepseek-ai/dsh-web-search-brave/provider
 */

import { KeyedSearchProvider, requestProviderJson, WebError } from '@deepseek-ai/dsh-web'
import type {
  SearchKeySource,
  WebSearchRequest,
  WebSearchResult,
  WebSearchSource,
} from '@deepseek-ai/dsh-web'
import type { BraveSearchResponse, BraveWebResult } from './types.ts'

/** Stable id this provider registers under. */
export const BRAVE_PROVIDER_ID = 'brave'

/** Default Brave Search endpoint; `/res/v1/web/search` is the operation. */
export const BRAVE_DEFAULT_BASE_URL = 'https://api.search.brave.com'

/** Brave's upper bound on the `count` parameter. */
export const BRAVE_MAX_COUNT = 20

/** Resolved provider options (the plugin's `apply` supplies credential and constant defaults). */
export interface BraveSearchProviderOptions {
  /** Brave Search API key, or its source; an empty or unconfigured key makes the provider unavailable. */
  apiKey: string | SearchKeySource
  /** Endpoint base; `/res/v1/web/search` is appended. */
  baseURL: string
  /** Default result count when a request carries no `maxResults`. */
  count?: number
}

/**
 * Remove Brave's highlight markup and decode the entities it leaves.
 * @param text - a `description` or `title` as Brave returns it.
 * @returns plain text.
 */
export function plainText(text: string): string {
  return text
    .replace(/<[^>]*>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, '\'')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

/**
 * Map one Brave web result to a normalized source.
 * @param result - one entry of Brave's `web.results[]`.
 * @returns the normalized source; blank fields are omitted.
 */
export function mapBraveResult(result: BraveWebResult): WebSearchSource {
  const title = result.title != null ? plainText(result.title) : ''
  const snippet = result.description != null ? plainText(result.description).trim() : ''
  return {
    url: result.url,
    ...title.length > 0 ? { title } : {},
    ...snippet.length > 0 ? { snippet } : {},
    ...result.page_age != null && result.page_age.length > 0 ? { publishedAt: result.page_age } : {},
  }
}

/**
 * Map a Brave response envelope to a normalized search result.
 * @param response - the parsed web search response body.
 * @returns the normalized result, with no `content`.
 */
export function mapBraveResponse(response: BraveSearchResponse): WebSearchResult {
  // The web service owns the final `maxResults` truncation, so this provider
  // reports `truncated: false`.
  return { sources: (response.web?.results ?? []).map(mapBraveResult), truncated: false }
}

/** The Brave-backed search provider; HTTP redirects fail as `WEB_PROVIDER_ERROR`. */
export class BraveSearchProvider extends KeyedSearchProvider {
  readonly id = BRAVE_PROVIDER_ID

  constructor(private readonly options: BraveSearchProviderOptions) {
    super(options.apiKey, 'Brave Search')
  }

  available(): boolean {
    return this.key.configured()
      && URL.canParse(this.options.baseURL)
      && (this.options.count === undefined || isCount(this.options.count))
  }

  protected async send(apiKey: string, request: WebSearchRequest, _check: boolean, signal?: AbortSignal): Promise<WebSearchResult> {
    const url = new URL(`${this.options.baseURL}/res/v1/web/search`)
    url.searchParams.set('q', request.query)
    // A per-request bound wins over the configured default; Brave caps `count`.
    const count = request.maxResults ?? this.options.count
    if (count !== undefined) url.searchParams.set('count', String(Math.min(count, BRAVE_MAX_COUNT)))
    const payload = await requestProviderJson({
      label: 'Brave Search',
      url: url.href,
      method: 'GET',
      headers: { 'x-subscription-token': apiKey },
      ...signal !== undefined ? { signal } : {},
    })
    try {
      return mapBraveResponse(payload as BraveSearchResponse)
    } catch (error: unknown) {
      throw new WebError(`Brave Search returned an unprocessable response body: ${String(error)}`, 'WEB_PROVIDER_ERROR', { cause: error })
    }
  }
}

/** True for a result count Brave accepts (a whole number from 1 to {@link BRAVE_MAX_COUNT}). */
function isCount(value: number): boolean {
  return Number.isInteger(value) && value > 0 && value <= BRAVE_MAX_COUNT
}
