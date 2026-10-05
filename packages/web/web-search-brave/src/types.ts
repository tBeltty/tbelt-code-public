/**
 * Wire types for the Brave Search web API
 * (`GET https://api.search.brave.com/res/v1/web/search`). Types only — no
 * runtime code. Web results arrive under `web.results[]`; each carries a URL,
 * a title, an HTML-marked `description`, and optionally `page_age`.
 *
 * @module @deepseek-ai/dsh-web-search-brave/types
 */

/** One entry of Brave's `web.results[]`. */
export interface BraveWebResult {
  url: string
  title?: string | null
  /** Snippet with `<strong>` highlight markup. */
  description?: string | null
  /** Page date as an ISO-8601 timestamp, when Brave knows it. */
  page_age?: string | null
}

/** Brave's web search response envelope; `web` is absent when nothing matched. */
export interface BraveSearchResponse {
  web?: { results?: BraveWebResult[] }
}
