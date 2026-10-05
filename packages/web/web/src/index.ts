/**
 * Service Definition for the web access capability seam (`ctx.web`): registries and provider-selecting execution for search and
 * fetch. Duplicate ids are rejected. At execution time, a configured provider must exist and
 * be usable; without one, exactly one usable provider is required, so selection never depends
 * on registration order.
 * @module @deepseek-ai/dsh-web
 */

import type { Context, Volatile } from '@deepseek-ai/cordis'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import z from '@deepseek-ai/schemastery'
import type {
  WebFetchProvider,
  WebFetchRequest,
  WebFetchResult,
  WebSearchKeyCheck,
  WebSearchProvider,
  WebSearchProviderInfo,
  WebSearchRequest,
  WebSearchResult,
} from './types.ts'
import { WebError } from './types.ts'

export {
  WebError,
} from './types.ts'
export type {
  WebFetchBody,
  WebFetchProvider,
  WebFetchRequest,
  WebFetchResult,
  WebSearchKeyCheck,
  WebSearchProvider,
  WebSearchProviderInfo,
  WebSearchRequest,
  WebSearchResult,
  WebSearchSource,
} from './types.ts'
export { KEY_CHECK_QUERY, requireSearchKey, SearchApiKey, searchKeySource } from './api-key.ts'
export { KeyedSearchProvider } from './keyed-provider.ts'
export type { SearchKeySource } from './api-key.ts'
export { errorDetail, providerFailureCode, requestProviderJson } from './provider-http.ts'
export type { ProviderFailureCode, ProviderJsonRequest } from './provider-http.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    web: WebRuntime
  }
}

/** Selection inputs for execution-time provider resolution. */
interface Selection<P> {
  /** Capability named in error messages. */
  readonly kind: 'search' | 'fetch'
  /** The configured provider id for this capability, if any. */
  readonly configuredId?: string
  /** Providers registered for this capability kind. */
  readonly providers: ReadonlyMap<string, P>
}

/**
 * Config for the web seam. `searchProvider` / `fetchProvider` pin which provider
 * wins for each capability; both are optional (a single registered usable
 * provider auto-selects). `searchProvider` is volatile, so a settings surface
 * changes it for the next search without a remount. Operational overrides such
 * as environment variables must feed these same fields rather than introduce a
 * hidden priority chain.
 */
export interface WebRuntimeConfig {
  /** Explicit search provider id. Omitted = auto-select when exactly one usable. */
  readonly searchProvider?: Volatile<string | undefined>
  /** Explicit fetch provider id. Omitted = auto-select when exactly one usable. */
  readonly fetchProvider?: string
}

/**
 * The web access service. Registered as `ctx.web` (one instance per context).
 *
 * Selection semantics (resolved at execution time, never order-dependent):
 * - A configured id that is registered and `available()` → that provider.
 * - A configured id not registered → `WEB_PROVIDER_CONFIGURED_MISSING`.
 * - A configured id registered but unavailable →
 *   `WEB_PROVIDER_CONFIGURED_UNAVAILABLE`.
 * - No id configured, exactly one registered usable provider → that provider.
 * - No id configured, multiple usable providers → `WEB_PROVIDER_AMBIGUOUS`.
 * - No id configured, no usable provider → `WEB_PROVIDER_UNAVAILABLE`.
 */
export class WebRuntime extends TypertRemoteService {
  /**
   * Provider selection config. Operational env overrides feed the SAME fields:
   * `$DSH_WEB_SEARCH_PROVIDER` / `$DSH_WEB_FETCH_PROVIDER` are equivalent to
   * `searchProvider` / `fetchProvider` and are NOT a hidden priority chain.
   */
  static Config = z.object({
    searchProvider: z.string().volatile(),
    fetchProvider: z.string(),
  })

  private searchProviders = new Map<string, WebSearchProvider>()
  private fetchProviders = new Map<string, WebFetchProvider>()
  private readonly searchProviderConfig: Volatile<string | undefined> | undefined
  private readonly fetchProviderId: string | undefined

  constructor(ctx: Context, config: WebRuntimeConfig = {}) {
    super(ctx, 'web')
    this.searchProviderConfig = config.searchProvider
    this.fetchProviderId = config.fetchProvider ?? process.env.DSH_WEB_FETCH_PROVIDER
  }

  /** The pinned search provider id in force for the next search. */
  private searchProviderId(): string | undefined {
    const configured = this.searchProviderConfig?.get()
    return configured !== undefined && configured.length > 0 ? configured : process.env.DSH_WEB_SEARCH_PROVIDER
  }

  /**
   * Register a search provider. Throws {@link WebError} `WEB_DUPLICATE_PROVIDER`
   * if its id is already registered for search. Returns a disposer; disposed
   * with the calling fiber.
   * @param provider - the provider; its `id` is the registry key.
   * @returns the disposer that unregisters the provider.
   */
  registerSearchProvider(provider: WebSearchProvider): () => void {
    return this.registerProvider(this.searchProviders, provider)
  }

  /**
   * Register a fetch provider. Throws {@link WebError} `WEB_DUPLICATE_PROVIDER`
   * if its id is already registered for fetch. Returns a disposer; disposed
   * with the calling fiber.
   * @param provider - the provider; its `id` is the registry key.
   * @returns the disposer that unregisters the provider.
   */
  registerFetchProvider(provider: WebFetchProvider): () => void {
    return this.registerProvider(this.fetchProviders, provider)
  }

  private registerProvider<P extends { readonly id: string }>(store: Map<string, P>, provider: P): () => void {
    if (store.has(provider.id)) {
      throw new WebError(`a web provider with id "${provider.id}" is already registered`, 'WEB_DUPLICATE_PROVIDER')
    }
    const dispose = this.ctx.effect(function* () {
      store.set(provider.id, provider)
      yield () => store.delete(provider.id)
    }, 'web.registerProvider()')
    // ctx.effect's disposer returns Promise<void>; our disposer API is
    // synchronous fire-and-forget — discard the (always-resolved) promise.
    return () => void dispose()
  }

  /**
   * Run one search through the selected provider. Resolves the provider at call
   * time with the selection rules above; throws {@link WebError} when the
   * capability cannot run. The seam enforces `request.maxResults` on the result:
   * if the provider over-returns, `sources[]` is truncated and `truncated` set.
   * @param request - the query and optional result limit.
   * @param signal - optional cancellation signal forwarded to the provider.
   * @returns the provider's results, capped to `request.maxResults`.
   */
  async search(request: WebSearchRequest, signal?: AbortSignal): Promise<WebSearchResult> {
    const configuredId = this.searchProviderId()
    const provider = resolveProvider({
      kind: 'search',
      providers: this.searchProviders,
      ...configuredId !== undefined ? { configuredId } : {},
    })
    const result = await provider.search(request, signal)
    return capSources(result, request.maxResults)
  }

  /**
   * Retrieve one URL through the selected provider. Resolves the provider at
   * call time with the selection rules above; throws {@link WebError} when the
   * capability cannot run. A non-2xx response is a result, not a throw.
   * @param request - the URL plus retrieval options.
   * @param signal - optional cancellation signal forwarded to the provider.
   * @returns the retrieval outcome; non-2xx responses resolve descriptively.
   */
  async fetch(request: WebFetchRequest, signal?: AbortSignal): Promise<WebFetchResult> {
    const provider = resolveProvider({
      kind: 'fetch',
      providers: this.fetchProviders,
      ...this.fetchProviderId !== undefined ? { configuredId: this.fetchProviderId } : {},
    })
    return provider.fetch(request, signal)
  }

  /**
   * List the registered search providers that take a user API key, for a
   * configuration surface to offer.
   * @param signal - Remote caller cancellation.
   * @returns each provider's id and the credential reference its key is written to, in registration order.
   */
  @Remote('searchProviders')
  listSearchProviders(signal: AbortSignal): WebSearchProviderInfo[] {
    signal.throwIfAborted()
    return [...this.searchProviders.values()].flatMap(provider =>
      provider.credentialRef === undefined || provider.checkKey === undefined
        ? []
        : [{ id: provider.id, credentialRef: provider.credentialRef }])
  }

  /**
   * Check a candidate API key against one registered provider before a
   * surface stores it. The key is sent only to that provider's endpoint and is
   * neither stored nor logged here.
   * @param providerId - the provider to ask.
   * @param apiKey - the candidate key.
   * @param signal - Remote caller cancellation, forwarded to the provider.
   * @returns `ok`, or why the key cannot be used: `auth` for a rejected key,
   *   `quota` for an accepted key refused for quota, credit, or rate limits,
   *   and `error` for anything else, with the provider's message.
   */
  @Remote('checkSearchKey')
  async checkSearchKey(providerId: string, apiKey: string, signal: AbortSignal): Promise<WebSearchKeyCheck> {
    const provider = this.searchProviders.get(providerId)
    if (provider?.checkKey === undefined) {
      return { ok: false, reason: 'error', message: `search provider "${providerId}" does not check API keys` }
    }
    if (apiKey.trim().length === 0) return { ok: false, reason: 'auth', message: 'The API key is empty.' }
    try {
      await provider.checkKey(apiKey.trim(), signal)
      return { ok: true }
    } catch (error: unknown) {
      if (!(error instanceof WebError)) throw error
      if (error.code === 'WEB_ABORTED') throw error
      const reason = error.code === 'WEB_PROVIDER_AUTH' ? 'auth' : error.code === 'WEB_PROVIDER_QUOTA' ? 'quota' : 'error'
      return { ok: false, reason, message: error.message }
    }
  }
}

interface ResolvableProvider {
  readonly id: string
  available(): boolean
}

/** Resolve the selected provider or throw the matching {@link WebError}. */
function resolveProvider<P extends ResolvableProvider>(selection: Selection<P>): P {
  const { configuredId, providers, kind } = selection
  if (configuredId !== undefined) {
    const provider = providers.get(configuredId)
    if (!provider) {
      throw new WebError(`configured web provider "${configuredId}" is not registered`, 'WEB_PROVIDER_CONFIGURED_MISSING')
    }
    if (!provider.available()) {
      throw new WebError(
        `configured web provider "${configuredId}" is registered but unavailable${kind === 'search' ? '; it has no API key yet, and the user must add one' : ''}`,
        'WEB_PROVIDER_CONFIGURED_UNAVAILABLE',
      )
    }
    return provider
  }
  const usable = [...providers.values()].filter(provider => provider.available())
  const [single] = usable
  if (single === undefined) {
    throw new WebError(
      kind === 'search'
        ? 'no usable web provider is registered; web search needs the user to choose a search provider and add its API key'
        : 'no usable web provider is registered',
      'WEB_PROVIDER_UNAVAILABLE',
    )
  }
  if (usable.length > 1) {
    const ids = usable.map(provider => provider.id).join(', ')
    throw new WebError(`multiple usable web providers are registered (${ids}); configure one explicitly`, 'WEB_PROVIDER_AMBIGUOUS')
  }
  return single
}

/** Enforce `maxResults` on a search result: truncate `sources[]` and flag it. */
function capSources(result: WebSearchResult, maxResults: number | undefined): WebSearchResult {
  if (maxResults === undefined || result.sources.length <= maxResults) return result
  return { ...result, sources: result.sources.slice(0, maxResults), truncated: true }
}

export default WebRuntime
