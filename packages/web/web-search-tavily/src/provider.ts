/**
 * `TavilySearchProvider`: a `WebSearchProvider` backed by the Tavily search
 * API. It maps each result's extracted `content` to `snippet` and
 * `published_date` to `publishedAt`, and maps Tavily's generated `answer`,
 * when requested, to `content`.
 * @module @deepseek-ai/dsh-web-search-tavily/provider
 */

import { KeyedSearchProvider, requestProviderJson, WebError } from '@deepseek-ai/dsh-web'
import type {
  SearchKeySource,
  WebSearchRequest,
  WebSearchResult,
  WebSearchSource,
} from '@deepseek-ai/dsh-web'
import type { TavilyResult, TavilySearchDepth, TavilySearchResponse } from './types.ts'

/** Stable id this provider registers under. */
export const TAVILY_PROVIDER_ID = 'tavily'

/** Default Tavily endpoint; `/search` is the operation. */
export const TAVILY_DEFAULT_BASE_URL = 'https://api.tavily.com'

/** Default search depth: one credit per search. */
export const TAVILY_DEFAULT_SEARCH_DEPTH: TavilySearchDepth = 'basic'

/** Resolved provider options (the plugin's `apply` supplies credential and constant defaults). */
export interface TavilySearchProviderOptions {
  /** Tavily API key, or its source; an empty or unconfigured key makes the provider unavailable. */
  apiKey: string | SearchKeySource
  /** Endpoint base; `/search` is appended. */
  baseURL: string
  /** Search depth sent as `search_depth`. */
  searchDepth: TavilySearchDepth
  /** Whether to request Tavily's generated answer as `content`. */
  includeAnswer: boolean
  /** Default result count when a request carries no `maxResults`. */
  maxResults?: number
}

/**
 * Map one Tavily result to a normalized source.
 * @param result - one entry of Tavily's `results[]`.
 * @returns the normalized source; blank fields are omitted.
 */
export function mapTavilyResult(result: TavilyResult): WebSearchSource {
  return {
    url: result.url,
    ...result.title != null && result.title.length > 0 ? { title: result.title } : {},
    ...result.content != null && result.content.trim().length > 0 ? { snippet: result.content.trim() } : {},
    ...result.published_date != null && result.published_date.length > 0 ? { publishedAt: result.published_date } : {},
  }
}

/**
 * Map a Tavily response envelope to a normalized search result.
 * @param response - the parsed `POST /search` response body.
 * @returns the normalized result; `content` is omitted when no answer was returned.
 */
export function mapTavilyResponse(response: TavilySearchResponse): WebSearchResult {
  const answer = response.answer
  // The web service owns the final `maxResults` truncation, so this provider
  // reports `truncated: false`.
  return {
    ...answer != null && answer.length > 0 ? { content: answer } : {},
    sources: (response.results ?? []).map(mapTavilyResult),
    truncated: false,
  }
}

/** The Tavily-backed search provider; HTTP redirects fail as `WEB_PROVIDER_ERROR`. */
export class TavilySearchProvider extends KeyedSearchProvider {
  readonly id = TAVILY_PROVIDER_ID

  constructor(private readonly options: TavilySearchProviderOptions) {
    super(options.apiKey, 'Tavily')
  }

  available(): boolean {
    return this.key.configured()
      && URL.canParse(this.options.baseURL)
      && (this.options.maxResults === undefined || isPositiveInteger(this.options.maxResults))
  }

  protected async send(apiKey: string, request: WebSearchRequest, check: boolean, signal?: AbortSignal): Promise<WebSearchResult> {
    // A per-request bound wins over the configured default; either may be absent.
    const maxResults = request.maxResults ?? this.options.maxResults
    const payload = await requestProviderJson({
      label: 'Tavily',
      url: `${this.options.baseURL}/search`,
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}` },
      body: {
        query: request.query,
        search_depth: this.options.searchDepth,
        // A key check asks for no answer, which costs nothing extra.
        include_answer: !check && this.options.includeAnswer,
        ...maxResults !== undefined ? { max_results: maxResults } : {},
      },
      ...signal !== undefined ? { signal } : {},
    })
    try {
      return mapTavilyResponse(payload as TavilySearchResponse)
    } catch (error: unknown) {
      throw new WebError(`Tavily returned an unprocessable response body: ${String(error)}`, 'WEB_PROVIDER_ERROR', { cause: error })
    }
  }
}

/** True for a request limit that can be sent to Tavily (a positive whole number). */
function isPositiveInteger(value: number): boolean {
  return Number.isInteger(value) && value > 0
}
