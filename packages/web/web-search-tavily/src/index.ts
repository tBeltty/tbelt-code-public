/**
 * Tavily-backed `WebSearchProvider` plugin. It contributes to the `ctx.web`
 * registry without owning the service.
 *
 * @module @deepseek-ai/dsh-web-search-tavily
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { SearchApiKey } from '@deepseek-ai/dsh-web'
import { TAVILY_DEFAULT_BASE_URL, TAVILY_DEFAULT_SEARCH_DEPTH, TavilySearchProvider } from './provider.ts'

export { TAVILY_DEFAULT_BASE_URL, TAVILY_DEFAULT_SEARCH_DEPTH, TAVILY_PROVIDER_ID, TavilySearchProvider } from './provider.ts'
export type { TavilySearchProviderOptions } from './provider.ts'
export type { TavilySearchDepth } from './types.ts'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'web-search-tavily'

/** The web seam this provider registers into. */
export const inject = ['web']

/** Credential reference the key is read from when config carries no literal. */
export const TAVILY_API_KEY_REF = 'TAVILY_API_KEY'

/** Plugin config (all optional — `apply` fills credential and constant defaults). */
export interface Config {
  /** Literal Tavily API key; prefer {@link apiKeyEnv} so no secret enters configuration files. */
  apiKey?: string
  /** Credential reference resolved at each search. Defaults to `TAVILY_API_KEY`. */
  apiKeyEnv?: string
  /** Endpoint base; `/search` is appended. Defaults to the public API. */
  baseURL?: string
  /** Search depth: `basic` (one credit) or `advanced` (two). Defaults to `basic`. */
  searchDepth?: 'basic' | 'advanced'
  /** Request Tavily's generated answer as the result's `content`. Defaults to false. */
  includeAnswer?: boolean
  /** Default result count when a request carries no `maxResults`. Omitted = Tavily's default. */
  maxResults?: number
}

export const Config: z<Config> = z.object({
  apiKey: z.string().role('secret'),
  apiKeyEnv: z.string().role('credential-ref'),
  baseURL: z.string(),
  searchDepth: z.union(['basic', 'advanced'] as const),
  includeAnswer: z.boolean(),
  maxResults: z.number().step(1).min(1),
})

/** Register the Tavily search provider with `ctx.web`. */
export function apply(ctx: Context, config: Config): void {
  ctx.web.registerSearchProvider(new TavilySearchProvider({
    apiKey: new SearchApiKey(ctx, config.apiKeyEnv ?? TAVILY_API_KEY_REF, config.apiKey),
    baseURL: config.baseURL ?? TAVILY_DEFAULT_BASE_URL,
    searchDepth: config.searchDepth ?? TAVILY_DEFAULT_SEARCH_DEPTH,
    includeAnswer: config.includeAnswer ?? false,
    ...config.maxResults !== undefined ? { maxResults: config.maxResults } : {},
  }))
}
