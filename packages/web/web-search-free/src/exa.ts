/**
 * `ExaFreeSearchProvider`: a keyless `WebSearchProvider` backed by Exa's hosted
 * MCP endpoint (`web_search_exa`). It sends one JSON-RPC `tools/call` per search
 * and maps the text entries of the answer (`Title`, `URL`, `Published`,
 * `Highlights`) to portable sources.
 * @module @deepseek-ai/dsh-web-search-free/exa
 */

import { providerFailureCode, requestProviderJson, WebError } from '@deepseek-ai/dsh-web'
import type { WebSearchProvider, WebSearchRequest, WebSearchResult, WebSearchSource } from '@deepseek-ai/dsh-web'

/** Stable id this provider registers under. */
export const EXA_FREE_PROVIDER_ID = 'exa-free'

/** Default Exa MCP endpoint. */
export const EXA_FREE_DEFAULT_URL = 'https://mcp.exa.ai/mcp'

/** Resolved provider options (the plugin's `apply` supplies defaults). */
export interface ExaFreeSearchProviderOptions {
  /** Exa MCP endpoint URL. */
  url: string
  /** Result count requested when a search carries no `maxResults`. */
  count: number
  /** Longest snippet kept per source, in characters. */
  snippetChars: number
}

/** JSON-RPC answer of one `tools/call`. */
interface McpAnswer {
  result?: { content?: { type?: string; text?: string }[]; isError?: boolean }
  error?: { message?: string }
}

/**
 * Read the JSON-RPC message out of a response that is either one JSON document
 * or a server-sent-event stream carrying it in `data:` lines.
 * @param text - the response text.
 * @returns the parsed message.
 */
export function parseMcpMessage(text: string): McpAnswer {
  const data = text.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trim())
  return JSON.parse(data.length > 0 ? data.join('\n') : text) as McpAnswer
}

/**
 * Map the text of a `web_search_exa` answer to sources. Each entry starts at a
 * `Title:` line and lists `URL:`, `Published:`, `Author:`, then `Highlights:`
 * followed by page text; `N/A` marks an absent value.
 * @param text - the answer text.
 * @param snippetChars - longest snippet kept per source.
 * @returns the sources that carry a URL, in answer order.
 */
export function mapExaText(text: string, snippetChars: number): WebSearchSource[] {
  const sources: WebSearchSource[] = []
  for (const entry of text.split(/^(?=Title: )/m)) {
    const url = /^URL: (\S+)/m.exec(entry)?.[1]
    if (url === undefined) continue
    const title = /^Title: (.*)$/m.exec(entry)?.[1]?.trim() ?? ''
    const published = /^Published: (.*)$/m.exec(entry)?.[1]?.trim() ?? ''
    const highlights = /^Highlights:\s*\n([\s\S]*)$/m.exec(entry)?.[1] ?? ''
    const snippet = highlights.replace(/\s+/g, ' ').trim()
    sources.push({
      url,
      ...title.length > 0 ? { title } : {},
      ...snippet.length > 0 ? { snippet: snippet.length > snippetChars ? `${snippet.slice(0, snippetChars).trimEnd()}…` : snippet } : {},
      ...published.length > 0 && published !== 'N/A' ? { publishedAt: published } : {},
    })
  }
  return sources
}

/** The keyless Exa search provider; HTTP redirects fail as `WEB_PROVIDER_ERROR`. */
export class ExaFreeSearchProvider implements WebSearchProvider {
  readonly id = EXA_FREE_PROVIDER_ID
  readonly free = true

  constructor(private readonly options: ExaFreeSearchProviderOptions) {}

  available(): boolean {
    return URL.canParse(this.options.url)
  }

  async search(request: WebSearchRequest, signal?: AbortSignal): Promise<WebSearchResult> {
    let answer: McpAnswer
    try {
      answer = await requestProviderJson({
        label: 'Exa (free)',
        url: this.options.url,
        method: 'POST',
        headers: {},
        accept: 'application/json, text/event-stream',
        parseBody: parseMcpMessage,
        body: {
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: { name: 'web_search_exa', arguments: { query: request.query, numResults: request.maxResults ?? this.options.count } },
        },
        ...signal !== undefined ? { signal } : {},
      }) as McpAnswer
    } catch (error: unknown) {
      // No key exists to reject, so a refusal of anonymous use is a plain provider failure.
      if (error instanceof WebError && error.code === 'WEB_PROVIDER_AUTH') {
        throw new WebError(`Exa (free) refused anonymous access: ${error.message}`, 'WEB_PROVIDER_ERROR', { cause: error })
      }
      throw error
    }
    const text = (answer.result?.content ?? []).map(part => part.text ?? '').join('\n')
    if (answer.error !== undefined || answer.result?.isError === true) {
      const detail = answer.error?.message ?? text
      throw new WebError(`Exa (free) search failed: ${detail}`, providerFailureCode(0, detail))
    }
    return { sources: mapExaText(text, this.options.snippetChars), truncated: false }
  }
}
