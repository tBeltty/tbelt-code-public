/**
 * Profile writes for adding a provider: the model entries to store, the
 * settings edits that turn one profile into another, and the rules a
 * hand-declared provider must meet before anything is written.
 * @module @deepseek-ai/dsh-presentation-settings/provider-profile
 */
import type { JsonValue } from '@deepseek-ai/dsh-util-values'

/** List price in US dollars per million tokens, as the provider or catalog publishes it. */
export interface ModelPricing {
  readonly input: number
  readonly output: number
  readonly cacheRead?: number | undefined
  readonly cacheWrite?: number | undefined
}

/** A model the provider disclosed, as `llm.discoverModels` reports it. */
export interface DiscoveredModel {
  readonly id: string
  readonly name?: string | undefined
  readonly contextWindow?: number | undefined
  readonly maxTokens?: number | undefined
  readonly inputModalities?: readonly string[] | undefined
  readonly pricing?: ModelPricing | undefined
}

/** A model entry in a stored provider profile. */
export type ModelEntry = {
  id: string
  name?: string
  contextWindow?: number
  maxTokens?: number
  input?: string[]
  pricing?: { input: number; output: number; cacheRead?: number | undefined; cacheWrite?: number | undefined }
}

/** One settings edit, in the form `settings.mutate` takes. */
export type ProfileOp =
  | { op: 'set'; path: string[]; value: JsonValue }
  | { op: 'unset'; path: string[] }

/**
 * Turn a discovered model into the entry a profile stores.
 * @param candidate - a model the provider disclosed.
 * @returns the entry, carrying only the facts the provider disclosed.
 */
export function modelEntry(candidate: DiscoveredModel): ModelEntry {
  return {
    id: candidate.id,
    ...candidate.name === undefined ? {} : { name: candidate.name },
    ...candidate.contextWindow === undefined ? {} : { contextWindow: candidate.contextWindow },
    ...candidate.maxTokens === undefined ? {} : { maxTokens: candidate.maxTokens },
    ...candidate.inputModalities === undefined ? {} : { input: [...candidate.inputModalities] },
    ...candidate.pricing === undefined ? {} : { pricing: { ...candidate.pricing } },
  }
}

/**
 * Settings edits that turn one profile object into another, field by field.
 * @param base - path to the profile object.
 * @param before - the profile as stored; anything that is not an object counts as empty.
 * @param after - the profile to store.
 * @returns a `set` for each changed field and an `unset` for each removed one.
 */
export function profileOps(base: readonly string[], before: unknown, after: Readonly<Record<string, unknown>>): ProfileOp[] {
  const previous = typeof before === 'object' && before !== null && !Array.isArray(before)
    ? before as Record<string, unknown>
    : {}
  const ops: ProfileOp[] = []
  for (const [key, value] of Object.entries(after)) {
    if (JSON.stringify(previous[key]) === JSON.stringify(value)) continue
    ops.push({ op: 'set', path: [...base, key], value: value as JsonValue })
  }
  for (const key of Object.keys(previous)) {
    if (!(key in after)) ops.push({ op: 'unset', path: [...base, key] })
  }
  return ops
}

/**
 * Settings edits that store the key reference and the chosen models on a provider's profile.
 * @param path - path to the provider's profile.
 * @param stored - the profile as stored in the user layer, or undefined when the user layer has none.
 * @param keyRef - credential reference the key is stored under, or undefined for a provider set up without a key,
 * which leaves any reference the profile already names.
 * @param models - the models to store.
 * @returns one `set` of the whole profile when none is stored, otherwise the field edits.
 */
export function setupOps(
  path: readonly string[],
  stored: unknown,
  keyRef: string | undefined,
  models: readonly DiscoveredModel[],
): ProfileOp[] {
  const current = typeof stored === 'object' && stored !== null && !Array.isArray(stored)
    ? stored as Record<string, unknown>
    : undefined
  const after: Record<string, unknown> = {
    ...current,
    ...keyRef === undefined ? {} : { apiKeyEnv: keyRef },
    models: models.map(modelEntry),
  }
  return current === undefined
    ? [{ op: 'set', path: [...path], value: after as JsonValue }]
    : profileOps(path, current, after)
}

/** The fields a hand-declared provider needs. */
export interface CustomProviderDraft {
  readonly route: string
  readonly displayName: string
  readonly baseURL: string
  readonly api: string
  /** Credential reference, or undefined for a provider that authenticates without a stored key. */
  readonly keyRef?: string | undefined
  readonly models: readonly DiscoveredModel[]
}

/**
 * The profile a hand-declared provider stores.
 * @param draft - the validated fields.
 * @returns the profile, with the display name and key reference only when given.
 */
export function customProfile(draft: CustomProviderDraft): Record<string, unknown> {
  return {
    ...draft.displayName === '' ? {} : { displayName: draft.displayName },
    ...draft.keyRef === undefined ? {} : { apiKeyEnv: draft.keyRef },
    api: draft.api,
    baseURL: draft.baseURL,
    models: draft.models.map(modelEntry),
  }
}

/**
 * A route id usable as a settings key and as the stem of a credential reference. It starts with a letter because the
 * reference derived from it cannot start with a digit.
 */
export const ROUTE_PATTERN: RegExp = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/

/**
 * Whether text is an http or https URL.
 * @param value - candidate base URL.
 * @returns true for an absolute http or https URL.
 */
export function isHttpUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value)
    return protocol === 'http:' || protocol === 'https:'
  } catch {
    // `new URL` throws for anything that is not an absolute URL.
    return false
  }
}

/** Hosts that never leave this computer, where plain HTTP exposes nothing. */
const LOOPBACK_HOSTS: ReadonlySet<string> = new Set(['localhost', '127.0.0.1', '[::1]'])

/**
 * Whether an endpoint sends its key unencrypted to another machine.
 * @param url - an http or https URL that {@link isHttpUrl} accepts.
 * @returns true for an `http:` URL whose host is not this computer.
 */
export function cleartextRemote(url: string): boolean {
  const parsed = new URL(url)
  return parsed.protocol === 'http:' && !LOOPBACK_HOSTS.has(parsed.hostname) && !parsed.hostname.endsWith('.localhost')
}
