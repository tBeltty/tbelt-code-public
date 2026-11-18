/**
 * Endpoint and credential of the Search and Fetch APIs: each capability follows the DeepSeek API-key route
 * unless it has its own base URL or key reference, and readiness answers what the operation would send.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context, FiberState } from '@deepseek-ai/cordis'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { DSH_LAUNCH_ENVIRONMENT_KEY, createLaunchEnvironmentSnapshot } from '@deepseek-ai/dsh-launch-environment'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import WebRuntime from '@deepseek-ai/dsh-web'
import * as webApiPlugin from '@deepseek-ai/dsh-web-deepseek-api'
import { provideRoutes, type RouteRow } from './routes.ts'

/** A value the API-key route resolver throws instead of resolving; undefined lets it resolve normally. */
const resolverThrow = vi.hoisted(() => ({ value: undefined as string | undefined }))

vi.mock('@deepseek-ai/dsh-llm-deepseek-api-key', async (importOriginal) => {
  const original = await importOriginal<typeof import('@deepseek-ai/dsh-llm-deepseek-api-key')>()
  return {
    ...original,
    resolveAdapterOptions: (...args: Parameters<typeof original.resolveAdapterOptions>) => {
      if (resolverThrow.value !== undefined) throw resolverThrow.value
      return original.resolveAdapterOptions(...args)
    },
  }
})

type Operation = 'search' | 'fetch'

const OPERATIONS: readonly Operation[] = ['search', 'fetch']
const OFFICIAL = 'https://api.deepseek.com/v1/tools'
const ROUTE = 'https://route.deepseek.test/v1/tools'
const OWN = 'https://own.deepseek.test/api/v1/tools'

const mounted: Context[] = []

afterEach(async () => {
  vi.unstubAllGlobals()
  resolverThrow.value = undefined
  await Promise.all(mounted.splice(0).map(ctx => ctx.fiber.dispose()))
})

interface Setup {
  /** web-deepseek-api config. */
  config?: Record<string, unknown>
  /** Launch-environment variables. */
  environment?: Record<string, string>
  /** Model routes the provider directory lists. */
  routes?: readonly RouteRow[]
  /** Credentials service stand-in. */
  credentials?: object
  /** API response status. */
  status?: number
}

/** One dispatched request: endpoint and credential header. */
interface Sent {
  endpoint: string
  authorization: string | null
}

/**
 * Mount both APIs with stubbed endpoints.
 * @param setup - config, routes, and credential planes.
 * @returns the context and the requests sent so far.
 */
async function mount(setup: Setup): Promise<{ ctx: Context; sent: () => Sent[] }> {
  const fetchMock = vi.fn(async (endpoint: string, _init?: RequestInit) => new Response(
    JSON.stringify(setup.status === undefined ? endpoint.endsWith('/search') ? { results: [] } : { content: '# Page' } : {}),
    { status: setup.status ?? 200, headers: { 'content-type': 'application/json' } },
  ))
  vi.stubGlobal('fetch', fetchMock)
  const ctx = new Context()
  mounted.push(ctx)
  ctx.provide(DSH_LAUNCH_ENVIRONMENT_KEY, createLaunchEnvironmentSnapshot([{ source: 'process', values: setup.environment ?? {} }]))
  if (setup.credentials !== undefined) ctx.provide('credentials', setup.credentials as never)
  if (setup.routes !== undefined) provideRoutes(ctx, setup.routes)
  await ctx.plugin(SessionStore)
  await ctx.plugin(SessionProjectionRegistry)
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(WebRuntime, { searchProvider: 'deepseek-search-api', fetchProvider: 'deepseek-fetch-api' })
  await ctx.plugin(webApiPlugin, setup.config ?? {})
  return {
    ctx,
    sent: () => fetchMock.mock.calls.map(([endpoint, init]) => {
      const headers = new Headers(init?.headers)
      return { endpoint, authorization: headers.get('authorization') }
    }),
  }
}

let sessions = 0

/**
 * Run one operation, inside a Session whose latest model request used `route` when one is given.
 * @param ctx - the mounted context.
 * @param operation - search or fetch.
 * @param route - provider route of the initiating Session's latest model request; undefined runs outside a Session.
 * @returns the settled operation.
 */
async function operate(ctx: Context, operation: Operation, route?: string): Promise<unknown> {
  const run = () => operation === 'search' ? ctx.web.search({ query: 'q' }) : ctx.web.fetch({ url: 'https://example.test/' })
  if (route === undefined) return await run()
  const session = ctx.sessions.create(SessionId(`web-api-${String(sessions++)}`))
  session.append('turn/start', { turn: 1 })
  session.append('request/context', { provider: route, model: 'test-model' })
  return await ctx.agents.withInitiator({ session } as Agent, run)
}

/** Ask whether one operation is ready for a model request on `route`. */
function ready(ctx: Context, operation: Operation, route: string | undefined): Promise<boolean> {
  return operation === 'search' ? ctx.web.searchReady(route) : ctx.web.fetchReady(route)
}

const officialRoute = (config: Record<string, unknown> = { baseURL: 'https://route.deepseek.test/anthropic' }): RouteRow =>
  ({ provider: 'deepseek-official', config })

describe.each(OPERATIONS)('%s following the DeepSeek API-key route', (operation) => {
  const others = ['deepseek-official', 'moonshotai', undefined] as const

  it.each(others)('sends the key of the DeepSeek API-key route to its origin for route %s', async (route) => {
    const { ctx, sent } = await mount({ routes: [officialRoute()], environment: { DEEPSEEK_API_KEY: 'chat-key' } })
    expect(await ready(ctx, operation, route)).toBe(true)
    await operate(ctx, operation, route)
    expect(sent()).toEqual([{ endpoint: `${ROUTE}/${operation}`, authorization: 'Bearer chat-key' }])
  })

  it('is not ready and names the Models page and the reference when the key is missing', async () => {
    const subject = operation === 'search' ? 'Search' : 'Fetch'
    const { ctx, sent } = await mount({ routes: [officialRoute()] })
    for (const route of others) expect(await ready(ctx, operation, route)).toBe(false)
    await expect(operate(ctx, operation)).rejects.toMatchObject({
      code: 'WEB_PROVIDER_CREDENTIAL_MISSING',
      message: `DeepSeek ${subject} API uses the DeepSeek API key, and no key is configured for "DEEPSEEK_API_KEY". Guide the`
        + ' user to add the DeepSeek API key on the Models page or export "DEEPSEEK_API_KEY" in the launching environment.',
    })
    expect(sent()).toEqual([])
  })

  it('sends the key under the route apiKeyEnv to the origin DEEPSEEK_BASE_URL names, from the credential store', async () => {
    const { ctx, sent } = await mount({
      routes: [officialRoute({ apiKeyEnv: 'TEAM_KEY' })],
      credentials: { describe: async (ref: string) => ({ configured: ref === 'TEAM_KEY' }), resolve: async (ref: string) => ref === 'TEAM_KEY' ? { value: 'team-key' } : undefined },
      environment: { DEEPSEEK_API_KEY: 'chat-key', DEEPSEEK_BASE_URL: 'https://internal.deepseek.test/anthropic' },
    })
    expect(await ready(ctx, operation, 'deepseek-official')).toBe(true)
    await operate(ctx, operation, 'deepseek-official')
    expect(sent()).toEqual([{ endpoint: `https://internal.deepseek.test/v1/tools/${operation}`, authorization: 'Bearer team-key' }])
  })

  it.each<[string, readonly RouteRow[] | undefined]>([
    ['no model provider directory is mounted', undefined],
    ['the route entry is not active', [{ provider: 'deepseek-official', config: { apiKeyEnv: 'TEAM_KEY' }, state: FiberState.DISPOSED }]],
    ['another package registers the route', [{ provider: 'deepseek-official', config: { apiKeyEnv: 'TEAM_KEY' }, name: '@example/other-llm' }]],
    ['the route settings are nested', [{ provider: 'deepseek-official', config: { apiKeyEnv: 'TEAM_KEY' }, settingsPath: ['routes', 'official'] }]],
  ])('sends DEEPSEEK_API_KEY to the official base when %s', async (_label, routes) => {
    const { ctx, sent } = await mount({
      ...routes === undefined ? {} : { routes },
      environment: { DEEPSEEK_API_KEY: 'chat-key', TEAM_KEY: 'team-key', DEEPSEEK_BASE_URL: 'https://internal.deepseek.test/anthropic' },
    })
    expect(await ready(ctx, operation, 'deepseek-official')).toBe(true)
    await operate(ctx, operation, 'deepseek-official')
    expect(sent()).toEqual([{ endpoint: `${OFFICIAL}/${operation}`, authorization: 'Bearer chat-key' }])
  })

  it.each<[string, Record<string, unknown>, string]>([
    [
      'thinking is disabled with a reasoning effort', { thinking: 'disabled', reasoningEffort: 'high' },
      'llm-deepseek: only reasoningEffort "off" can be configured when thinking is disabled',
    ],
    [
      'the base URL carries credentials', { baseURL: 'https://user:secret@internal.deepseek.test/anthropic' },
      'llm-deepseek: Messages baseURL must be an HTTP(S) root without credentials, query, or fragment',
    ],
  ])('is not ready and fails without sending when the mounted route settings do not resolve because %s', async (_label, config, reason) => {
    const subject = operation === 'search' ? 'Search' : 'Fetch'
    const { ctx, sent } = await mount({
      routes: [officialRoute({ apiKeyEnv: 'TEAM_KEY', ...config })],
      environment: { DEEPSEEK_API_KEY: 'chat-key', TEAM_KEY: 'team-key' },
    })
    for (const route of ['deepseek-official', 'moonshotai', undefined]) {
      expect(await ready(ctx, operation, route)).toBe(false)
      await expect(operate(ctx, operation, route)).rejects.toMatchObject({
        code: 'WEB_PROVIDER_MISCONFIGURED',
        message: `DeepSeek ${subject} API sends that provider's API key to the origin of the DeepSeek API-key model provider,`
          + ` and that provider's settings do not resolve: ${reason}. ${subject} did not send the request. Guide the user to`
          + ' correct that provider\'s settings on the Models page or in the deployment configuration, or to set'
          + ` web-deepseek-api.${operation}BaseURL and web-deepseek-api.${operation}ApiKeyEnv so ${subject} uses its own endpoint.`,
      })
    }
    expect(sent()).toEqual([])
  })

  it('uses its own endpoint settings while the mounted route settings do not resolve', async () => {
    const { ctx, sent } = await mount({
      config: { [`${operation}BaseURL`]: OWN },
      routes: [officialRoute({ thinking: 'disabled', reasoningEffort: 'high' })], environment: { DEEPSEEK_API_KEY: 'chat-key' },
    })
    expect(await ready(ctx, operation, 'deepseek-official')).toBe(true)
    await operate(ctx, operation, 'deepseek-official')
    expect(sent()).toEqual([{ endpoint: `${OWN}/${operation}`, authorization: 'Bearer chat-key' }])
  })

  it('is not ready when the credential store cannot be read', async () => {
    const { ctx } = await mount({ routes: [officialRoute()], credentials: { describe: () => Promise.reject(new Error('store locked')) } })
    expect(await ready(ctx, operation, 'deepseek-official')).toBe(false)
  })

  it('follows a route change at the next operation', async () => {
    const { ctx, sent } = await mount({ environment: { DEEPSEEK_API_KEY: 'chat-key' } })
    await operate(ctx, operation)
    provideRoutes(ctx, [officialRoute({ baseURL: 'https://next.deepseek.test/anthropic' })])
    await operate(ctx, operation)
    expect(sent().map(row => row.endpoint)).toEqual([`${OFFICIAL}/${operation}`, `https://next.deepseek.test/v1/tools/${operation}`])
  })

  it('names the model provider base URL and the own fields in endpoint guidance', async () => {
    const subject = operation === 'search' ? 'Search' : 'Fetch'
    const { ctx } = await mount({ routes: [officialRoute()], environment: { DEEPSEEK_API_KEY: 'chat-key' }, status: 404 })
    await expect(operate(ctx, operation)).rejects.toMatchObject({
      code: 'WEB_PROVIDER_ERROR',
      message: 'DeepSeek API error (HTTP 404)\n\n'
        + `The web request used endpoint "${ROUTE}/${operation}". ${subject} derives this endpoint from the base URL of the`
        + ' DeepSeek model provider whose credential it uses. If that endpoint is not intended, guide the user to check that'
        + ` provider's base URL on the Models page, or to set web-deepseek-api.${operation}BaseURL to a trusted DeepSeek`
        + ` endpoint and web-deepseek-api.${operation}ApiKeyEnv to the credential reference of its API key. Only the user`
        + ' should choose or change the endpoint.',
    })
  })
})

describe.each(OPERATIONS)('%s with its own endpoint settings', (operation) => {
  const subject = operation === 'search' ? 'Search' : 'Fetch'
  const baseURL = `${operation}BaseURL`, apiKeyEnv = `${operation}ApiKeyEnv`

  it.each<[string, Record<string, unknown>, Sent]>([
    ['only a base URL', { [baseURL]: OWN }, { endpoint: `${OWN}/${operation}`, authorization: 'Bearer chat-key' }],
    ['only a key reference', { [apiKeyEnv]: 'OWN_KEY' }, { endpoint: `${OFFICIAL}/${operation}`, authorization: 'Bearer own-key' }],
    ['both', { [baseURL]: OWN, [apiKeyEnv]: 'OWN_KEY' }, { endpoint: `${OWN}/${operation}`, authorization: 'Bearer own-key' }],
  ])('uses %s on every conversation route', async (_label, config, expected) => {
    const { ctx, sent } = await mount({
      config, routes: [officialRoute()], environment: { DEEPSEEK_API_KEY: 'chat-key', OWN_KEY: 'own-key' },
    })
    for (const route of ['deepseek-official', 'moonshotai', undefined]) {
      expect(await ready(ctx, operation, route)).toBe(true)
      await operate(ctx, operation, route)
    }
    expect(sent()).toEqual([expected, expected, expected])
  })

  it('is not ready without its key, despite the route key', async () => {
    const { ctx, sent } = await mount({
      config: { [apiKeyEnv]: 'OWN_KEY' }, routes: [officialRoute()], environment: { DEEPSEEK_API_KEY: 'chat-key' },
    })
    expect(await ready(ctx, operation, 'deepseek-official')).toBe(false)
    await expect(operate(ctx, operation, 'deepseek-official')).rejects.toMatchObject({
      code: 'WEB_PROVIDER_CREDENTIAL_MISSING',
      message: `DeepSeek ${subject} API sends the API key under "OWN_KEY" to its own endpoint, and no key is configured for`
        + ' "OWN_KEY". Guide the user to export "OWN_KEY" in the launching environment, or to correct'
        + ` web-deepseek-api.${operation}ApiKeyEnv.`,
    })
    expect(sent()).toEqual([])
  })

  it('treats empty values as unset and follows the API-key route', async () => {
    const { ctx, sent } = await mount({
      config: { [baseURL]: '', [apiKeyEnv]: '' }, routes: [officialRoute()], environment: { DEEPSEEK_API_KEY: 'chat-key' },
    })
    await operate(ctx, operation, 'deepseek-official')
    expect(sent()).toEqual([{ endpoint: `${ROUTE}/${operation}`, authorization: 'Bearer chat-key' }])
  })

  it('reports an unparseable base URL as an unavailable provider', async () => {
    const { ctx, sent } = await mount({ config: { [baseURL]: 'not a url' }, environment: { DEEPSEEK_API_KEY: 'chat-key' } })
    await expect(operate(ctx, operation)).rejects.toMatchObject({ code: 'WEB_PROVIDER_CONFIGURED_UNAVAILABLE' })
    expect(sent()).toEqual([])
  })
})

describe('independent capabilities', () => {
  it('resolves Search from its own settings while Fetch follows the API-key route', async () => {
    const { ctx, sent } = await mount({
      config: { searchBaseURL: OWN }, routes: [officialRoute()], environment: { DEEPSEEK_API_KEY: 'chat-key' },
    })
    await operate(ctx, 'search', 'deepseek-official')
    await operate(ctx, 'fetch', 'deepseek-official')
    expect(sent()).toEqual([
      { endpoint: `${OWN}/search`, authorization: 'Bearer chat-key' },
      { endpoint: `${ROUTE}/fetch`, authorization: 'Bearer chat-key' },
    ])
  })

  it('reports one capability not ready while the other is ready', async () => {
    const { ctx } = await mount({ config: { fetchApiKeyEnv: 'UNSET_KEY' }, routes: [officialRoute()], environment: { DEEPSEEK_API_KEY: 'chat-key' } })
    expect([await ready(ctx, 'search', undefined), await ready(ctx, 'fetch', undefined)]).toEqual([true, false])
  })
})

describe('route resolver failures', () => {
  it('reports a thrown non-Error value as its string', async () => {
    const { ctx, sent } = await mount({ routes: [officialRoute()], environment: { DEEPSEEK_API_KEY: 'chat-key' } })
    resolverThrow.value = 'route resolver unavailable'
    const failure = operate(ctx, 'search', 'deepseek-official')
    await expect(failure).rejects.toMatchObject({ code: 'WEB_PROVIDER_MISCONFIGURED' })
    await expect(failure).rejects.toThrow('that provider\'s settings do not resolve: route resolver unavailable. Search did not send')
    expect(sent()).toEqual([])
  })
})

describe('stored settings', () => {
  const removed = {
    baseURL: 'https://legacy.deepseek.test/v1/tools', apiKeyEnv: 'LEGACY_KEY', apiKey: 'legacy-key',
  }

  it('loads stored removed fields without error and leaves both capabilities unset', () => {
    const config = webApiPlugin.Config(removed)
    expect([config.searchBaseURL.get(), config.searchApiKeyEnv.get(), config.fetchBaseURL.get(), config.fetchApiKeyEnv.get()])
      .toEqual([undefined, undefined, undefined, undefined])
  })

  it.each(OPERATIONS)('ignores removed fields when a %s runs', async (operation) => {
    const { ctx, sent } = await mount({ config: removed, environment: { DEEPSEEK_API_KEY: 'chat-key', LEGACY_KEY: 'legacy-env-key' } })
    await operate(ctx, operation)
    expect(sent()).toEqual([{ endpoint: `${OFFICIAL}/${operation}`, authorization: 'Bearer chat-key' }])
  })
})

describe('provider registration', () => {
  it('lists both APIs with their descriptions for the provider menus', async () => {
    const { ctx } = await mount({})
    const { search, fetch } = ctx.web.listProviders()
    expect(search.map(({ id }) => id)).toEqual(['deepseek-search-api'])
    expect(fetch.map(({ id }) => id)).toEqual(['deepseek-fetch-api'])
    expect(search[0]?.description).toMatchObject({
      en: 'Queries the search endpoint directly for titles, URLs, and snippets without an extra model call. Uses a DeepSeek API key, and may incur API charges.',
      es: 'Consulta directamente el punto de conexión de búsqueda y devuelve títulos, URL y fragmentos sin una llamada adicional al modelo. Usa una clave de API de DeepSeek y puede generar cargos de API.',
    })
    expect(fetch[0]?.description).toMatchObject({
      en: 'Fetches public URLs on DeepSeek servers and returns Markdown. Uses a DeepSeek API key, may incur API charges, and cannot reach intranet or loopback addresses.',
      es: 'Obtiene URL públicas en los servidores de DeepSeek y devuelve Markdown. Usa una clave de API de DeepSeek, puede generar cargos de API y no puede acceder a direcciones de la intranet ni de bucle invertido.',
    })
  })
})
