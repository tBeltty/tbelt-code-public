/**
 * The provider list a settings screen shows: the providers the Host can
 * configure joined with the routes that are live now, and the credential
 * reference each one stores its API key under.
 * @module @deepseek-ai/dsh-presentation-settings/provider-directory
 */

/** A live provider route, as `llm.listProviders` reports it. */
export interface RegisteredProvider {
  readonly id: string
  readonly name: string
}

/** A provider the Host can configure, as `llm.listConfigurableProviders` reports it. */
export interface ConfigurableProvider {
  readonly provider: string
  readonly displayName: string
  /** Settings namespace whose section configures the provider. */
  readonly settingsNs: string
  /** Path from that section's root to the provider's profile; empty when the section is the profile. */
  readonly settingsPath: readonly string[]
  readonly declared?: boolean | undefined
  /** Configuration problem the Host reports for the provider. */
  readonly error?: string | undefined
}

/** One provider row after joining the configurable list with the live routes. */
export interface ProviderDirectoryEntry {
  readonly provider: string
  readonly displayName: string
  readonly settingsNs: string
  readonly settingsPath: readonly string[]
  /** Whether the route is live now. */
  readonly active: boolean
  readonly declared?: boolean
  readonly error?: string
}

/** Route ids that the provider list places first, in this order. */
const LEADING_ROUTES: readonly string[] = ['deepseek-account', 'deepseek-official']

/**
 * Join the configurable providers with the live routes.
 * @param registered - live provider routes in registration order.
 * @param directory - configurable providers in declaration order.
 * @returns the account and official routes first, then every other route in its original order; a live route no
 * adapter declares as configurable has an empty settings address.
 */
export function joinProviderDirectory(
  registered: readonly RegisteredProvider[],
  directory: readonly ConfigurableProvider[],
): ProviderDirectoryEntry[] {
  const active = new Set(registered.map(provider => provider.id))
  const declared = new Set(directory.map(entry => entry.provider))
  const rows: ProviderDirectoryEntry[] = directory.map(entry => ({
    provider: entry.provider,
    displayName: entry.displayName,
    settingsNs: entry.settingsNs,
    settingsPath: [...entry.settingsPath],
    active: active.has(entry.provider),
    ...entry.declared === undefined ? {} : { declared: entry.declared },
    ...entry.error === undefined ? {} : { error: entry.error },
  }))
  for (const provider of registered) {
    if (declared.has(provider.id)) continue
    rows.push({ provider: provider.id, displayName: provider.name, settingsNs: '', settingsPath: [], active: true })
  }
  const rank = (provider: string): number => {
    const index = LEADING_ROUTES.indexOf(provider)
    return index === -1 ? LEADING_ROUTES.length : index
  }
  return rows.toSorted((left, right) => rank(left.provider) - rank(right.provider))
}

/**
 * Derive the conventional credential reference for a provider route. A typed key stores under this reference and the
 * profile records it as `apiKeyEnv`, so no screen asks for an environment variable name.
 * @param provider - provider route id, such as `anthropic` or `minimax-cn`.
 * @returns the reference, such as `MINIMAX_CN_API_KEY`.
 */
export function deriveKeyRef(provider: string): string {
  return `${provider.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}_API_KEY`
}

/**
 * The credential reference a provider's profile names.
 * @param profile - the provider's resolved profile, when one exists.
 * @param provider - provider route id.
 * @returns the profile's `apiKeyEnv` when it names one, otherwise the conventional reference.
 */
export function providerKeyRef(profile: unknown, provider: string): string {
  const named = typeof profile === 'object' && profile !== null
    ? (profile as { readonly apiKeyEnv?: unknown }).apiKeyEnv
    : undefined
  return typeof named === 'string' && named.length > 0 ? named : deriveKeyRef(provider)
}
