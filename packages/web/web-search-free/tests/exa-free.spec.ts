import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import WebRuntime from '@deepseek-ai/dsh-web'
import * as plugin from '@deepseek-ai/dsh-web-search-free'
import { EXA_FREE_PROVIDER_ID, ExaFreeSearchProvider } from '@deepseek-ai/dsh-web-search-free'
import { mapExaText, parseMcpMessage } from '../src/exa.ts'

const options = { url: 'https://mcp.exa.test/mcp', count: 5, snippetChars: 60 }

const ANSWER = [
  'Title: Cordis\nURL: https://github.com/cordiverse/cordis\nPublished: 2026-01-02\nAuthor: N/A\nHighlights:\nMeta-framework\n\nof composability.',
  'Title: \nURL: https://b.test/page\nPublished: N/A\nAuthor: N/A\nHighlights:\n',
  'Title: No link\nPublished: N/A',
].join('\n')

/** The `arguments` object of the first recorded `tools/call`. */
function sentArguments(fetchMock: { mock: { calls: [string, RequestInit][] } }): Record<string, unknown> {
  const body = JSON.parse(fetchMock.mock.calls[0]![1].body as string) as { params: { arguments: Record<string, unknown> } }
  return body.params.arguments
}

function sse(message: unknown): Response {
  return new Response(`event: message\ndata: ${JSON.stringify(message)}\n\n`, { status: 200, headers: { 'content-type': 'text/event-stream' } })
}

function answer(text: string): Response {
  return sse({ jsonrpc: '2.0', id: 1, result: { content: [{ type: 'text', text }] } })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Exa MCP answer parsing', () => {
  it('reads an event stream and a plain JSON message', () => {
    expect(parseMcpMessage('event: message\ndata: {"a":1}\n\n')).toEqual({ a: 1 })
    expect(parseMcpMessage('{"a":2}')).toEqual({ a: 2 })
  })

  it('maps entries to sources and drops entries without a URL', () => {
    expect(mapExaText(ANSWER, 400)).toEqual([
      { url: 'https://github.com/cordiverse/cordis', title: 'Cordis', snippet: 'Meta-framework of composability.', publishedAt: '2026-01-02' },
      { url: 'https://b.test/page' },
    ])
  })

  it('keeps an entry that lacks a title or a publication line', () => {
    expect(mapExaText('URL: https://pre.test\nTitle: A\nURL: https://a.test\nHighlights:\ntext', 400)).toEqual([
      { url: 'https://pre.test' },
      { url: 'https://a.test', title: 'A', snippet: 'text' },
    ])
  })

  it('cuts a long snippet at the configured length', () => {
    const text = `Title: T\nURL: https://a.test\nHighlights:\n${'word '.repeat(40)}`
    const [source] = mapExaText(text, 20)
    expect(source?.snippet).toBe('word word word word…')
  })
})

describe('ExaFreeSearchProvider', () => {
  it('is free, anonymous, and available while its URL parses', () => {
    const provider = new ExaFreeSearchProvider(options)
    expect(provider).toMatchObject({ id: EXA_FREE_PROVIDER_ID, free: true })
    expect(provider.available()).toBe(true)
    expect(new ExaFreeSearchProvider({ ...options, url: 'not a url' }).available()).toBe(false)
  })

  it('sends one tools/call without credentials and maps the answer', async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => answer(ANSWER))
    vi.stubGlobal('fetch', fetchMock)
    const result = await new ExaFreeSearchProvider(options).search({ query: 'cordis', maxResults: 3 })
    expect(result.sources).toHaveLength(2)
    expect(result.truncated).toBe(false)
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe(options.url)
    expect(init).toMatchObject({ method: 'POST', redirect: 'error' })
    expect(init.headers).toMatchObject({ accept: 'application/json, text/event-stream' })
    expect(Object.keys(init.headers as Record<string, string>)).not.toContain('authorization')
    expect(JSON.parse(init.body as string)).toMatchObject({
      method: 'tools/call',
      params: { name: 'web_search_exa', arguments: { query: 'cordis', numResults: 3 } },
    })
  })

  it('requests the configured count when the search carries no bound', async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => answer(''))
    vi.stubGlobal('fetch', fetchMock)
    await new ExaFreeSearchProvider(options).search({ query: 'q' }, new AbortController().signal)
    expect(sentArguments(fetchMock).numResults).toBe(5)
  })

  it('maps a rate-limit refusal to the quota code', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"error":"Rate limit exceeded"}', { status: 429 })))
    await expect(new ExaFreeSearchProvider(options).search({ query: 'q' })).rejects.toMatchObject({ code: 'WEB_PROVIDER_QUOTA' })
  })

  it('reports a refusal of anonymous access as a provider failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 403 })))
    await expect(new ExaFreeSearchProvider(options).search({ query: 'q' })).rejects.toThrow(/refused anonymous access/)
    await expect(new ExaFreeSearchProvider(options).search({ query: 'q' })).rejects.toMatchObject({ code: 'WEB_PROVIDER_ERROR' })
  })

  it('classifies a JSON-RPC error and a tool error by their wording', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => sse({ jsonrpc: '2.0', id: 1, error: { message: 'Too many requests' } })))
    await expect(new ExaFreeSearchProvider(options).search({ query: 'q' })).rejects.toMatchObject({ code: 'WEB_PROVIDER_QUOTA' })
    vi.stubGlobal('fetch', vi.fn(async () => sse({ jsonrpc: '2.0', id: 1, result: { isError: true, content: [{ type: 'text', text: 'boom' }] } })))
    await expect(new ExaFreeSearchProvider(options).search({ query: 'q' })).rejects.toMatchObject({ code: 'WEB_PROVIDER_ERROR' })
  })

  it('maps an answer without content to no sources', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => sse({ jsonrpc: '2.0', id: 1, result: { content: [{ type: 'image' }] } })))
    await expect(new ExaFreeSearchProvider(options).search({ query: 'q' })).resolves.toEqual({ sources: [], truncated: false })
  })
})

describe('web-search-free plugin', () => {
  it('registers the free provider with the defaults', async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => answer(ANSWER))
    vi.stubGlobal('fetch', fetchMock)
    const ctx = new Context()
    await ctx.plugin(WebRuntime)
    await ctx.plugin(plugin, {})
    await expect(ctx.web.search({ query: 'q' })).resolves.toMatchObject({ sources: [{ url: 'https://github.com/cordiverse/cordis' }, { url: 'https://b.test/page' }] })
    expect(fetchMock.mock.calls[0]![0]).toBe(plugin.EXA_FREE_DEFAULT_URL)
    expect(sentArguments(fetchMock).numResults).toBe(5)
  })

  it('takes the endpoint and bounds from config', async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => answer(ANSWER))
    vi.stubGlobal('fetch', fetchMock)
    const ctx = new Context()
    await ctx.plugin(WebRuntime)
    await ctx.plugin(plugin, { exaUrl: 'https://mcp.exa.test/mcp', count: 2, snippetChars: 50 })
    await ctx.web.search({ query: 'q' })
    expect(fetchMock.mock.calls[0]![0]).toBe('https://mcp.exa.test/mcp')
  })
})
