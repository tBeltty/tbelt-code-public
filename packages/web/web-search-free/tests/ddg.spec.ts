import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import WebRuntime from '@deepseek-ai/dsh-web'
import * as plugin from '@deepseek-ai/dsh-web-search-free'
import { DDG_PROVIDER_ID, DuckDuckGoSearchProvider } from '@deepseek-ai/dsh-web-search-free'
import { htmlText, mapDuckDuckGoPage, resultUrl } from '../src/ddg.ts'

const options = { url: 'https://ddg.test/html/', userAgent: 'Mozilla/5.0 (compatible; test)', minIntervalMs: 0, snippetChars: 40 }

function result(classes: string, href: string, title: string, snippet?: string): string {
  return `<div class="${classes}"><div class="links_main result__body"><h2 class="result__title">`
    + `<a rel="nofollow" class="result__a" href="${href}">${title}</a></h2>`
    + `${snippet === undefined ? '' : `<a class="result__snippet" href="${href}">${snippet}</a>`}</div></div>`
}

const PAGE = [
  '<html><body><div id="links" class="results">',
  result('result results_links web-result ', 'https://a.test/page', 'A &amp; <b>B</b>', 'The <b>first</b> &#39;hit&#39; &#x41;'),
  result('result result--ad', 'https://ad.test', 'Sponsored', 'Buy now'),
  result('result results_links', '//duckduckgo.com/l/?uddg=https%3A%2F%2Fb.test%2Fx%3Fq%3D1&amp;rut=abc', 'Wrapped'),
  result('result results_links', 'javascript:void(0)', 'Bad link', 'skip'),
  '<div class="result results_links"><div class="result__body">no link</div></div>',
  result('result results_links', 'https://c.test', '', 'word '.repeat(30)),
  '</div></body></html>',
].join('\n')

function page(body: string, init: ResponseInit = {}): Response {
  return new Response(body, { status: 200, headers: { 'content-type': 'text/html' }, ...init })
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('DuckDuckGo page parsing', () => {
  it('turns markup into text and decodes entities', () => {
    expect(htmlText('<b>a</b> &amp; &lt;&#65;&#x42;&nbsp;&unknown; z')).toBe('a & <AB &unknown; z')
  })

  it('resolves direct and wrapped result links and refuses others', () => {
    expect(resultUrl('https://a.test/x')).toBe('https://a.test/x')
    expect(resultUrl('//duckduckgo.com/l/?uddg=https%3A%2F%2Fb.test%2F&amp;rut=1')).toBe('https://b.test/')
    expect(resultUrl('//duckduckgo.com/l/?rut=1')).toBeUndefined()
    expect(resultUrl('//duckduckgo.com/l/?uddg=javascript%3Aalert(1)')).toBeUndefined()
    expect(resultUrl('/relative')).toBeUndefined()
    expect(resultUrl('javascript:void(0)')).toBeUndefined()
  })

  it('maps organic results in page order and skips sponsored and unusable entries', () => {
    expect(mapDuckDuckGoPage(PAGE, 40)).toEqual([
      { url: 'https://a.test/page', title: 'A & B', snippet: 'The first \'hit\' A' },
      { url: 'https://b.test/x?q=1', title: 'Wrapped' },
      { url: 'https://c.test', snippet: 'word word word word word word word word…' },
    ])
  })

  it('maps a page without results to no sources', () => {
    expect(mapDuckDuckGoPage('<html>No results.</html>', 40)).toEqual([])
  })
})

describe('DuckDuckGoSearchProvider', () => {
  it('is free and available while its URL parses', () => {
    const provider = new DuckDuckGoSearchProvider(options)
    expect(provider).toMatchObject({ id: DDG_PROVIDER_ID, free: true })
    expect(provider.available()).toBe(true)
    expect(new DuckDuckGoSearchProvider({ ...options, url: 'not a url' }).available()).toBe(false)
  })

  it('posts the query as a form with the configured identifier and maps the page', async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => page(PAGE))
    vi.stubGlobal('fetch', fetchMock)
    const result = await new DuckDuckGoSearchProvider(options).search({ query: 'deep search' }, new AbortController().signal)
    expect(result.sources).toHaveLength(3)
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe(options.url)
    expect(init).toMatchObject({ method: 'POST', redirect: 'error', body: 'q=deep+search' })
    expect(init.headers).toMatchObject({ 'user-agent': options.userAgent })
  })

  it('reports a challenge or block as a rate limit', async () => {
    for (const status of [202, 403, 429]) {
      vi.stubGlobal('fetch', vi.fn(async () => page('', { status })))
      await expect(new DuckDuckGoSearchProvider(options).search({ query: 'q' })).rejects.toMatchObject({ code: 'WEB_PROVIDER_QUOTA' })
    }
  })

  it('reports other statuses, network failures, and unreadable bodies as provider errors', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => page('', { status: 500 })))
    await expect(new DuckDuckGoSearchProvider(options).search({ query: 'q' })).rejects.toMatchObject({ code: 'WEB_PROVIDER_ERROR' })
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline') }))
    await expect(new DuckDuckGoSearchProvider(options).search({ query: 'q' })).rejects.toMatchObject({ code: 'WEB_PROVIDER_ERROR' })
    const broken = { ok: true, status: 200, text: () => Promise.reject(new Error('reset')) }
    vi.stubGlobal('fetch', vi.fn(async () => broken as unknown as Response))
    await expect(new DuckDuckGoSearchProvider(options).search({ query: 'q' })).rejects.toMatchObject({ code: 'WEB_PROVIDER_ERROR' })
  })

  it('reports a cancelled or timed-out request as aborted', async () => {
    for (const name of ['AbortError', 'TimeoutError']) {
      vi.stubGlobal('fetch', vi.fn(async () => { throw new DOMException('stopped', name) }))
      await expect(new DuckDuckGoSearchProvider(options).search({ query: 'q' })).rejects.toMatchObject({ code: 'WEB_ABORTED' })
    }
  })

  it('spaces consecutive requests by the configured interval', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => page(PAGE))
    vi.stubGlobal('fetch', fetchMock)
    const provider = new DuckDuckGoSearchProvider({ ...options, minIntervalMs: 1000 })
    await provider.search({ query: 'one' })
    const second = provider.search({ query: 'two' })
    await vi.advanceTimersByTimeAsync(999)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    await second
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('stops waiting for its slot when cancelled', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn(async () => page(PAGE)))
    const provider = new DuckDuckGoSearchProvider({ ...options, minIntervalMs: 1000 })
    await provider.search({ query: 'one' })
    const controller = new AbortController()
    const second = provider.search({ query: 'two' }, controller.signal)
    const outcome = expect(second).rejects.toMatchObject({ code: 'WEB_ABORTED' })
    controller.abort()
    await outcome
  })
})

describe('web-search-free plugin with both providers', () => {
  it('falls back from Exa to DuckDuckGo and honors the switches', async () => {
    const fetchMock = vi.fn(async (url: string, _init: RequestInit) =>
      url.includes('exa') ? new Response('{}', { status: 429 }) : page(PAGE))
    vi.stubGlobal('fetch', fetchMock)
    const ctx = new Context()
    await ctx.plugin(WebRuntime)
    await ctx.plugin(plugin, { exaUrl: 'https://exa.test/mcp', duckduckgoUrl: 'https://ddg.test/html/', duckduckgoMinIntervalMs: 0 })
    await expect(ctx.web.search({ query: 'q' })).resolves.toMatchObject({ sources: [{ url: 'https://a.test/page' }, {}, {}] })
    expect(fetchMock.mock.calls.map(call => call[0])).toEqual(['https://exa.test/mcp', 'https://ddg.test/html/'])
  })

  it('registers only the enabled providers', async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => page(PAGE))
    vi.stubGlobal('fetch', fetchMock)
    const ctx = new Context()
    await ctx.plugin(WebRuntime)
    await ctx.plugin(plugin, { exa: false, duckduckgoUrl: 'https://ddg.test/html/' })
    await ctx.web.search({ query: 'q' })
    expect(fetchMock.mock.calls.map(call => call[0])).toEqual(['https://ddg.test/html/'])
    const other = new Context()
    await other.plugin(WebRuntime)
    await other.plugin(plugin, { duckduckgo: false, exa: false })
    await expect(other.web.search({ query: 'q' })).rejects.toMatchObject({ code: 'WEB_PROVIDER_UNAVAILABLE' })
  })
})
