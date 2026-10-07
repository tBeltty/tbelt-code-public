/**
 * Optional, refreshable model metadata: context windows, output caps, names,
 * and list prices read from a JSON directory the user names. The directory
 * only refines models a route already serves. It never adds a model, a
 * provider, or a connection, and nothing is fetched unless the user enables it
 * and gives its URL.
 *
 * Precedence for one model field, highest first: the route's own `models` or
 * `modelOverrides` entry, this directory, the installed pi-ai catalog.
 *
 * The accepted document is the models.dev `api.json` layout: an object keyed
 * by provider id, each holding a `models` map keyed by model id with
 * `limit.context`, `limit.output`, and `cost` (`input`, `output`, `cache_read`,
 * `cache_write`, US dollars per million tokens). A rewritten copy of this
 * layout works as well, so an organization can host its own.
 *
 * @module dsh-llm-pi-ai/metadata
 */

import { LlmError } from '@deepseek-ai/dsh-llm'
import type { LlmModelPricing } from '@deepseek-ai/dsh-llm'
import { readBounded } from './discovery.ts'

/** Largest directory document accepted; the public directory is a few megabytes. */
const MAX_DIRECTORY_BYTES = 32 * 1024 * 1024

/** What the directory knows about one model; every field is optional. */
export interface ModelMetadata {
  /** Display name. */
  readonly name?: string
  /** Maximum combined request and response context in tokens. */
  readonly contextWindow?: number
  /** Maximum output tokens. */
  readonly maxTokens?: number
  /** List price in US dollars per million tokens. */
  readonly pricing?: LlmModelPricing
}

/** Metadata by provider route key, then model id. */
export type ModelMetadataIndex = ReadonlyMap<string, ReadonlyMap<string, ModelMetadata>>

/** Read-only lookup the catalog and discovery consult. */
export interface ModelMetadataLookup {
  /**
   * The directory's entry for one model.
   * @param provider - provider route key.
   * @param model - model id.
   * @returns the entry, or `undefined` when the directory does not describe it.
   */
  lookup(provider: string, model: string): ModelMetadata | undefined
}

/** A positive integer, or `undefined` when absent or unusable. */
function positiveInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : undefined
}

/** A finite non-negative price, or `undefined` when absent or unusable. */
function price(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined
}

/** One directory entry, or `undefined` when it names nothing usable. */
function readEntry(raw: unknown): ModelMetadata | undefined {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const entry = raw as {
    name?: unknown
    limit?: { context?: unknown; output?: unknown } | null
    cost?: { input?: unknown; output?: unknown; cache_read?: unknown; cache_write?: unknown } | null
  }
  const name = typeof entry.name === 'string' && entry.name.length > 0 ? entry.name : undefined
  const contextWindow = positiveInteger(entry.limit?.context)
  const maxTokens = positiveInteger(entry.limit?.output)
  const input = price(entry.cost?.input)
  const output = price(entry.cost?.output)
  const cacheRead = price(entry.cost?.cache_read)
  const cacheWrite = price(entry.cost?.cache_write)
  const pricing: LlmModelPricing | undefined = input === undefined || output === undefined
    ? undefined
    : {
      input,
      output,
      ...cacheRead === undefined || cacheRead === 0 ? {} : { cacheRead },
      ...cacheWrite === undefined || cacheWrite === 0 ? {} : { cacheWrite },
    }
  if (name === undefined && contextWindow === undefined && maxTokens === undefined && pricing === undefined) {
    return undefined
  }
  return {
    ...name === undefined ? {} : { name },
    ...contextWindow === undefined ? {} : { contextWindow },
    ...maxTokens === undefined ? {} : { maxTokens },
    ...pricing === undefined ? {} : { pricing },
  }
}

/**
 * Read one directory document. A malformed provider or model entry is skipped
 * so one bad row does not discard the rest of the directory.
 * @param body - the parsed JSON document.
 * @returns the entries by provider and model id.
 * @throws LlmError coded `DISCOVERY_FAILED` when the document is not an object of providers.
 */
export function readModelMetadata(body: unknown): ModelMetadataIndex {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw new LlmError('the model metadata document is not an object keyed by provider id', 'DISCOVERY_FAILED')
  }
  const index = new Map<string, Map<string, ModelMetadata>>()
  for (const [provider, rawProvider] of Object.entries(body)) {
    const models = (rawProvider as { models?: unknown } | null)?.models
    if (models === null || typeof models !== 'object' || Array.isArray(models)) continue
    const entries = new Map<string, ModelMetadata>()
    for (const [id, raw] of Object.entries(models)) {
      const entry = readEntry(raw)
      if (entry !== undefined) entries.set(id, entry)
    }
    if (entries.size > 0) index.set(provider, entries)
  }
  return index
}

/**
 * Download and read one directory document.
 * @param url - the directory URL the user configured.
 * @param signal - cancels the request.
 * @returns the entries by provider and model id.
 * @throws LlmError coded `DISCOVERY_FAILED` when the host is unreachable, answers an error, sends more than
 *   the size ceiling, or sends something that is not JSON or not a directory.
 */
export async function fetchModelMetadata(url: string, signal?: AbortSignal): Promise<ModelMetadataIndex> {
  let response: Response
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: { accept: 'application/json' },
      ...signal === undefined ? {} : { signal },
    })
  } catch (error: unknown) {
    throw new LlmError(`could not reach ${url}`, 'DISCOVERY_FAILED', { cause: error })
  }
  if (!response.ok) {
    await response.body?.cancel()
    throw new LlmError(`${url} answered ${response.status}`, 'DISCOVERY_FAILED')
  }
  const text = await readBounded(response, url, MAX_DIRECTORY_BYTES)
  let body: unknown
  try {
    body = JSON.parse(text)
  } catch (error: unknown) {
    throw new LlmError(`${url} did not answer with JSON`, 'DISCOVERY_FAILED', { cause: error })
  }
  return readModelMetadata(body)
}

/**
 * The directory contents currently in force. Empty until a cached copy loads
 * or a refresh succeeds; replaced whole by each of those.
 */
export class ModelMetadataStore implements ModelMetadataLookup {
  private index: ModelMetadataIndex = new Map()
  private revisionValue = 0

  /** Increments on every {@link replace}, so a memoized catalog knows to resolve again. */
  get revision(): number {
    return this.revisionValue
  }

  /** The entries in force, for persisting a cache copy. */
  get snapshot(): ModelMetadataIndex {
    return this.index
  }

  /**
   * Swap in a new directory.
   * @param next - entries by provider and model id.
   */
  replace(next: ModelMetadataIndex): void {
    this.index = next
    this.revisionValue += 1
  }

  /** @inheritdoc */
  lookup(provider: string, model: string): ModelMetadata | undefined {
    return this.index.get(provider)?.get(model)
  }
}

/**
 * The list price one directory entry gives pi-ai.
 * @param metadata - the directory entry, if any.
 * @returns pricing for a nonzero input and output rate; `undefined` otherwise, which keeps the lower-precedence price.
 */
export function metadataPricing(metadata: ModelMetadata | undefined): LlmModelPricing | undefined {
  const pricing = metadata?.pricing
  return pricing === undefined || (pricing.input === 0 && pricing.output === 0) ? undefined : pricing
}

/** Serializable form of the index, for the cache copy. */
export type StoredModelMetadata = Readonly<Record<string, Readonly<Record<string, ModelMetadata>>>>

/**
 * Convert an index to its stored form.
 * @param index - entries by provider and model id.
 * @returns plain objects safe to persist as JSON.
 */
export function storeModelMetadata(index: ModelMetadataIndex): StoredModelMetadata {
  return Object.fromEntries([...index].map(([provider, models]) => [provider, Object.fromEntries(models)]))
}

/**
 * Convert a stored copy back to an index.
 * @param stored - a value previously produced by {@link storeModelMetadata}.
 * @returns the entries by provider and model id.
 */
export function loadModelMetadata(stored: StoredModelMetadata): ModelMetadataIndex {
  return new Map(Object.entries(stored).map(([provider, models]) => [provider, new Map(Object.entries(models))]))
}
