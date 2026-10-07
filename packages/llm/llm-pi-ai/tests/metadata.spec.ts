import { createServer } from 'node:http'
import type { Server } from 'node:http'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import LlmRuntime from '@deepseek-ai/dsh-llm'
import * as LlmPiAi from '@deepseek-ai/dsh-llm-pi-ai'
import Storage from '@deepseek-ai/dsh-storage'
import {
  apply as storageJsonApply, Config as storageJsonConfig, inject as storageJsonInject, name as storageJsonName,
} from '@deepseek-ai/dsh-storage-json'
import {
  apply as storageDomainApply, Config as storageDomainConfig, inject as storageDomainInject, name as storageDomainName,
} from '@deepseek-ai/dsh-storage-domain'
import { resolveMetadataSource } from '../src/config.ts'
import { discoverModels } from '../src/discovery.ts'
import {
  fetchModelMetadata,
  loadModelMetadata,
  metadataPricing,
  ModelMetadataStore,
  readModelMetadata,
  storeModelMetadata,
} from '../src/metadata.ts'

const servers: Server[] = []
const cleanups: Array<() => Promise<void>> = []

afterEach(async () => {
  vi.useRealTimers()
  while (cleanups.length > 0) await cleanups.pop()!()
  await Promise.all(servers.splice(0).map(server => new Promise(resolve => server.close(resolve))))
})

/** A directory in the models.dev layout with one real catalog model and one the catalog lacks. */
const directory = {
  openai: {
    id: 'openai',
    models: {
      'gpt-4.1': {
        id: 'gpt-4.1',
        name: 'GPT-4.1 (refreshed)',
        limit: { context: 123_456, output: 7_890 },
        cost: { input: 7, output: 21, cache_read: 0.7 },
      },
      'gpt-4.1-mini': { limit: { context: 111_000 } },
      'not-in-catalog': { limit: { context: 1_000 }, cost: { input: 1, output: 2 } },
    },
  },
}

interface DirectoryServer {
  url: string
  requests: number
  respond: { status: number; body: string }
}

async function directoryServer(body: unknown = directory, status = 200): Promise<DirectoryServer> {
  const state: DirectoryServer = { url: '', requests: 0, respond: { status, body: JSON.stringify(body) } }
  const server = createServer((_request, response) => {
    state.requests += 1
    response.writeHead(state.respond.status, { 'content-type': 'application/json' })
    response.end(state.respond.body)
  })
  servers.push(server)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('no port')
  state.url = `http://127.0.0.1:${address.port}/api.json`
  return state
}

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-pi-metadata-'))
  cleanups.push(() => rm(dir, { recursive: true, force: true }))
  return dir
}

async function boot(config: object, root?: string): Promise<Context> {
  const ctx = new Context()
  cleanups.push(async () => { await ctx.fiber.dispose() })
  await ctx.plugin(LlmRuntime)
  if (root !== undefined) {
    await ctx.plugin(Storage)
    await ctx.plugin({ name: storageJsonName, inject: storageJsonInject, apply: storageJsonApply, Config: storageJsonConfig }, { root })
    await ctx.plugin({ name: storageDomainName, inject: storageDomainInject, apply: storageDomainApply, Config: storageDomainConfig }, { backend: 'json' })
  }
  await ctx.plugin(LlmPiAi, config)
  return ctx
}

describe('reading a directory', () => {
  it('keeps usable entries, drops zero cache rates, and skips malformed rows', () => {
    const index = readModelMetadata({
      acme: {
        models: {
          full: { name: 'Full', limit: { context: 1000, output: 100 }, cost: { input: 1, output: 2, cache_read: 0.1, cache_write: 0 } },
          priceless: { limit: { context: 5 }, cost: { input: 1 } },
          written: { cost: { input: 1, output: 2, cache_write: 3 } },
          named: { name: 'Only a name' },
          empty: { name: '' },
          'not-an-object': 'x',
          list: [],
        },
      },
      nomodels: { models: [] },
      broken: null,
      allbad: { models: { junk: 1 } },
    })
    expect([...index.keys()]).toEqual(['acme'])
    expect(index.get('acme')?.get('full')).toEqual({
      name: 'Full', contextWindow: 1000, maxTokens: 100, pricing: { input: 1, output: 2, cacheRead: 0.1 },
    })
    expect(index.get('acme')?.get('priceless')).toEqual({ contextWindow: 5 })
    expect(index.get('acme')?.get('written')).toEqual({ pricing: { input: 1, output: 2, cacheWrite: 3 } })
    expect(index.get('acme')?.get('named')).toEqual({ name: 'Only a name' })
    expect([...index.get('acme')!.keys()]).toEqual(['full', 'priceless', 'written', 'named'])
  })

  it('refuses a document that is not an object of providers', () => {
    expect(() => readModelMetadata([])).toThrow('keyed by provider id')
    expect(() => readModelMetadata(null)).toThrow('keyed by provider id')
  })

  it('round-trips through the stored form and treats a free price as unknown', () => {
    const index = readModelMetadata(directory)
    expect(loadModelMetadata(storeModelMetadata(index))).toEqual(index)
    const store = new ModelMetadataStore()
    expect(store.revision).toBe(0)
    store.replace(index)
    expect(store.revision).toBe(1)
    expect(store.snapshot).toBe(index)
    expect(store.lookup('openai', 'gpt-4.1')?.contextWindow).toBe(123_456)
    expect(store.lookup('openai', 'missing')).toBeUndefined()
    expect(metadataPricing(undefined)).toBeUndefined()
    expect(metadataPricing({ pricing: { input: 0, output: 0 } })).toBeUndefined()
    expect(metadataPricing({ pricing: { input: 1, output: 0 } })).toEqual({ input: 1, output: 0 })
  })
})

describe('downloading a directory', () => {
  it('reads a served directory', async () => {
    const served = await directoryServer()
    const index = await fetchModelMetadata(served.url, new AbortController().signal)
    expect(index.get('openai')?.get('gpt-4.1')?.maxTokens).toBe(7_890)
  })

  it('reports an error status, a non-JSON body, and an unreachable host', async () => {
    const failing = await directoryServer({}, 503)
    await expect(fetchModelMetadata(failing.url)).rejects.toThrow('answered 503')
    const text = await directoryServer()
    text.respond.body = '<html>'
    await expect(fetchModelMetadata(text.url)).rejects.toThrow('did not answer with JSON')
    const gone = await directoryServer()
    const url = gone.url
    await Promise.all(servers.splice(0).map(server => new Promise(resolve => server.close(resolve))))
    await expect(fetchModelMetadata(url)).rejects.toThrow(`could not reach ${url}`)
  })
})

describe('configuration', () => {
  it('names no source and fetches nothing unless enabled with a usable URL', () => {
    expect(resolveMetadataSource(undefined)).toBeUndefined()
    expect(resolveMetadataSource({ enabled: false, url: 'https://example.test/api.json' })).toBeUndefined()
    expect(() => resolveMetadataSource({ enabled: true })).toThrow('needs modelMetadata.url')
    expect(() => resolveMetadataSource({ enabled: true, url: '' })).toThrow('needs modelMetadata.url')
    expect(() => resolveMetadataSource({ enabled: true, url: 'not a url' })).toThrow('not a valid URL')
    expect(() => resolveMetadataSource({ enabled: true, url: 'http://example.test/api.json' })).toThrow('must use https')
    expect(resolveMetadataSource({ enabled: true, url: 'https://example.test/api.json' }))
      .toEqual({ url: 'https://example.test/api.json', intervalHours: 24 })
    expect(resolveMetadataSource({ enabled: true, url: 'http://localhost:9/api.json', refreshIntervalHours: 6 }))
      .toEqual({ url: 'http://localhost:9/api.json', intervalHours: 6 })
  })

  it('refuses to mount an enabled section without a URL', async () => {
    const ctx = new Context()
    await ctx.plugin(LlmRuntime)
    await expect(ctx.plugin(LlmPiAi, { providers: {}, modelMetadata: { enabled: true } }))
      .rejects.toThrow('needs modelMetadata.url')
  })
})

describe('refreshed metadata in a real composition', () => {
  it('requests nothing while disabled', async () => {
    const served = await directoryServer()
    const ctx = await boot({ providers: { openai: {} }, modelMetadata: { enabled: false, url: served.url } })
    const info = await ctx.llm.resolveModelInfo('openai', 'gpt-4.1')
    expect(info.context?.contextWindow).not.toBe(123_456)
    expect(served.requests).toBe(0)
  })

  it('lets the directory refine catalog models and lets a configured entry outrank it', async () => {
    const served = await directoryServer()
    const ctx = await boot({
      providers: {
        openai: {},
        acme: {
          api: 'openai-completions',
          baseURL: 'https://acme.test/v1',
          models: [
            { id: 'not-in-catalog' },
            { id: 'priced', pricing: { input: 3, output: 4 } },
          ],
        },
      },
      modelMetadata: { enabled: true, url: served.url },
    })
    await vi.waitFor(async () => {
      const refreshed = await ctx.llm.resolveModelInfo('openai', 'gpt-4.1')
      expect(refreshed.context?.contextWindow).toBe(123_456)
    })
    await expect(ctx.llm.resolveModelInfo('openai', 'gpt-4.1')).resolves.toMatchObject({
      pricing: { input: 7, output: 21, cacheRead: 0.7 },
    })
    // The directory describes this id under `openai` only; another route's model is untouched.
    await expect(ctx.llm.resolveModelInfo('acme', 'not-in-catalog')).resolves.not.toHaveProperty('pricing')
    // The directory never adds a model to a route.
    await expect(ctx.llm.listModels('openai')).resolves.not.toContainEqual(expect.objectContaining({ id: 'not-in-catalog' }))
    await expect(ctx.llm.resolveModelInfo('acme', 'priced')).resolves.toMatchObject({ pricing: { input: 3, output: 4 } })
  })

  it('yields to a configured price and context window on the same catalog model', async () => {
    const served = await directoryServer()
    const ctx = await boot({
      providers: { openai: { modelOverrides: { 'gpt-4.1': { pricing: { input: 1, output: 2 }, contextWindow: 50_000 } } } },
      modelMetadata: { enabled: true, url: served.url },
    })
    // A sibling model the entry does not configure takes the directory's window, which shows the refresh landed.
    await vi.waitFor(async () => {
      expect((await ctx.llm.resolveModelInfo('openai', 'gpt-4.1-mini')).context?.contextWindow).toBe(111_000)
    })
    await expect(ctx.llm.resolveModelInfo('openai', 'gpt-4.1')).resolves.toMatchObject({
      pricing: { input: 1, output: 2 },
      context: { contextWindow: 50_000 },
    })
  })

  it('keeps the previous copy and warns when a refresh fails', async () => {
    const served = await directoryServer({}, 500)
    const ctx = new Context()
    cleanups.push(async () => { await ctx.fiber.dispose() })
    const warn = vi.spyOn(ctx.logger, 'warn')
    await ctx.plugin(LlmRuntime)
    await ctx.plugin(LlmPiAi, { providers: { openai: {} }, modelMetadata: { enabled: true, url: served.url } })
    await vi.waitFor(() => { expect(warn).toHaveBeenCalledWith(expect.stringContaining('keeping the previous copy')) })
    const info = await ctx.llm.resolveModelInfo('openai', 'gpt-4.1')
    expect(info.context?.contextWindow).not.toBe(123_456)
  })

  it('persists the copy, skips a fresh one on restart, and refetches a stale or foreign one', async () => {
    const root = await tempDir()
    const served = await directoryServer()
    const config = { providers: { openai: {} }, modelMetadata: { enabled: true, url: served.url, refreshIntervalHours: 1 } }
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-06T00:00:00Z'))

    const first = await boot(config, root)
    await vi.waitFor(() => { expect(served.requests).toBe(1) })
    await vi.waitFor(async () => {
      expect((await first.llm.resolveModelInfo('openai', 'gpt-4.1')).context?.contextWindow).toBe(123_456)
    })
    await first.fiber.dispose()

    // Restart inside the interval: the cached copy serves and nothing is fetched.
    served.respond.status = 500
    vi.setSystemTime(new Date('2026-10-06T00:30:00Z'))
    const second = await boot(config, root)
    await vi.waitFor(async () => {
      expect((await second.llm.resolveModelInfo('openai', 'gpt-4.1')).context?.contextWindow).toBe(123_456)
    })
    expect(served.requests).toBe(1)
    await second.fiber.dispose()

    // Restart after the interval: the copy loads first, then a refetch is attempted (and fails here).
    vi.setSystemTime(new Date('2026-10-06T03:00:00Z'))
    const third = await boot(config, root)
    await vi.waitFor(() => { expect(served.requests).toBe(2) })
    expect((await third.llm.resolveModelInfo('openai', 'gpt-4.1')).context?.contextWindow).toBe(123_456)
    await third.fiber.dispose()

    // A different source URL does not inherit the cached copy.
    const other = await directoryServer({})
    const fourth = await boot({ providers: { openai: {} }, modelMetadata: { enabled: true, url: other.url } }, root)
    await vi.waitFor(() => { expect(other.requests).toBe(1) })
    expect((await fourth.llm.resolveModelInfo('openai', 'gpt-4.1')).context?.contextWindow).not.toBe(123_456)
  })

  it('stops quietly when disposed during a fetch', async () => {
    const slow = createServer(() => { /* never answers */ })
    servers.push(slow)
    await new Promise<void>(resolve => slow.listen(0, '127.0.0.1', resolve))
    const address = slow.address()
    if (address === null || typeof address === 'string') throw new Error('no port')
    const ctx = new Context()
    const warn = vi.spyOn(ctx.logger, 'warn')
    await ctx.plugin(LlmRuntime)
    await ctx.plugin(LlmPiAi, { providers: {}, modelMetadata: { enabled: true, url: `http://127.0.0.1:${address.port}/api.json` } })
    await vi.waitFor(() => { expect(slow.listening).toBe(true) })
    await ctx.fiber.dispose()
    slow.closeAllConnections()
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(warn).not.toHaveBeenCalled()
  })

  it('refetches on the configured interval', async () => {
    const served = await directoryServer()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    await boot({ providers: {}, modelMetadata: { enabled: true, url: served.url, refreshIntervalHours: 2 } })
    await vi.waitFor(() => { expect(served.requests).toBe(1) })
    await vi.advanceTimersByTimeAsync(2 * 3_600_000)
    await vi.waitFor(() => { expect(served.requests).toBe(2) })
    await vi.advanceTimersByTimeAsync(2 * 3_600_000)
    await vi.waitFor(() => { expect(served.requests).toBe(3) })
  })

  it('continues in memory when the cache domain cannot open', async () => {
    const root = await tempDir()
    const served = await directoryServer()
    const ctx = new Context()
    cleanups.push(async () => { await ctx.fiber.dispose() })
    const warn = vi.spyOn(ctx.logger, 'warn')
    await ctx.plugin(LlmRuntime)
    await ctx.plugin(Storage)
    await ctx.plugin({ name: storageJsonName, inject: storageJsonInject, apply: storageJsonApply, Config: storageJsonConfig }, { root })
    await ctx.plugin({ name: storageDomainName, inject: storageDomainInject, apply: storageDomainApply, Config: storageDomainConfig }, { backend: 'json' })
    // A second holder of the domain name makes the plugin's own open fail.
    await ctx.get('storageDomain')!.open({ name: 'llm_pi_ai_metadata', version: 1, tables: {} } as never)
    await ctx.plugin(LlmPiAi, { providers: { openai: {} }, modelMetadata: { enabled: true, url: served.url } })
    await vi.waitFor(() => { expect(warn).toHaveBeenCalledWith(expect.stringContaining('will not persist')) })
    await vi.waitFor(async () => {
      expect((await ctx.llm.resolveModelInfo('openai', 'gpt-4.1')).context?.contextWindow).toBe(123_456)
    })
  })
})

/** A stand-in provider whose `GET /models` answers `data`; returns its base URL. */
async function listingServer(data: unknown[]): Promise<string> {
  const listing = createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ data }))
  })
  servers.push(listing)
  await new Promise<void>(resolve => listing.listen(0, '127.0.0.1', resolve))
  const address = listing.address()
  if (address === null || typeof address === 'string') throw new Error('no port')
  return `http://127.0.0.1:${address.port}`
}

describe('model discovery with a directory', () => {
  const store = new ModelMetadataStore()
  store.replace(readModelMetadata(directory))

  it('answers a catalog route with the directory\'s capacities and prices', async () => {
    const models = await discoverModels({ provider: 'openai' }, undefined, store)
    expect(models.find(model => model.id === 'gpt-4.1')).toMatchObject({
      contextWindow: 123_456, maxTokens: 7_890, pricing: { input: 7, output: 21, cacheRead: 0.7 },
    })
    const plain = await discoverModels({ provider: 'openai' })
    expect(plain.find(model => model.id === 'gpt-4.1')?.contextWindow).not.toBe(123_456)
  })

  it('replaces a catalog row of a live listing and fills a row the catalog lacks', async () => {
    const address = await listingServer([{ id: 'gpt-4.1' }, { id: 'brand-new', context_length: 20 }])
    const models = await discoverModels({ provider: 'openai', live: true, baseURL: address, api: 'openai-completions' }, undefined, store)
    expect(models.find(model => model.id === 'gpt-4.1')).toMatchObject({ contextWindow: 123_456 })
    expect(models.find(model => model.id === 'brand-new')).toEqual({ id: 'brand-new', name: 'brand-new', contextWindow: 20 })
  })

  it('fills only what a live listing row omits', async () => {
    const baseURL = await listingServer([
      { id: 'not-in-catalog' },
      { id: 'also-listed', context_length: 10, pricing: { prompt: 0.000001, completion: 0.000002 } },
      { id: 'name-only' },
      { id: 'unknown' },
    ])
    const lookup = new ModelMetadataStore()
    lookup.replace(readModelMetadata({
      acme: { models: {
        'not-in-catalog': { limit: { context: 1_000, output: 100 }, cost: { input: 1, output: 2 } },
        'also-listed': { limit: { context: 99 }, cost: { input: 9, output: 9 } },
        'name-only': { name: 'Name only' },
      } },
    }))
    const models = await discoverModels({ provider: 'acme', baseURL, api: 'openai-completions' }, undefined, lookup)
    // Not a catalog route, so the endpoint is asked and the directory only fills gaps.
    expect(models).toEqual([
      { id: 'not-in-catalog', name: 'not-in-catalog', contextWindow: 1_000, maxTokens: 100, pricing: { input: 1, output: 2 } },
      { id: 'also-listed', name: 'also-listed', contextWindow: 10, maxTokens: undefined, pricing: { input: 1, output: 2 } },
      { id: 'name-only', name: 'name-only' },
      { id: 'unknown', name: 'unknown' },
    ].map(row => Object.fromEntries(Object.entries(row).filter(([, value]) => value !== undefined))))
  })
})
