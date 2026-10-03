import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import WebRuntime from '@deepseek-ai/dsh-web'
import { TAVILY_PROVIDER_ID, TavilySearchProvider } from '@deepseek-ai/dsh-web-search-tavily'
import * as tavilyPlugin from '@deepseek-ai/dsh-web-search-tavily'
import { mapTavilyResponse, mapTavilyResult } from '../src/provider.ts'

const options = { apiKey: 'tvly-key', baseURL: 'https://api.tavily.test', searchDepth: 'basic' as const, includeAnswer: false }

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' }, ...init })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Tavily result mapping', () => {
  it('maps a full result entry', () => {
    expect(mapTavilyResult({ url: 'https://a.test', title: 'A', content: ' text ', published_date: '2026-07-01' }))
      .toEqual({ url: 'https://a.test', title: 'A', snippet: 'text', publishedAt: '2026-07-01' })
  })

  it('maps the generated answer to content and omits it when absent', () => {
    expect(mapTavilyResponse({ answer: 'summary', results: [] })).toEqual({ content: 'summary', sources: [], truncated: false })
    expect(mapTavilyResponse({ answer: null })).toEqual({ sources: [], truncated: false })
  })
})

describe('TavilySearchProvider', () => {
  it('is available only with a key and a parseable endpoint', () => {
    expect(new TavilySearchProvider(options).available()).toBe(true)
    expect(new TavilySearchProvider({ ...options, apiKey: '' }).available()).toBe(false)
    expect(new TavilySearchProvider({ ...options, baseURL: 'not a url' }).available()).toBe(false)
    expect(new TavilySearchProvider({ ...options, maxResults: 0 }).available()).toBe(false)
  })

  it('posts the query, depth, answer flag, and result bound with a bearer key', async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => jsonResponse({ results: [{ url: 'https://a.test', content: 'c' }] }))
    vi.stubGlobal('fetch', fetchMock)
    const result = await new TavilySearchProvider({ ...options, includeAnswer: true, searchDepth: 'advanced' }).search({ query: 'q', maxResults: 3 })
    expect(result).toEqual({ sources: [{ url: 'https://a.test', snippet: 'c' }], truncated: false })
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('https://api.tavily.test/search')
    expect(init).toMatchObject({ method: 'POST', redirect: 'error' })
    expect(init.headers).toMatchObject({ authorization: 'Bearer tvly-key' })
    expect(JSON.parse(init.body as string)).toEqual({ query: 'q', search_depth: 'advanced', include_answer: true, max_results: 3 })
  })

  it('maps an invalid key and an exhausted plan to distinct codes', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ detail: { error: 'Unauthorized: missing or invalid API key.' } }, { status: 401 })))
    await expect(new TavilySearchProvider(options).search({ query: 'q' }))
      .rejects.toThrow(expect.objectContaining({ code: 'WEB_PROVIDER_AUTH' }))
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ detail: { error: 'This request exceeds your plan\'s set usage limit.' } }, { status: 432 })))
    await expect(new TavilySearchProvider(options).search({ query: 'q' }))
      .rejects.toThrow(expect.objectContaining({ code: 'WEB_PROVIDER_QUOTA' }))
  })

  it('checks a candidate key with a one-result search and no answer', async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => jsonResponse({ results: [] }))
    vi.stubGlobal('fetch', fetchMock)
    await new TavilySearchProvider({ ...options, includeAnswer: true }).checkKey('candidate')
    const [, init] = fetchMock.mock.calls[0]!
    expect(init.headers).toMatchObject({ authorization: 'Bearer candidate' })
    expect(JSON.parse(init.body as string)).toMatchObject({ include_answer: false, max_results: 1 })
  })
})

describe('web-search-tavily plugin registration', () => {
  it('registers the provider into ctx.web with its credential reference (HMR-safe)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ results: [] })))
    const ctx = new Context()
    await ctx.plugin(WebRuntime, { searchProvider: TAVILY_PROVIDER_ID })
    const fiber = await ctx.plugin(tavilyPlugin, { apiKey: 'tvly-key' })
    await expect(ctx.web.search({ query: 'q' })).resolves.toMatchObject({ sources: [], truncated: false })
    expect(ctx.web.listSearchProviders(new AbortController().signal)).toEqual([{ id: 'tavily', credentialRef: 'TAVILY_API_KEY' }])
    await fiber.dispose()
    await expect(ctx.web.search({ query: 'q' }))
      .rejects.toThrow(expect.objectContaining({ code: 'WEB_PROVIDER_CONFIGURED_MISSING' }))
  })

  it('has no default export (namespace plugin export shape)', () => {
    expect('default' in tavilyPlugin).toBe(false)
  })
})
