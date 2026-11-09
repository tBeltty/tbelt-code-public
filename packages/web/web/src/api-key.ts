/**
 * A search provider's API key: a literal from configuration, or a credential
 * reference resolved at each search through the credentials service, falling
 * back to the launch environment where no credentials service is mounted.
 * @module @deepseek-ai/dsh-web/api-key
 */

import type { Context } from '@deepseek-ai/cordis'
import { credentialRef, type CredentialRef } from '@deepseek-ai/dsh-credentials'
import { launchEnvironmentOf } from '@deepseek-ai/dsh-launch-environment'
import { WebError } from './types.ts'

/** The query a provider's `checkKey` searches for: one minimal, harmless search. */
export const KEY_CHECK_QUERY = 'web search'

/** What a provider reads its API key from; {@link SearchApiKey} is the plugin form. */
export interface SearchKeySource {
  /** Credential reference a configuration surface writes the key to, when there is one. */
  readonly ref?: string
  /** @returns whether a key is known to be present; never makes a network call. */
  configured(): boolean
  /** @returns the key for one request, or `undefined` while none is configured. */
  resolve(): Promise<string | undefined>
}

/**
 * Normalize a provider's key option: a literal string (tests and library
 * callers) or a source that resolves at each request.
 * @param apiKey - the literal key, or its source.
 * @returns a source; a literal is configured exactly when non-empty and has no reference.
 */
export function searchKeySource(apiKey: string | SearchKeySource): SearchKeySource {
  if (typeof apiKey !== 'string') return apiKey
  return { configured: () => apiKey.length > 0, resolve: () => Promise.resolve(apiKey.length > 0 ? apiKey : undefined) }
}

/**
 * Resolve the key for one search, or fail before anything is sent.
 * @param source - the provider's key source.
 * @param label - provider name for the error message.
 * @returns the key.
 * @throws WebError `WEB_PROVIDER_AUTH` while no key is configured.
 */
export async function requireSearchKey(source: SearchKeySource, label: string): Promise<string> {
  const apiKey = await source.resolve()
  if (apiKey === undefined) throw new WebError(`${label} has no API key configured; the user must add one`, 'WEB_PROVIDER_AUTH')
  return apiKey
}

/**
 * The key one provider plugin authenticates with.
 *
 * `configured()` answers a provider's synchronous `available()`: it is the
 * last state the credentials service reported for the reference, refreshed
 * when the service appears and on every `credentials/reference-updated` for
 * it. `resolve()` reads the current value at each search, so a key written
 * after startup reaches the next search without a restart.
 */
export class SearchApiKey implements SearchKeySource {
  /** The reference the key is read from and written to. */
  readonly ref: CredentialRef
  private known = false

  /**
   * Watch the reference for the plugin's lifetime.
   * @param ctx - the provider plugin's context; the watches end with it.
   * @param ref - credential reference naming the key.
   * @param literal - a key from configuration; when non-empty it wins over the reference.
   */
  constructor(private readonly ctx: Context, ref: string, private readonly literal: string | undefined) {
    this.ref = credentialRef(ref)
    if (this.hasLiteral()) return
    this.known = this.ambient() !== undefined
    ctx.effect(() => ctx.on('credentials/reference-updated', (updated) => {
      if (updated === this.ref) void this.refresh()
    }), 'web: search key updates')
    ctx.effect(() => ctx.on('internal/service', (name) => {
      if (name === 'credentials') void this.refresh()
    }), 'web: credentials service')
    void this.refresh()
  }

  /** @returns whether a key was present at the last refresh; never makes a network call. */
  configured(): boolean {
    return this.hasLiteral() || this.known
  }

  /** @returns the key to send with one search, or `undefined` while none is configured. */
  async resolve(): Promise<string | undefined> {
    if (this.hasLiteral()) return this.literal
    const credentials = this.ctx.get('credentials')
    const value = credentials === undefined ? this.ambient() : (await credentials.resolve(this.ref))?.value
    this.known = value !== undefined && value.length > 0
    return this.known ? value : undefined
  }

  private hasLiteral(): boolean {
    return this.literal !== undefined && this.literal.length > 0
  }

  private ambient(): string | undefined {
    const value = launchEnvironmentOf(this.ctx).get(this.ref)?.value
    return value !== undefined && value.length > 0 ? value : undefined
  }

  private async refresh(): Promise<void> {
    const credentials = this.ctx.get('credentials')
    if (credentials === undefined) {
      this.known = this.ambient() !== undefined
      return
    }
    try {
      this.known = (await credentials.describe(this.ref)).configured
    } catch (error: unknown) {
      // The last known state stands; the next search resolves the key directly.
      this.ctx.logger.warn('web: could not read whether %s is configured: %s', this.ref, error)
    }
  }
}
