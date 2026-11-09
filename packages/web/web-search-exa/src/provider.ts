/**
 * `ExaSearchProvider`: a `WebSearchProvider` backed by the Exa search API (`POST /search` with
 * highlight contents). It maps the first non-blank highlight to `snippet`, maps
 * `publishedDate` to `publishedAt`, drops entries without a snippet, and omits `content`
 * because Exa returns no generated answer.
 * @module @deepseek-ai/dsh-web-search-exa/provider
 */

import { KeyedSearchProvider, requestProviderJson, WebError } from '@deepseek-ai/dsh-web'
import type {
  SearchKeySource,
  WebSearchRequest,
  WebSearchResult,
  WebSearchSource,
} from '@deepseek-ai/dsh-web'
import type { ExaResult, ExaSearchResponse } from './types.ts'

/** Stable id this provider registers under. */
export const EXA_PROVIDER_ID = 'exa'

/** Default Exa search endpoint; `/search` is the operation. */
export const EXA_DEFAULT_BASE_URL = 'https://api.exa.ai'

/** Default retrieval mode: let Exa pick between keyword and neural search. */
export const EXA_DEFAULT_SEARCH_TYPE = 'auto'

/** Default number of highlight sentences requested per result. */
export const EXA_DEFAULT_HIGHLIGHTS_PER_RESULT = 1

/** Resolved provider options (the plugin's `apply` supplies env-var and constant defaults). */
export interface ExaSearchProviderOptions {
  /** Exa API key, or its source; an empty or unconfigured key makes the provider unavailable. */
  apiKey: string | SearchKeySource
  /** Endpoint base; `/search` is appended. */
  baseURL: string
  /** Retrieval mode sent as Exa's `type`. */
  searchType: 'auto' | 'keyword' | 'neural'
  /** Default result count when a request carries no `maxResults`. */
  numResults?: number
  /** Highlight sentences requested per result (Exa's `highlightsPerUrl`). */
  highlightsPerResult: number
}

/**
 * Map one Exa result to a normalized source, or `undefined` when it carries no
 * portable snippet (an entry with no highlight is dropped — the seam has no
 * other field to derive a snippet from, and inventing one would lie).
 *
 * @param result - one entry of Exa's `results[]`.
 * @returns the normalized source, or `undefined` when the entry has no
 *   non-blank highlight.
 */
export function mapExaResult(result: ExaResult): WebSearchSource | undefined {
  const snippet = result.highlights?.find(highlight => highlight.trim().length > 0)
  if (snippet === undefined) return undefined
  return {
    url: result.url,
    ...result.title != null && result.title.length > 0 ? { title: result.title } : {},
    snippet,
    ...result.publishedDate != null && result.publishedDate.length > 0 ? { publishedAt: result.publishedDate } : {},
  }
}

/**
 * Map an Exa response envelope to a normalized search result.
 *
 * @param response - the parsed `POST /search` response body.
 * @returns the normalized result; snippet-less entries are dropped
 *   ({@link mapExaResult}).
 */
export function mapExaResponse(response: ExaSearchResponse): WebSearchResult {
  const sources = (response.results ?? [])
    .map(mapExaResult)
    .filter((source): source is WebSearchSource => source !== undefined)
  // Exa returns no generated answer, so `content` is omitted. The web service owns the
  // final `maxResults` truncation, so this provider reports `truncated: false`.
  return { sources, truncated: false }
}

/** The Exa-backed search provider; HTTP redirects fail as `WEB_PROVIDER_ERROR`. */
export class ExaSearchProvider extends KeyedSearchProvider {
  readonly id = EXA_PROVIDER_ID

  constructor(private readonly options: ExaSearchProviderOptions) {
    super(options.apiKey, 'Exa')
  }

  available(): boolean {
    return this.key.configured()
      && URL.canParse(this.options.baseURL)
      && isPositiveInteger(this.options.highlightsPerResult)
      && (this.options.numResults === undefined || isPositiveInteger(this.options.numResults))
  }

  protected async send(apiKey: string, request: WebSearchRequest, _check: boolean, signal?: AbortSignal): Promise<WebSearchResult> {
    // A per-request bound wins over the configured default; either may be absent.
    const numResults = request.maxResults ?? this.options.numResults
    const payload = await requestProviderJson({
      label: 'Exa',
      url: `${this.options.baseURL}/search`,
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}` },
      body: {
        query: request.query,
        type: this.options.searchType,
        contents: { highlights: { highlightsPerUrl: this.options.highlightsPerResult } },
        ...numResults !== undefined ? { numResults } : {},
      },
      ...signal !== undefined ? { signal } : {},
    })
    try {
      return mapExaResponse(payload as ExaSearchResponse)
    } catch (error: unknown) {
      throw new WebError(`Exa returned an unprocessable response body: ${String(error)}`, 'WEB_PROVIDER_ERROR', { cause: error })
    }
  }
}

/** True for a request limit that can be sent to Exa (a positive whole number). */
function isPositiveInteger(value: number): boolean {
  return Number.isInteger(value) && value > 0
}
