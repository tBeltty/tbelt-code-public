/**
 * Rows of the settings screens: the web search provider list, the settings
 * namespaces and the values of one namespace.
 * @module @deepseek-ai/dsh-terminal-views/settings
 */
import { t } from './copy.ts'
import type { PickerItem } from './picker.ts'
import { truncate } from './width.ts'

/** Item value of the row that opens the settings file. */
export const SETTINGS_DOCUMENT = '\u0000document'

/** Item value of the web search row that lets the service choose. */
export const WEB_SEARCH_AUTOMATIC = '\u0000automatic'

/** Longest value shown in a list row. */
const VALUE_WIDTH = 40

/**
 * A value in a list row or hint.
 * @param value - the stored value, or undefined when none is set.
 * @returns JSON text cut to the row width, or the words for no value.
 */
export function shownValue(value: unknown): string {
  if (value === undefined) return t('settings.unset')
  return truncate(JSON.stringify(value), VALUE_WIDTH)
}

/** One web search provider. */
export interface WebSearchRow {
  readonly id: string
  /** Whether its key is stored. */
  readonly keyConfigured: boolean
}

/**
 * Rows of the web search provider list.
 * @param providers - the providers the Host offers.
 * @param pinned - the provider the settings pin, or undefined for automatic.
 * @returns the automatic row, then one row per provider with its key state.
 */
export function webSearchItems(providers: readonly WebSearchRow[], pinned: string | undefined): PickerItem[] {
  return [
    { value: WEB_SEARCH_AUTOMATIC, label: t('webSearch.automatic'), detail: t('webSearch.automaticDetail'), current: pinned === undefined },
    ...providers.map(provider => ({
      value: provider.id,
      label: provider.id,
      detail: t(provider.keyConfigured ? 'webSearch.keySet' : 'webSearch.noKey'),
      current: provider.id === pinned,
    })),
  ]
}

/** One editable value of a settings namespace. */
export interface SettingRow {
  /** Dotted path, also the item value. */
  readonly name: string
  readonly secret: boolean
  /** Whether a secret value is stored. */
  readonly secretSet: boolean
  /** The current value; never read for a secret. */
  readonly value: unknown
  readonly description: string | undefined
}

/**
 * Rows of the value list of one namespace.
 * @param rows - the editable values.
 * @returns one row per value with its current value or, for a secret, whether one is stored.
 */
export function settingItems(rows: readonly SettingRow[]): PickerItem[] {
  return rows.map((row) => {
    const current = row.secret ? t(row.secretSet ? 'settings.secretSet' : 'settings.secretUnset') : shownValue(row.value)
    return { value: row.name, label: row.name, detail: [current, row.description].filter(Boolean).join(' · ') }
  })
}

/**
 * Rows of the namespace list.
 * @param namespaces - namespace names with their number of editable values.
 * @returns the settings-file row, then one row per namespace that has values.
 */
export function namespaceItems(namespaces: readonly { readonly ns: string; readonly count: number }[]): PickerItem[] {
  return [
    { value: SETTINGS_DOCUMENT, label: t('settings.openDocument'), detail: t('settings.openDocumentDetail') },
    ...namespaces.filter(entry => entry.count > 0).map(entry => ({ value: entry.ns, label: entry.ns, detail: t('settings.count', { count: entry.count }) })),
  ]
}
