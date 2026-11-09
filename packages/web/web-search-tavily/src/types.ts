/**
 * Wire types for the Tavily search API (`POST https://api.tavily.com/search`).
 * Types only — no runtime code. Tavily returns a flat `results[]` of URL,
 * title, extracted `content`, and optionally `published_date`, plus an
 * `answer` when one was requested.
 *
 * @module @deepseek-ai/dsh-web-search-tavily/types
 */

/** Search depth Tavily accepts: `basic` costs one credit, `advanced` two. */
export type TavilySearchDepth = 'basic' | 'advanced'

/** One entry of Tavily's `results[]`. */
export interface TavilyResult {
  url: string
  title?: string | null
  /** Extracted page text most relevant to the query. */
  content?: string | null
  /** Publication date; Tavily returns it for news results. */
  published_date?: string | null
}

/** Tavily's search response envelope. */
export interface TavilySearchResponse {
  /** Generated answer, present when `include_answer` was requested. */
  answer?: string | null
  results?: TavilyResult[]
}
