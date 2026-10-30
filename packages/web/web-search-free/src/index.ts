/**
 * Keyless search providers for the `ctx.web` registry. They need no account or
 * API key, so a fresh install can search; the web service uses them only when
 * no provider with a key is usable, trying them in registration order.
 * @module @deepseek-ai/dsh-web-search-free
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { DDG_DEFAULT_URL, DuckDuckGoSearchProvider } from './ddg.ts'
import { EXA_FREE_DEFAULT_URL, ExaFreeSearchProvider } from './exa.ts'

export { EXA_FREE_DEFAULT_URL, EXA_FREE_PROVIDER_ID, ExaFreeSearchProvider } from './exa.ts'
export type { ExaFreeSearchProviderOptions } from './exa.ts'
export { DDG_DEFAULT_URL, DDG_PROVIDER_ID, DuckDuckGoSearchProvider } from './ddg.ts'
export type { DuckDuckGoSearchProviderOptions } from './ddg.ts'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'web-search-free'

/** The web seam these providers register into. */
export const inject = ['web']

/** Plugin config (all optional — `apply` fills the defaults). */
export interface Config {
  /** Register the Exa provider. Defaults to true. */
  exa?: boolean
  /** Exa MCP endpoint URL. Defaults to the public endpoint. */
  exaUrl?: string
  /** Result count when a search carries no `maxResults`. Defaults to 5. */
  count?: number
  /** Register the DuckDuckGo provider, tried after Exa. Defaults to true. */
  duckduckgo?: boolean
  /** DuckDuckGo HTML results endpoint. Defaults to the public endpoint. */
  duckduckgoUrl?: string
  /** `User-Agent` sent to DuckDuckGo. Defaults to a compatible browser-style identifier naming the product. */
  duckduckgoUserAgent?: string
  /** Shortest time between two DuckDuckGo requests, in milliseconds. Defaults to 2000. */
  duckduckgoMinIntervalMs?: number
  /** Longest snippet kept per source, in characters. Defaults to 400. */
  snippetChars?: number
}

export const Config: z<Config> = z.object({
  exa: z.boolean(),
  exaUrl: z.string(),
  count: z.number().step(1).min(1).max(25),
  duckduckgo: z.boolean(),
  duckduckgoUrl: z.string(),
  duckduckgoUserAgent: z.string(),
  duckduckgoMinIntervalMs: z.number().step(1).min(0),
  snippetChars: z.number().step(1).min(50),
})

/** Register the enabled keyless providers with `ctx.web`, Exa first. */
export function apply(ctx: Context, config: Config): void {
  const snippetChars = config.snippetChars ?? 400
  if (config.exa !== false) {
    ctx.web.registerSearchProvider(new ExaFreeSearchProvider({
      url: config.exaUrl ?? EXA_FREE_DEFAULT_URL,
      count: config.count ?? 5,
      snippetChars,
    }))
  }
  if (config.duckduckgo !== false) {
    ctx.web.registerSearchProvider(new DuckDuckGoSearchProvider({
      url: config.duckduckgoUrl ?? DDG_DEFAULT_URL,
      userAgent: config.duckduckgoUserAgent ?? 'Mozilla/5.0 (compatible; tBeltCode)',
      minIntervalMs: config.duckduckgoMinIntervalMs ?? 2000,
      snippetChars,
    }))
  }
}
