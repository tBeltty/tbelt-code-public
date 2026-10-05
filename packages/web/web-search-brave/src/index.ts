/**
 * Brave Search-backed `WebSearchProvider` plugin. It contributes to the
 * `ctx.web` registry without owning the service.
 *
 * @module @deepseek-ai/dsh-web-search-brave
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { SearchApiKey } from '@deepseek-ai/dsh-web'
import { BRAVE_DEFAULT_BASE_URL, BRAVE_MAX_COUNT, BraveSearchProvider } from './provider.ts'

export { BRAVE_DEFAULT_BASE_URL, BRAVE_MAX_COUNT, BRAVE_PROVIDER_ID, BraveSearchProvider } from './provider.ts'
export type { BraveSearchProviderOptions } from './provider.ts'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'web-search-brave'

/** The web seam this provider registers into. */
export const inject = ['web']

/** Credential reference the key is read from when config carries no literal. */
export const BRAVE_API_KEY_REF = 'BRAVE_API_KEY'

/** Plugin config (all optional — `apply` fills credential and constant defaults). */
export interface Config {
  /** Literal Brave Search API key; prefer {@link apiKeyEnv} so no secret enters configuration files. */
  apiKey?: string
  /** Credential reference resolved at each search. Defaults to `BRAVE_API_KEY`. */
  apiKeyEnv?: string
  /** Endpoint base; `/res/v1/web/search` is appended. Defaults to the public API. */
  baseURL?: string
  /** Default result count when a request carries no `maxResults`. Omitted = Brave's default. */
  count?: number
}

export const Config: z<Config> = z.object({
  apiKey: z.string().role('secret'),
  apiKeyEnv: z.string().role('credential-ref'),
  baseURL: z.string(),
  count: z.number().step(1).min(1).max(BRAVE_MAX_COUNT),
})

/** Register the Brave Search provider with `ctx.web`. */
export function apply(ctx: Context, config: Config): void {
  ctx.web.registerSearchProvider(new BraveSearchProvider({
    apiKey: new SearchApiKey(ctx, config.apiKeyEnv ?? BRAVE_API_KEY_REF, config.apiKey),
    baseURL: config.baseURL ?? BRAVE_DEFAULT_BASE_URL,
    ...config.count !== undefined ? { count: config.count } : {},
  }))
}
