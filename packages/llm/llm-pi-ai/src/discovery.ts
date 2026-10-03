/**
 * Answering "which models can this provider serve?" for the configuration
 * surface's "fetch available models" action.
 *
 * A route the installed pi-ai catalog ships is answered **from that catalog**,
 * with no network call at all: pi-ai's registry is the authoritative list for
 * its own providers, and it carries the capacities a listing endpoint would
 * not disclose. Only a route the catalog does not describe — a gateway, a
 * self-hosted server — is interrogated over the wire, unless the request asks
 * for a `live` answer: then a catalog route is interrogated too, which checks
 * the key, and catalog metadata replaces the listing's row for every id the
 * catalog knows.
 *
 * Neither path is a catalog refresh. Nothing here is stored: the request
 * carries a draft the user is still editing, and the reply is candidate
 * metadata the surface offers for adoption. `cordis.patch.yml` remains the only
 * thing that decides what a route serves.
 *
 * OpenAI-compatible and Anthropic Messages protocols are interrogated through
 * their native model-listing endpoints. The parser accepts the standard
 * `data` array and the enriched `models` map some compatible gateways expose.
 * Every other protocol reports that it cannot be interrogated so the surface
 * falls back to hand-entry rather than guessing its response fields.
 *
 * @module dsh-llm-pi-ai/discovery
 */

import { INVALID_CREDENTIAL_CODE, LlmError, QUOTA_EXCEEDED_CODE, normalizeApiKey } from '@deepseek-ai/dsh-llm'
import type { LlmDiscoveredModel, LlmModelDiscoveryOperation, LlmModelPricing } from '@deepseek-ai/dsh-llm'
import { attributionHeaders } from '@deepseek-ai/dsh-llm'
import type { Api, Model } from '@earendil-works/pi-ai'
import { catalogModels } from './catalog.ts'

/**
 * Protocols whose model listing this module can read. OpenAI protocols use
 * bearer auth at `GET {baseURL}/models`; Anthropic Messages uses `x-api-key`
 * and `anthropic-version` at its native `GET /v1/models`. Azure is absent
 * despite its OpenAI lineage — it authenticates with an `api-key` header and
 * requires an `api-version` query — and Codex authenticates through OAuth;
 * guessing at either would report an authentication failure as a provider
 * with no models. pi-ai's remaining protocols are absent for the same reason.
 */
const LISTABLE_PROTOCOLS: ReadonlySet<string> = new Set([
  'anthropic-messages',
  'openai-completions',
  'openai-responses',
])

/**
 * Routes whose model listing answers without authentication, mapped to the
 * path under their base URL that does require the key. A `live` request checks
 * the key there first, so a rejected key is reported instead of a listing the
 * key never unlocked.
 */
const CREDENTIAL_CHECK_PATHS: Readonly<Record<string, string>> = {
  openrouter: '/key',
}

/**
 * The endpoint a catalog route lists its models at: the listable protocol most
 * of its models speak, with the base URL of a model speaking it. A gateway route
 * such as OpenRouter mixes protocols per model, so the first model is not a
 * reliable answer.
 * @param models - the route's installed catalog models; at least one.
 * @returns the protocol and base URL to ask, or the first model's when none is listable.
 */
function routeEndpoint(models: Iterable<Model<Api>>): { readonly api: string; readonly baseUrl: string } {
  const counts = new Map<string, { count: number; baseUrl: string }>()
  let fallback: { api: string; baseUrl: string } | undefined
  for (const model of models) {
    fallback ??= { api: model.api, baseUrl: model.baseUrl }
    if (!LISTABLE_PROTOCOLS.has(model.api)) continue
    const entry = counts.get(model.api) ?? { count: 0, baseUrl: model.baseUrl }
    entry.count += 1
    counts.set(model.api, entry)
  }
  let best: { api: string; baseUrl: string; count: number } | undefined
  for (const [api, entry] of counts) {
    if (best === undefined || entry.count > best.count) best = { api, ...entry }
  }
  /* v8 ignore next -- callers pass a non-empty catalog */
  return best ?? fallback ?? { api: '', baseUrl: '' }
}

/** Stable API version required by Anthropic's model-listing endpoint. */
const ANTHROPIC_VERSION = '2023-06-01'

/** Largest model-list page accepted by Anthropic's public endpoint; discovery reads one page and does not follow `has_more`. */
const ANTHROPIC_MODEL_LIMIT = 1000

/**
 * Endpoint replies larger than this are refused. The endpoint is whatever URL
 * the user typed, so the ceiling holds on the bytes actually read rather than
 * on the length the server claims — the same two-stage shape `dsh-web-fetch`
 * uses for its own caller-supplied URLs, except that a truncated model listing
 * is not parseable, so overflow rejects instead of truncating.
 */
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024

/** Capacity fields nested by enriched model-directory replies. */
interface ListingLimit {
  context?: unknown
  output?: unknown
}

/** Per-route capacities OpenRouter nests under each entry. */
interface ListingTopProvider {
  max_completion_tokens?: unknown
}

/**
 * Per-token list prices in US dollars, as decimal strings, that OpenRouter and
 * compatible gateways publish under each entry's `pricing`.
 */
interface ListingPricing {
  prompt?: unknown
  completion?: unknown
  input_cache_read?: unknown
  input_cache_write?: unknown
}

/** One entry of a supported `GET /models` reply. */
interface ListingEntry {
  id?: unknown
  /** Common gateway extensions; absent from the official listings. */
  name?: unknown
  display_name?: unknown
  displayName?: unknown
  contextWindow?: unknown
  context_window?: unknown
  context_length?: unknown
  max_input_tokens?: unknown
  maxOutputTokens?: unknown
  max_tokens?: unknown
  max_output_tokens?: unknown
  maxTokens?: unknown
  limit?: ListingLimit | null
  top_provider?: ListingTopProvider | null
  pricing?: ListingPricing | null
}

/** A positive integer field of a listing entry, or `undefined` when absent or unusable. */
function capacity(...candidates: readonly unknown[]): number | undefined {
  for (const candidate of candidates) {
    if (typeof candidate === 'number' && Number.isInteger(candidate) && candidate > 0) return candidate
  }
  return undefined
}

/** One per-token price field as US dollars per million tokens, or `undefined` when absent or unusable. */
function perMillion(candidate: unknown): number | undefined {
  const perToken = typeof candidate === 'string' && candidate.trim().length > 0 ? Number(candidate)
    : typeof candidate === 'number' ? candidate
      : Number.NaN
  if (!Number.isFinite(perToken) || perToken < 0) return undefined
  // Rounded to 1e-6 dollars per million so float noise from the decimal
  // string (`0.0000003` → 0.30000000000000004) does not reach the form.
  return Math.round(perToken * 1e12) / 1e6
}

/**
 * The list price an entry publishes, or `undefined` when it publishes no usable
 * input and output price. OpenRouter marks a route whose price varies with
 * `-1`, which is unusable and reads as unknown.
 */
function listingPricing(pricing: ListingPricing | null | undefined): LlmModelPricing | undefined {
  const input = perMillion(pricing?.prompt)
  const output = perMillion(pricing?.completion)
  if (input === undefined || output === undefined) return undefined
  const cacheRead = perMillion(pricing?.input_cache_read)
  const cacheWrite = perMillion(pricing?.input_cache_write)
  return {
    input,
    output,
    ...cacheRead === undefined || cacheRead === 0 ? {} : { cacheRead },
    ...cacheWrite === undefined || cacheWrite === 0 ? {} : { cacheWrite },
  }
}

/** A non-empty string field of a listing entry, or `undefined`. */
function label(...candidates: readonly unknown[]): string | undefined {
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.length > 0) return candidate
  }
  return undefined
}

/**
 * Join the endpoint base with the protocol's listing path. The base is
 * treated as a prefix rather than a URL to resolve against, so a deployment
 * path such as `https://gateway.example/openai/v1` keeps its segments instead
 * of losing them to `URL` resolution. OpenAI protocols list at
 * `{baseURL}/models`. Anthropic lists at `{root}/v1/models`, where the root is
 * the base without trailing slashes and without one trailing `/v1` segment:
 * gateway documentation publishes both spellings of the same root. Only this
 * listing URL normalizes that segment; model requests receive the configured
 * `baseURL` unchanged.
 */
function listingUrl(baseURL: string, api: string): string {
  const base = baseURL.replace(/\/+$/, '')
  if (api !== 'anthropic-messages') return `${base}/models`
  const root = base.endsWith('/v1') ? base.slice(0, -3) : base
  return `${root}/v1/models?limit=${String(ANTHROPIC_MODEL_LIMIT)}`
}

/**
 * Read a reply body, refusing one that outgrows the ceiling. A declared length
 * is checked first so an honest server is turned away without transferring
 * anything; the accumulated total is what actually enforces the bound, because
 * a server that under-declares (or streams) tells us nothing up front.
 */
async function readBounded(response: Response, url: string): Promise<string> {
  const oversized = (): LlmError =>
    new LlmError(`${url} answered with more than ${MAX_RESPONSE_BYTES} bytes`, 'DISCOVERY_FAILED')
  const declared = Number(response.headers.get('content-length') ?? Number.NaN)
  if (Number.isFinite(declared) && declared > MAX_RESPONSE_BYTES) {
    await response.body?.cancel()
    throw oversized()
  }
  /* v8 ignore next -- fetch always exposes a body stream on a 2xx Response; the null guard is defensive. */
  if (response.body === null) return ''
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > MAX_RESPONSE_BYTES) throw oversized()
      chunks.push(value)
    }
  } finally {
    /* v8 ignore next 4 -- cancel() after a completed or abandoned read settles without rejecting; unobserved best-effort cleanup. */
    await reader.cancel().catch(() => {
      // Cancel after a drained read, or after this function walked away from
      // an oversized one, is cleanup; the reply is already decided either way.
    })
  }
  const body = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(body)
}

/**
 * Read one supported model-listing reply. The standard `data` array takes
 * precedence when both supported formats are present. An enriched `models`
 * map uses each property key as the endpoint-facing id; its nested `id` is
 * only a fallback for an empty key because gateways may put a canonical model
 * identity there instead of the alias they accept on requests. Only
 * object-valued map entries are models; primitive properties are ignored
 * because they may be directory metadata rather than model records.
 *
 * Entries without a usable id are skipped rather than failing the whole
 * interrogation: a single malformed row should not deny the user the rest of
 * a working endpoint's catalog. Missing names fall back to the adopted id so
 * the Web form receives a complete human-readable row.
 */
function readListing(body: unknown): LlmDiscoveredModel[] {
  const listing = body as { data?: unknown; models?: unknown } | null
  const data = listing?.data
  let listed: { readonly key?: string; readonly raw: unknown }[]
  if (Array.isArray(data)) {
    const rows = data as readonly unknown[]
    listed = rows.map(raw => ({ raw }))
  } else {
    const models = listing?.models
    if (models === null || typeof models !== 'object' || Array.isArray(models)) {
      throw new LlmError(
        'the endpoint\'s model listing has neither a "data" array nor a "models" object; '
        + 'enter this provider\'s models by hand',
        'DISCOVERY_FAILED',
      )
    }
    listed = Object.entries(models as Record<string, unknown>)
      .filter(([, raw]) => raw !== null && typeof raw === 'object' && !Array.isArray(raw))
      .map(([key, raw]) => ({ key, raw }))
  }
  const models: LlmDiscoveredModel[] = []
  for (const { key, raw } of listed) {
    const entry = raw as ListingEntry | null
    const id = label(key, entry?.id)
    if (id === undefined) continue
    const name = label(entry?.name, entry?.display_name, entry?.displayName) ?? id
    const contextWindow = capacity(
      entry?.contextWindow,
      entry?.context_window,
      entry?.context_length,
      entry?.max_input_tokens,
      entry?.limit?.context,
    )
    const maxTokens = capacity(
      entry?.maxOutputTokens,
      entry?.max_output_tokens,
      entry?.maxTokens,
      entry?.max_tokens,
      entry?.limit?.output,
      entry?.top_provider?.max_completion_tokens,
    )
    const pricing = listingPricing(entry?.pricing)
    models.push({
      id,
      name,
      ...contextWindow === undefined ? {} : { contextWindow },
      ...maxTokens === undefined ? {} : { maxTokens },
      ...pricing === undefined ? {} : { pricing },
    })
  }
  return models
}

/**
 * Accept one probe key, or refuse it before the header is built. Without this
 * the `fetch` below would throw a ByteString `TypeError` that this function's
 * catch reports as `could not reach <url>` — blaming the network for a local,
 * deterministic fault.
 * @param raw - the key typed into the form or read from storage.
 * @returns the trimmed, usable key.
 */
function usableProbeKey(raw: string): string {
  const checked = normalizeApiKey(raw)
  if (checked.ok) return checked.value
  throw new LlmError(
    checked.reason === 'empty'
      ? 'this provider\'s API key is blank; enter it on the Models page, or clear it to probe unauthenticated'
      : 'this provider\'s API key contains characters no HTTP header can carry; paste the raw key only',
    INVALID_CREDENTIAL_CODE,
  )
}

/** Host-owned profile inputs that a configuration draft deliberately omits. */
export interface StoredModelDiscoveryProfile {
  /** Deployment headers configured on the named route. */
  readonly headers: Readonly<Record<string, string>> | undefined
  /** Resolve the named route's credential only when the draft carries none. */
  readonly resolveApiKey: () => Promise<string | undefined>
}

/**
 * Interrogate one draft provider endpoint for the models it advertises.
 * @param request - the endpoint, protocol, and one-shot credential to use.
 * @param storedProfile - Host-owned headers and lazy credential resolution for
 *   the named route. It is read only on the path that reaches the network; the
 *   credential is resolved only when the draft carries none.
 * @returns the advertised models in endpoint order.
 * @throws LlmError when the protocol has no readable listing, the endpoint
 *   refuses or fails the request, or the reply is not a model listing.
 */
export async function discoverModels(
  request: LlmModelDiscoveryOperation,
  storedProfile?: () => StoredModelDiscoveryProfile | undefined,
): Promise<readonly LlmDiscoveredModel[]> {
  // A catalog route already has its answer, and a better one: the installed
  // entries carry context windows, output caps, and list prices no listing
  // endpoint reports.
  if (request.provider !== undefined) {
    const installed = catalogModels(request.provider)
    if (installed.size > 0) {
      const described = (model: Model<Api>): LlmDiscoveredModel => ({
        id: model.id,
        name: model.name,
        contextWindow: model.contextWindow,
        maxTokens: model.maxTokens,
        inputModalities: [...model.input],
        ...model.cost.input === 0 && model.cost.output === 0
          ? {}
          : {
            pricing: {
              input: model.cost.input,
              output: model.cost.output,
              ...model.cost.cacheRead > 0 ? { cacheRead: model.cost.cacheRead } : {},
              ...model.cost.cacheWrite > 0 ? { cacheWrite: model.cost.cacheWrite } : {},
            },
          },
      })
      const fromCatalog = [...installed.values()].map(described)
      if (request.live !== true) return fromCatalog
      const route = routeEndpoint(installed.values())
      const baseURL = request.baseURL ?? route.baseUrl
      const api = request.api ?? route.api
      // A route whose protocol has no readable listing keeps its catalog answer.
      if (baseURL.length === 0 || !LISTABLE_PROTOCOLS.has(api)) return fromCatalog
      const checkPath = CREDENTIAL_CHECK_PATHS[request.provider]
      if (checkPath !== undefined) {
        await interrogate({ ...request, baseURL, api }, storedProfile, `${baseURL.replace(/\/+$/, '')}${checkPath}`)
      }
      const listed = readListing(await interrogate({ ...request, baseURL, api }, storedProfile))
      return listed.map((model) => {
        const known = installed.get(model.id)
        return known === undefined ? model : described(known)
      })
    }
  }
  if (request.baseURL === undefined || request.baseURL.length === 0) {
    throw new LlmError(
      `pi-ai ships no catalog for provider "${request.provider ?? ''}", so its models can only come from its`
      + " endpoint; set a baseURL, or enter this provider's models by hand",
      'DISCOVERY_FAILED',
    )
  }
  // A draft that has not chosen a protocol yet is asked as OpenAI Chat
  // Completions: it is the shape a gateway is overwhelmingly likely to speak,
  // and the alternative — refusing until the field is filled — would withhold
  // the action from the case it exists for. The cost is a misdirected message
  // when the endpoint speaks something else (an Anthropic gateway answers 401,
  // which reads as a credential problem), and hand-entry remains the way out.
  const api = request.api ?? 'openai-completions'
  if (!LISTABLE_PROTOCOLS.has(api)) {
    throw new LlmError(
      `pi-ai protocol "${api}" has no model listing this build can read; enter this provider's models by hand`,
      'DISCOVERY_UNSUPPORTED',
    )
  }
  return readListing(await interrogate({ ...request, baseURL: request.baseURL, api }, storedProfile))
}

/**
 * Send one authenticated GET to a provider endpoint and return its parsed JSON.
 * @param request - the endpoint, a listable protocol, and the one-shot credential.
 * @param storedProfile - Host-owned headers and lazy credential resolution.
 * @param target - URL to ask instead of the protocol's model listing.
 * @returns the parsed reply body.
 * @throws LlmError coded `INVALID_CREDENTIAL` for a 401 or 403, `QUOTA` for a
 *   402, and `DISCOVERY_FAILED` for any other failure.
 */
async function interrogate(
  request: LlmModelDiscoveryOperation & { readonly baseURL: string; readonly api: string },
  storedProfile: (() => StoredModelDiscoveryProfile | undefined) | undefined,
  target?: string,
): Promise<unknown> {
  const { api } = request
  const url = target ?? listingUrl(request.baseURL, api)
  // A key typed into the form wins: it may replace the stored key that is
  // failing. The stored profile is asked past the catalog and protocol checks,
  // and its credential resolver remains lazy so a typed key cannot fail over a
  // stored credential it supersedes. A route may still authenticate through a
  // deployment-owned Authorization header when neither key exists.
  const stored = storedProfile?.()
  const supplied = request.apiKey ?? await stored?.resolveApiKey()
  const apiKey = supplied === undefined ? undefined : usableProbeKey(supplied)
  let response: Response
  try {
    const headers = new Headers(stored?.headers === undefined ? undefined : Object.entries(stored.headers))
    headers.set('accept', 'application/json')
    if (api === 'anthropic-messages') {
      headers.set('anthropic-version', ANTHROPIC_VERSION)
      if (apiKey !== undefined) headers.set('x-api-key', apiKey)
    } else if (apiKey !== undefined) {
      headers.set('authorization', `Bearer ${apiKey}`)
    }
    for (const [name, value] of Object.entries(attributionHeaders())) headers.set(name, value)
    response = await fetch(url, {
      method: 'GET',
      headers,
      ...request.signal === undefined ? {} : { signal: request.signal },
    })
  } catch (error: unknown) {
    if (request.signal?.aborted) {
      throw new LlmError('model discovery aborted by caller', 'ABORTED', { cause: error })
    }
    throw new LlmError(`could not reach ${url}`, 'DISCOVERY_FAILED', { cause: error })
  }
  if (!response.ok) {
    await response.body?.cancel()
    if (response.status === 401 || response.status === 403) {
      throw new LlmError(`${url} answered ${response.status}; check the API key`, INVALID_CREDENTIAL_CODE)
    }
    if (response.status === 402) {
      throw new LlmError(`${url} answered 402; the key has no credit left or reached its spending limit`, QUOTA_EXCEEDED_CODE)
    }
    throw new LlmError(`${url} answered ${response.status}`, 'DISCOVERY_FAILED')
  }
  let text: string
  try {
    text = await readBounded(response, url)
  } catch (error: unknown) {
    // Cancellation during the body read rejects with the abort reason, which
    // may be any value; the caller gets the same coded failure it would have
    // for a cancellation before the request went out.
    if (request.signal?.aborted) {
      throw new LlmError('model discovery aborted by caller', 'ABORTED', { cause: error })
    }
    throw error
  }
  try {
    return JSON.parse(text) as unknown
  } catch (error: unknown) {
    throw new LlmError(`${url} did not answer with JSON`, 'DISCOVERY_FAILED', { cause: error })
  }
}
