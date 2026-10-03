import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import WebRuntime from '@deepseek-ai/dsh-web'
import { BRAVE_PROVIDER_ID, BraveSearchProvider } from '@deepseek-ai/dsh-web-search-brave'
import * as bravePlugin from '@deepseek-ai/dsh-web-search-brave'
import { mapBraveResponse, mapBraveResult, plainText } from '../src/provider.ts'

const options = { apiKey: 'brave-key', baseURL: 'https://api.brave.test' }

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' }, ...init })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Brave result mapping', () => {
  it('maps a full result and strips highlight markup', () => {
    expect(mapBraveResult({
      url: 'https://a.test',
      title: 'A &amp; B',
      description: 'The <strong>salient</strong> part &quot;quoted&quot;',
      page_age: '2026-07-01T00:00:00',
    })).toEqual({ url: 'https://a.test', title: 'A & B', snippet: 'The salient part "quoted"', publishedAt: '2026-07-01T00:00:00' })
  })

  it('omits blank fields', () => {
    expect(mapBraveResult({ url: 'https://a.test', title: '', description: null })).toEqual({ url: 'https://a.test' })
  })

  it('maps a response without web results to no sources', () => {
    expect(mapBraveResponse({})).toEqual({ sources: [], truncated: false })
  })

  it('decodes the entities Brave leaves after removing tags', () => {
    expect(plainText('&lt;a&gt; &#39;x&#x27; &amp;amp;')).toBe('<a> \'x\' &amp;')
  })
})

describe('BraveSearchProvider', () => {
  it('is available only with a key, a parseable endpoint, and a count Brave accepts', () => {
    expect(new BraveSearchProvider(options).available()).toBe(true)
    expect(new BraveSearchProvider({ ...options, apiKey: '' }).available()).toBe(false)
    expect(new BraveSearchProvider({ ...options, baseURL: 'not a url' }).available()).toBe(false)
    expect(new BraveSearchProvider({ ...options, count: 21 }).available()).toBe(false)
  })

  it('sends the query, the capped count, and the key header', async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => jsonResponse({ web: { results: [{ url: 'https://a.test', description: 'd' }] } }))
    vi.stubGlobal('fetch', fetchMock)
    const result = await new BraveSearchProvider(options).search({ query: 'deep search', maxResults: 50 })
    expect(result).toEqual({ sources: [{ url: 'https://a.test', snippet: 'd' }], truncated: false })
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('https://api.brave.test/res/v1/web/search?q=deep+search&count=20')
    expect(init).toMatchObject({ method: 'GET', redirect: 'error' })
    expect(init.headers).toMatchObject({ 'x-subscription-token': 'brave-key' })
  })

  it('maps an invalid token and an exhausted plan to distinct codes', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ error: { detail: 'The provided subscription token is invalid.' } }, { status: 422 })))
    await expect(new BraveSearchProvider(options).search({ query: 'q' }))
      .rejects.toThrow(expect.objectContaining({ code: 'WEB_PROVIDER_AUTH' }))
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ error: { detail: 'Request rate limit exceeded for plan.' } }, { status: 429 })))
    await expect(new BraveSearchProvider(options).search({ query: 'q' }))
      .rejects.toThrow(expect.objectContaining({ code: 'WEB_PROVIDER_QUOTA' }))
  })

  it('checks a candidate key with a one-result search on Brave alone', async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => jsonResponse({}))
    vi.stubGlobal('fetch', fetchMock)
    await new BraveSearchProvider({ ...options, apiKey: '' }).checkKey('candidate')
    const [url, init] = fetchMock.mock.calls[0]!
    expect(new URL(url).origin).toBe('https://api.brave.test')
    expect(new URL(url).searchParams.get('count')).toBe('1')
    expect(init.headers).toMatchObject({ 'x-subscription-token': 'candidate' })
  })

  it('fails a search without a key as WEB_PROVIDER_AUTH, sending nothing', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await expect(new BraveSearchProvider({ ...options, apiKey: '' }).search({ query: 'q' }))
      .rejects.toThrow(expect.objectContaining({ code: 'WEB_PROVIDER_AUTH' }))
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('web-search-brave plugin registration', () => {
  it('registers the provider into ctx.web with its credential reference (HMR-safe)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({})))
    const ctx = new Context()
    await ctx.plugin(WebRuntime, { searchProvider: BRAVE_PROVIDER_ID })
    const fiber = await ctx.plugin(bravePlugin, { apiKey: 'brave-key' })
    await expect(ctx.web.search({ query: 'q' })).resolves.toMatchObject({ sources: [], truncated: false })
    expect(ctx.web.listSearchProviders(new AbortController().signal)).toEqual([{ id: 'brave', credentialRef: 'BRAVE_API_KEY' }])
    await fiber.dispose()
    await expect(ctx.web.search({ query: 'q' }))
      .rejects.toThrow(expect.objectContaining({ code: 'WEB_PROVIDER_CONFIGURED_MISSING' }))
  })

  it('has no default export (namespace plugin export shape)', () => {
    expect('default' in bravePlugin).toBe(false)
  })

  it('is unavailable when neither config nor the environment supplies a key', async () => {
    const prev = process.env.BRAVE_API_KEY
    delete process.env.BRAVE_API_KEY
    try {
      const ctx = new Context()
      await ctx.plugin(WebRuntime, { searchProvider: BRAVE_PROVIDER_ID })
      await ctx.plugin(bravePlugin, {})
      await expect(ctx.web.search({ query: 'q' }))
        .rejects.toThrow(expect.objectContaining({ code: 'WEB_PROVIDER_CONFIGURED_UNAVAILABLE' }))
    } finally {
      if (prev !== undefined) process.env.BRAVE_API_KEY = prev
    }
  })
})
