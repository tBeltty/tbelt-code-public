/**
 * The provider list of `/providers`: one row per provider and the row that adds
 * a local or custom one.
 * @module @deepseek-ai/dsh-terminal-views/providers
 */
import { t } from './copy.ts'
import type { PickerItem } from './picker.ts'

/** Item value of the row that adds a local or custom provider. */
export const CUSTOM_PROVIDER = '\u0000custom'

/** What the list shows about one provider. */
export interface ProviderListRow {
  /** Route id the list returns when the row is chosen. */
  readonly provider: string
  readonly displayName: string
  /** Whether the Host can route requests to the provider now. */
  readonly active: boolean
  /** Why the provider is broken, when it is. */
  readonly error?: string | undefined
  /** Whether a settings layer configures the provider. */
  readonly configured: boolean
  /** Whether the profile names an API key. */
  readonly needsKey: boolean
  /** Whether that key is stored. */
  readonly keyConfigured: boolean
}

/** Whether a provider works without further setup. */
function ready(row: ProviderListRow): boolean {
  return row.active && (!row.needsKey || row.keyConfigured)
}

/** The state of one provider in words. */
function status(row: ProviderListRow): string {
  if (row.error !== undefined) return t('providers.status.error', { message: row.error })
  if (ready(row)) return t(row.needsKey ? 'providers.status.ready' : 'providers.status.readyNoKey')
  return t(row.configured ? 'providers.status.needsKey' : 'providers.status.notSetUp')
}

/**
 * Rows of the provider list.
 * @param rows - the providers and what is known about each.
 * @returns the add-a-local-provider row, then providers that work now, then the rest in the given order.
 */
export function providerItems(rows: readonly ProviderListRow[]): PickerItem[] {
  const items = rows.map(row => ({ value: row.provider, label: row.displayName, detail: status(row), current: ready(row) }))
  return [
    { value: CUSTOM_PROVIDER, label: t('providers.addLocal'), detail: t('providers.addLocalDetail') },
    ...items.filter(item => item.current),
    ...items.filter(item => !item.current),
  ]
}
