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
 * provider auto-selects). Both are volatile, so a settings surface
 * changes them for the next operation without a remount. Operational overrides such
 * as environment variables must feed these same fields rather than introduce a
 * hidden priority chain.
 */
export interface WebRuntimeConfig {
  /** Explicit search provider id. Omitted = auto-select when exactly one usable. */
  readonly searchProvider?: Volatile<string | undefined>
  /** Explicit fetch provider id. Omitted = auto-select when exactly one usable. */
  readonly fetchProvider?: Volatile<string | undefined>
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
 *
 * Search providers flagged `free` (no credential) take part only when no other
 * search provider is usable: the usable free providers then form a chain tried
 * in registration order, and a provider's failure moves to the next one.
 */
export class WebRuntime extends TypertRemoteService {
  /**
   * Provider selection config. Operational env overrides feed the SAME fields:
   * `$DSH_WEB_SEARCH_PROVIDER` / `$DSH_WEB_FETCH_PROVIDER` are equivalent to
   * `searchProvider` / `fetchProvider` and are NOT a hidden priority chain.
   */
  static Config = z.object({
    searchProvider: z.string().volatile(),
    fetchProvider: z.string().volatile(),
  })

  private searchProviders = new Map<string, WebSearchProvider>()
  private fetchProviders = new Map<string, WebFetchProvider>()
  private readonly searchProviderConfig: Volatile<string | undefined> | undefined
  private readonly fetchProviderConfig: Volatile<string | undefined> | undefined

  constructor(ctx: Context, config: WebRuntimeConfig = {}) {
    super(ctx, 'web')
    this.searchProviderConfig = config.searchProvider
    this.fetchProviderConfig = config.fetchProvider
  }

  /** The pinned fetch provider id in force for the next fetch. */
  private fetchProviderId(): string | undefined {
    const configured = this.fetchProviderConfig?.get()
    return configured !== undefined && configured.length > 0 ? configured : process.env.DSH_WEB_FETCH_PROVIDER
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
    const chain = this.selectSearchChain()
    return capSources(await searchThrough(chain, request, signal), request.maxResults)
  }

  /**
   * Whether the provider `search()` would select can authenticate a search made for a
   * model request on the `llmProvider` chat route. Asks only that provider's `ready()`;
   * one without `ready()` counts as ready. Makes no network calls. A selection failure
   * answers true, because `search()` reports that failure as a structured `WebError`.
   * @param llmProvider - the provider route id of the model request, when known.
   * @returns false only when the selected provider reports that it cannot authenticate.
   */
  async searchReady(llmProvider?: string): Promise<boolean> {
    return await selectedProviderReady(() => this.selectSearchChain()[0], llmProvider)
  }

  /** Select the search providers one search tries with the rules above, throwing the matching {@link WebError}. */
  private selectSearchChain(): [WebSearchProvider, ...WebSearchProvider[]] {
    const configuredId = this.searchProviderId()
    return resolveSearchChain({
      kind: 'search',
      providers: this.searchProviders,
      ...configuredId !== undefined ? { configuredId } : {},
    })
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
    return await this.selectFetchProvider().fetch(request, signal)
  }

  /**
   * Whether the provider `fetch()` would select can authenticate a fetch made for a
   * model request on the `llmProvider` chat route. Asks only that provider's `ready()`;
   * one without `ready()` counts as ready. Makes no network calls. A selection failure
   * answers true, because `fetch()` reports that failure as a structured `WebError`.
   * @param llmProvider - the provider route id of the model request, when known.
   * @returns false only when the selected provider reports that it cannot authenticate.
   */
  async fetchReady(llmProvider?: string): Promise<boolean> {
    return await selectedProviderReady(() => this.selectFetchProvider(), llmProvider)
  }

  /** Select the fetch provider with the rules above, throwing the matching {@link WebError}. */
  private selectFetchProvider(): WebFetchProvider {
    const configuredId = this.fetchProviderId()
    return resolveProvider({
      kind: 'fetch',
      providers: this.fetchProviders,
      ...configuredId !== undefined ? { configuredId } : {},
    })
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
  ready?(llmProvider: string | undefined): Promise<boolean>
}

/**
 * Ask the provider an operation selects whether it can authenticate for one chat route.
 * @param select - the operation's selection; throws its {@link WebError} when no provider qualifies.
 * @param llmProvider - the provider route id of the model request, when known.
 * @returns the provider's answer; true when it has no `ready()` or selection fails, because the
 *   operation reports that failure itself.
 */
async function selectedProviderReady(select: () => ResolvableProvider, llmProvider: string | undefined): Promise<boolean> {
  let provider: ResolvableProvider
  try { provider = select() }
  catch (_selectionFailure) { return true /* The operation surfaces the same failure when called. */ }
  return await provider.ready?.(llmProvider) ?? true
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

/**
 * Resolve the providers one search tries, in order. A pinned provider is the
 * whole chain; otherwise a usable provider with a credential wins, and the
 * usable free providers apply only when there is none.
 */
function resolveSearchChain(selection: Selection<WebSearchProvider>): [WebSearchProvider, ...WebSearchProvider[]] {
  if (selection.configuredId !== undefined) return [resolveProvider(selection)]
  const usable = [...selection.providers.values()].filter(provider => provider.available())
  const keyed = usable.filter(provider => provider.free !== true)
  if (keyed.length > 0) {
    return [resolveProvider({ ...selection, providers: new Map(keyed.map(provider => [provider.id, provider])) })]
  }
  const [first, ...rest] = usable
  // With nothing usable, resolution throws `WEB_PROVIDER_UNAVAILABLE`.
  return first === undefined ? [resolveProvider(selection)] : [first, ...rest]
}

/**
 * Search through a chain: the first provider that answers wins. A failure moves
 * to the next provider; cancellation never does. When every provider fails, the
 * last failure is thrown, naming the earlier ones.
 */
async function searchThrough(
  chain: readonly [WebSearchProvider, ...WebSearchProvider[]],
  request: WebSearchRequest,
  signal?: AbortSignal,
): Promise<WebSearchResult> {
  const failures: string[] = []
  const last = chain.at(-1) as WebSearchProvider
  for (const provider of chain.slice(0, -1)) {
    try {
      return await provider.search(request, signal)
    } catch (error: unknown) {
      if (!isFailover(error, signal)) throw error
      failures.push(`${provider.id}: ${error.message}`)
    }
  }
  try {
    return await last.search(request, signal)
  } catch (error: unknown) {
    if (failures.length === 0 || !isFailover(error, signal)) throw error
    throw new WebError(`${error.message} (earlier: ${failures.join('; ')})`, error.code, { cause: error })
  }
}

/** True for a provider failure the next provider of a chain may answer; cancellation is not one. */
function isFailover(error: unknown, signal: AbortSignal | undefined): error is WebError {
  return error instanceof WebError && error.code !== 'WEB_ABORTED' && signal?.aborted !== true
}

/** Enforce `maxResults` on a search result: truncate `sources[]` and flag it. */
function capSources(result: WebSearchResult, maxResults: number | undefined): WebSearchResult {
  if (maxResults === undefined || result.sources.length <= maxResults) return result
  return { ...result, sources: result.sources.slice(0, maxResults), truncated: true }
}

export default WebRuntime
