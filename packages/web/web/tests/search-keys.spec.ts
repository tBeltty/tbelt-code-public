import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context, Service } from '@deepseek-ai/cordis'
import type { CredentialRef } from '@deepseek-ai/dsh-credentials'
import WebRuntime, {
  errorDetail,
  providerFailureCode,
  requestProviderJson,
  SearchApiKey,
  searchKeySource,
  WebError,
  type WebSearchProvider,
} from '@deepseek-ai/dsh-web'

afterEach(() => {
  vi.unstubAllGlobals()
})

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' }, ...init })
}

/** A search provider whose key check answers with `outcome`. */
function keyedProvider(id: string, outcome: () => Promise<void>): WebSearchProvider & { checked: string[] } {
  const checked: string[] = []
  return {
    id,
    credentialRef: `${id.toUpperCase()}_API_KEY`,
    checked,
    available: () => true,
    search: () => Promise.resolve({ sources: [], truncated: false }),
    checkKey: async (apiKey) => { checked.push(apiKey); await outcome() },
  }
}

describe('providerFailureCode', () => {
  it('classifies quota, credit, and rate limits as WEB_PROVIDER_QUOTA', () => {
    for (const status of [402, 429, 432, 433]) expect(providerFailureCode(status, '')).toBe('WEB_PROVIDER_QUOTA')
    expect(providerFailureCode(403, 'Key limit exceeded')).toBe('WEB_PROVIDER_QUOTA')
    expect(providerFailureCode(401, 'insufficient credits')).toBe('WEB_PROVIDER_QUOTA')
  })

  it('classifies a rejected key as WEB_PROVIDER_AUTH', () => {
    expect(providerFailureCode(401, '')).toBe('WEB_PROVIDER_AUTH')
    expect(providerFailureCode(403, 'forbidden')).toBe('WEB_PROVIDER_AUTH')
    expect(providerFailureCode(422, 'The provided subscription token is invalid')).toBe('WEB_PROVIDER_AUTH')
  })

  it('classifies everything else as WEB_PROVIDER_ERROR', () => {
    expect(providerFailureCode(400, 'bad query')).toBe('WEB_PROVIDER_ERROR')
    expect(providerFailureCode(500, '')).toBe('WEB_PROVIDER_ERROR')
  })
})

describe('errorDetail', () => {
  it('finds the provider text where each provider nests it', () => {
    expect(errorDetail({ error: 'a' })).toBe('a')
    expect(errorDetail({ error: { message: 'b' } })).toBe('b')
    expect(errorDetail({ error: { detail: 'c' } })).toBe('c')
    expect(errorDetail({ message: 'd' })).toBe('d')
    expect(errorDetail({ detail: { error: 'e' } })).toBe('e')
    expect(errorDetail({})).toBeUndefined()
    expect(errorDetail('text')).toBeUndefined()
  })
})

describe('requestProviderJson', () => {
  it('refuses redirects and sends JSON with the provider headers', async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => jsonResponse({ ok: 1 }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(requestProviderJson({ label: 'P', url: 'https://p.test/s', method: 'POST', headers: { 'x-key': 'k' }, body: { q: 1 } }))
      .resolves.toEqual({ ok: 1 })
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('https://p.test/s')
    expect(init).toMatchObject({ method: 'POST', redirect: 'error', body: '{"q":1}' })
    expect(init.headers).toMatchObject({ 'x-key': 'k', 'content-type': 'application/json', 'accept': 'application/json' })
  })

  it('words a rejected key and a quota refusal for the model', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ message: 'invalid key' }, { status: 401 })))
    await expect(requestProviderJson({ label: 'P', url: 'https://p.test', method: 'GET', headers: {} }))
      .rejects.toThrow(expect.objectContaining({
        code: 'WEB_PROVIDER_AUTH',
        message: 'P rejected the API key (HTTP 401): invalid key; the user must supply a valid key for this provider.',
      }))
    vi.stubGlobal('fetch', vi.fn(async () => new Response('slow down', { status: 429 })))
    await expect(requestProviderJson({ label: 'P', url: 'https://p.test', method: 'GET', headers: {} }))
      .rejects.toThrow(expect.objectContaining({
        code: 'WEB_PROVIDER_QUOTA',
        message: 'P refused the search for quota, credit, or rate limits (HTTP 429).',
      }))
  })
})

describe('WebRuntime search keys', () => {
  it('lists only providers that take and check a user key', async () => {
    const ctx = new Context()
    await ctx.plugin(WebRuntime, {})
    ctx.web.registerSearchProvider(keyedProvider('brave', () => Promise.resolve()))
    ctx.web.registerSearchProvider({ id: 'plain', available: () => true, search: () => Promise.resolve({ sources: [], truncated: false }) })
    expect(ctx.web.listSearchProviders(new AbortController().signal)).toEqual([{ id: 'brave', credentialRef: 'BRAVE_API_KEY' }])
  })

  it('reports a key check as ok, auth, quota, or error', async () => {
    const ctx = new Context()
    await ctx.plugin(WebRuntime, {})
    const signal = new AbortController().signal
    const good = keyedProvider('good', () => Promise.resolve())
    ctx.web.registerSearchProvider(good)
    ctx.web.registerSearchProvider(keyedProvider('auth', () => Promise.reject(new WebError('rejected', 'WEB_PROVIDER_AUTH'))))
    ctx.web.registerSearchProvider(keyedProvider('quota', () => Promise.reject(new WebError('no credit', 'WEB_PROVIDER_QUOTA'))))
    ctx.web.registerSearchProvider(keyedProvider('down', () => Promise.reject(new WebError('HTTP 500', 'WEB_PROVIDER_ERROR'))))
    await expect(ctx.web.checkSearchKey('good', '  k1  ', signal)).resolves.toEqual({ ok: true })
    expect(good.checked).toEqual(['k1'])
    await expect(ctx.web.checkSearchKey('auth', 'k', signal)).resolves.toEqual({ ok: false, reason: 'auth', message: 'rejected' })
    await expect(ctx.web.checkSearchKey('quota', 'k', signal)).resolves.toEqual({ ok: false, reason: 'quota', message: 'no credit' })
    await expect(ctx.web.checkSearchKey('down', 'k', signal)).resolves.toEqual({ ok: false, reason: 'error', message: 'HTTP 500' })
    await expect(ctx.web.checkSearchKey('missing', 'k', signal)).resolves.toMatchObject({ ok: false, reason: 'error' })
    await expect(ctx.web.checkSearchKey('good', ' ', signal)).resolves.toMatchObject({ ok: false, reason: 'auth' })
    expect(good.checked).toEqual(['k1'])
  })

  it('rethrows a cancelled key check instead of reporting it', async () => {
    const ctx = new Context()
    await ctx.plugin(WebRuntime, {})
    ctx.web.registerSearchProvider(keyedProvider('slow', () => Promise.reject(new WebError('aborted', 'WEB_ABORTED'))))
    await expect(ctx.web.checkSearchKey('slow', 'k', new AbortController().signal))
      .rejects.toThrow(expect.objectContaining({ code: 'WEB_ABORTED' }))
  })

  it('tells the model how to enable search when no provider is usable', async () => {
    const ctx = new Context()
    await ctx.plugin(WebRuntime, {})
    await expect(ctx.web.search({ query: 'q' })).rejects.toThrow(expect.objectContaining({
      code: 'WEB_PROVIDER_UNAVAILABLE',
      message: 'no usable web provider is registered; web search needs the user to choose a search provider and add its API key',
    }))
  })
})

/** A credentials service double over an in-memory map. */
class FakeCredentials extends Service {
  /** The instance the last mount created. */
  static mounted: FakeCredentials | undefined
  readonly values = new Map<string, string>()
  constructor(ctx: Context) {
    super(ctx, 'credentials')
    FakeCredentials.mounted = this
  }

  async resolve(ref: CredentialRef): Promise<{ value: string; source: string } | undefined> {
    const value = this.values.get(ref)
    return value === undefined ? undefined : { value, source: 'test' }
  }

  async describe(ref: CredentialRef): Promise<{ configured: boolean; writable: boolean }> {
    return { configured: this.values.has(ref), writable: true }
  }

  write(ref: string, value: string): void {
    this.values.set(ref, value)
    this.ctx.emit('credentials/reference-updated', ref as CredentialRef)
  }
}

describe('SearchApiKey', () => {
  it('tracks whether the reference is configured and resolves it at each call', async () => {
    const ctx = new Context()
    await ctx.plugin(FakeCredentials)
    const credentials = FakeCredentials.mounted!
    const key = new SearchApiKey(ctx, 'TEST_SEARCH_KEY', undefined)
    await vi.waitFor(() => { expect(key.configured()).toBe(false) })
    await expect(key.resolve()).resolves.toBeUndefined()
    credentials.write('TEST_SEARCH_KEY', 'secret')
    await vi.waitFor(() => { expect(key.configured()).toBe(true) })
    await expect(key.resolve()).resolves.toBe('secret')
    expect(key.ref).toBe('TEST_SEARCH_KEY')
  })

  it('prefers a literal from configuration', async () => {
    const key = new SearchApiKey(new Context(), 'TEST_SEARCH_KEY', 'literal')
    expect(key.configured()).toBe(true)
    await expect(key.resolve()).resolves.toBe('literal')
  })

  it('normalizes a literal option into a source', async () => {
    expect(searchKeySource('').configured()).toBe(false)
    await expect(searchKeySource('k').resolve()).resolves.toBe('k')
    expect(searchKeySource('k').ref).toBeUndefined()
  })
})

describe('WebRuntime volatile searchProvider', () => {
  it('serves the pinned provider when several are usable', async () => {
    const ctx = new Context()
    await ctx.plugin(WebRuntime, { searchProvider: 'b' })
    ctx.web.registerSearchProvider({ id: 'a', available: () => true, search: () => Promise.resolve({ content: 'a', sources: [], truncated: false }) })
    ctx.web.registerSearchProvider({ id: 'b', available: () => true, search: () => Promise.resolve({ content: 'b', sources: [], truncated: false }) })
    await expect(ctx.web.search({ query: 'q' })).resolves.toMatchObject({ content: 'b' })
  })
})
