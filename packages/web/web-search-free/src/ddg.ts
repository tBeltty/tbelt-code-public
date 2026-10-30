/**
 * `DuckDuckGoSearchProvider`: a keyless `WebSearchProvider` that reads the
 * public HTML results page (`html.duckduckgo.com/html`). DuckDuckGo offers no
 * search API, so the page markup is the interface: result links carry the
 * class `result__a`, snippets `result__snippet`, and sponsored results
 * `result--ad`. Requests are spaced apart and a challenge page is reported as
 * a rate limit so the service moves on instead of retrying.
 * @module @deepseek-ai/dsh-web-search-free/ddg
 */

import { WebError } from '@deepseek-ai/dsh-web'
import type { WebSearchProvider, WebSearchRequest, WebSearchResult, WebSearchSource } from '@deepseek-ai/dsh-web'

/** Stable id this provider registers under. */
export const DDG_PROVIDER_ID = 'ddg-html'

/** Default results page endpoint. */
export const DDG_DEFAULT_URL = 'https://html.duckduckgo.com/html/'

/** Resolved provider options (the plugin's `apply` supplies defaults). */
export interface DuckDuckGoSearchProviderOptions {
  /** Results page endpoint URL. */
  url: string
  /** `User-Agent` header; the page answers a bare tool name with a challenge. */
  userAgent: string
  /** Shortest time between two requests of this provider, in milliseconds. */
  minIntervalMs: number
  /** Longest snippet kept per source, in characters. */
  snippetChars: number
}

const ENTITIES: Readonly<Record<string, string>> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: '\'', nbsp: ' ' }

/**
 * Turn an HTML fragment into plain text: tags removed, entities decoded.
 * @param html - a fragment such as a link body.
 * @returns the text with whitespace collapsed.
 */
export function htmlText(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code: string) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&([a-z]+);/gi, (match, name: string) => ENTITIES[name.toLowerCase()] ?? match)
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Resolve a result link. DuckDuckGo sometimes wraps the target in a redirect
 * link whose `uddg` parameter holds it.
 * @param href - the `href` of a result link.
 * @returns the target URL, or undefined when it is not an http(s) URL.
 */
export function resultUrl(href: string): string | undefined {
  const decoded = href.replace(/&amp;/g, '&')
  const absolute = decoded.startsWith('//') ? `https:${decoded}` : decoded
  if (!URL.canParse(absolute)) return undefined
  const url = new URL(absolute)
  const target = url.hostname.endsWith('duckduckgo.com') && url.pathname.startsWith('/l/') ? url.searchParams.get('uddg') : absolute
  return target !== null && /^https?:\/\//.test(target) ? target : undefined
}

/**
 * Map a results page to sources.
 * @param html - the page body.
 * @param snippetChars - longest snippet kept per source.
 * @returns the organic results in page order; sponsored results are skipped.
 */
export function mapDuckDuckGoPage(html: string, snippetChars: number): WebSearchSource[] {
  const sources: WebSearchSource[] = []
  for (const block of html.split(/<div class="result(?= )/).slice(1)) {
    if (/^[^"]*result--ad/.test(block)) continue
    const link = /<a [^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/.exec(block) as [string, string, string] | null
    const url = link === null ? undefined : resultUrl(link[1])
    if (link === null || url === undefined) continue
    const title = htmlText(link[2])
    const snippet = htmlText(/<a [^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/.exec(block)?.[1] ?? '')
    sources.push({
      url,
      ...title.length > 0 ? { title } : {},
      ...snippet.length > 0 ? { snippet: snippet.length > snippetChars ? `${snippet.slice(0, snippetChars).trimEnd()}…` : snippet } : {},
    })
  }
  return sources
}

/** Wait `ms` milliseconds, or reject with `WEB_ABORTED` when `signal` fires first. */
function pause(ms: number, signal: AbortSignal | undefined): Promise<void> {
  return new Promise((resolve, reject) => {
    const abort = (): void => {
      clearTimeout(timer)
      reject(new WebError('DuckDuckGo search aborted', 'WEB_ABORTED'))
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', abort)
      resolve()
    }, ms)
    signal?.addEventListener('abort', abort, { once: true })
  })
}

/** The keyless DuckDuckGo search provider; HTTP redirects fail as `WEB_PROVIDER_ERROR`. */
export class DuckDuckGoSearchProvider implements WebSearchProvider {
  readonly id = DDG_PROVIDER_ID
  readonly free = true
  /** End of the spacing window: the earliest time the next request may start. */
  private nextSlot = 0

  constructor(private readonly options: DuckDuckGoSearchProviderOptions) {}

  available(): boolean {
    return URL.canParse(this.options.url)
  }

  async search(request: WebSearchRequest, signal?: AbortSignal): Promise<WebSearchResult> {
    // Claim the slot before waiting so concurrent searches queue instead of bursting.
    const start = Math.max(Date.now(), this.nextSlot)
    this.nextSlot = start + this.options.minIntervalMs
    if (start > Date.now()) await pause(start - Date.now(), signal)
    let response: Response
    try {
      response = await fetch(this.options.url, {
        method: 'POST',
        redirect: 'error',
        headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': this.options.userAgent, 'accept': 'text/html' },
        body: new URLSearchParams({ q: request.query }).toString(),
        ...signal === undefined ? {} : { signal },
      })
    } catch (error: unknown) {
      if (error instanceof DOMException && (error.name === 'AbortError' || error.name === 'TimeoutError')) {
        throw new WebError('DuckDuckGo search aborted', 'WEB_ABORTED', { cause: error })
      }
      throw new WebError(`DuckDuckGo search request failed: ${String(error)}`, 'WEB_PROVIDER_ERROR', { cause: error })
    }
    // The page answers 202 with a challenge instead of results once it suspects automation.
    if (response.status === 202 || response.status === 403 || response.status === 429) {
      throw new WebError(`DuckDuckGo refused the search for rate limits or bot checks (HTTP ${response.status}).`, 'WEB_PROVIDER_QUOTA')
    }
    if (!response.ok) throw new WebError(`DuckDuckGo API error (HTTP ${response.status})`, 'WEB_PROVIDER_ERROR')
    let html: string
    try {
      html = await response.text()
    } catch (error: unknown) {
      throw new WebError(`DuckDuckGo returned an unprocessable response body: ${String(error)}`, 'WEB_PROVIDER_ERROR', { cause: error })
    }
    return { sources: mapDuckDuckGoPage(html, this.options.snippetChars), truncated: false }
  }
}
