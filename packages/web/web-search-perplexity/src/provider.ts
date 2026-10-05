/**
 * Perplexity search over its OpenAI-compatible chat-completions endpoint. The generated answer
 * becomes `content`; sources prefer structured `search_results[]` and fall back to URL-only
 * `citations[]`. The wire format and native `fetch` client are provider-private and do not use
 * `ctx.llm`.
 * @module @deepseek-ai/dsh-web-search-perplexity/provider
 */

import { KeyedSearchProvider, requestProviderJson, WebError } from '@deepseek-ai/dsh-web'
import type {
  SearchKeySource,
  WebSearchRequest,
  WebSearchResult,
  WebSearchSource,
} from '@deepseek-ai/dsh-web'
import type { PerplexityResponse, PerplexitySearchResult } from './types.ts'

/** Stable id this provider registers under. */
export const PERPLEXITY_PROVIDER_ID = 'perplexity'

/** Default Perplexity endpoint; `/chat/completions` is the operation. */
export const PERPLEXITY_DEFAULT_BASE_URL = 'https://api.perplexity.ai'

/** Default search model. */
export const PERPLEXITY_DEFAULT_MODEL = 'sonar'

/** Default upper bound on generated answer tokens. */
export const PERPLEXITY_DEFAULT_MAX_TOKENS = 1024

/** Recency filter values Perplexity accepts for `search_recency_filter`. */
export type PerplexityRecency = 'day' | 'week' | 'month' | 'year'

/** Resolved provider options (the plugin's `apply` supplies env-var and constant defaults). */
export interface PerplexitySearchProviderOptions {
  /** Perplexity API key, or its source; an empty or unconfigured key makes the provider unavailable. */
  apiKey: string | SearchKeySource
  /** Endpoint base; `/chat/completions` is appended. */
  baseURL: string
  /** Search model name. */
  model: string
  /** Upper bound on generated answer tokens (`max_tokens`). */
  maxTokens: number
  /** Optional recency window sent as `search_recency_filter`; omitted = no filter. */
  searchRecency?: PerplexityRecency
}

/**
 * Map one structured Perplexity search result to a normalized source.
 *
 * @param result - one entry of the response's `search_results[]`.
 * @returns the normalized source; blank fields are omitted rather than set empty.
 */
export function mapPerplexityResult(result: PerplexitySearchResult): WebSearchSource {
  return {
    url: result.url,
    ...result.title != null && result.title.length > 0 ? { title: result.title } : {},
    ...result.snippet != null && result.snippet.length > 0 ? { snippet: result.snippet } : {},
    ...result.date != null && result.date.length > 0 ? { publishedAt: result.date } : {},
  }
}

/**
 * Map a Perplexity response envelope to a normalized search result. Prefers
 * structured `search_results[]`; falls back to URL-only `citations[]` (those
 * sources carry just a `url`) only when `search_results` is absent.
 *
 * @param response - the parsed chat-completions response body.
 * @returns the normalized result; `content` is omitted when the answer is empty.
 */
export function mapPerplexityResponse(response: PerplexityResponse): WebSearchResult {
  const content = response.choices?.[0]?.message?.content
  const sources: WebSearchSource[] = response.search_results !== undefined
    ? response.search_results.map(mapPerplexityResult)
    : (response.citations ?? []).map(url => ({ url }))
  return {
    ...content != null && content.length > 0 ? { content } : {},
    sources,
    truncated: false,
  }
}

/** The Perplexity-backed search provider; HTTP redirects fail as `WEB_PROVIDER_ERROR`. */
export class PerplexitySearchProvider extends KeyedSearchProvider {
  readonly id = PERPLEXITY_PROVIDER_ID

  constructor(private readonly options: PerplexitySearchProviderOptions) {
    super(options.apiKey, 'Perplexity')
  }

  available(): boolean {
    return this.key.configured()
      && URL.canParse(this.options.baseURL)
      && isPositiveInteger(this.options.maxTokens)
  }

  protected async send(apiKey: string, request: WebSearchRequest, check: boolean, signal?: AbortSignal): Promise<WebSearchResult> {
    const payload = await requestProviderJson({
      label: 'Perplexity',
      url: `${this.options.baseURL}/chat/completions`,
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}` },
      body: {
        model: this.options.model,
        // One answer token keeps a key check to the provider's minimum charge.
        max_tokens: check ? 1 : this.options.maxTokens,
        messages: [{ role: 'user', content: request.query }],
        ...this.options.searchRecency !== undefined ? { search_recency_filter: this.options.searchRecency } : {},
      },
      ...signal !== undefined ? { signal } : {},
    })
    try {
      return mapPerplexityResponse(payload as PerplexityResponse)
    } catch (error: unknown) {
      throw new WebError(`Perplexity returned an unprocessable response body: ${String(error)}`, 'WEB_PROVIDER_ERROR', { cause: error })
    }
  }
}

/** True for a request limit that can be sent to Perplexity (a positive whole number). */
function isPositiveInteger(value: number): boolean {
  return Number.isInteger(value) && value > 0
}
