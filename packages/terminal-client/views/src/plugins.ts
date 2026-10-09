/**
 * Rows of the plugin screens: bundles and single plugins.
 * @module @deepseek-ai/dsh-terminal-views/plugins
 */
import { t } from './copy.ts'
import type { PickerItem } from './picker.ts'

/** Item value of the row that installs a bundle. */
export const PLUGIN_INSTALL = '\u0000install'

/** Item value of the row that lists single plugins. */
export const PLUGIN_SINGLE = '\u0000plugins'

/** One plugin bundle. */
export interface BundleRow {
  readonly name: string
  readonly version?: string | undefined
  readonly enabled: boolean
  /** Whether the person installed it, as opposed to the installation supplying it. */
  readonly installed: boolean
  readonly optional: boolean
  readonly error?: { readonly code: string } | undefined
}

/** The state of a bundle in words. */
function bundleDetail(bundle: BundleRow): string {
  if (bundle.error !== undefined) return t('plugins.status.error', { code: bundle.error.code })
  return [
    t(bundle.enabled ? 'plugins.status.on' : 'plugins.status.off'),
    bundle.version,
    t(bundle.installed ? 'plugins.status.installed' : 'plugins.status.supplied'),
    ...bundle.optional ? [t('plugins.status.optional')] : [],
  ].filter(Boolean).join(' · ')
}

/**
 * Rows of the bundle list.
 * @param bundles - the bundles the Host lists.
 * @returns the install row, one row per bundle and the row for single plugins.
 */
export function bundleItems(bundles: readonly BundleRow[]): PickerItem[] {
  return [
    { value: PLUGIN_INSTALL, label: t('plugins.install'), detail: t('plugins.installDetail') },
    ...bundles.map(bundle => ({ value: bundle.name, label: bundle.name, detail: bundleDetail(bundle), current: bundle.enabled })),
    { value: PLUGIN_SINGLE, label: t('plugins.single'), detail: t('plugins.singleDetail') },
  ]
}

/** One running plugin. */
export interface PluginRow {
  readonly entryId: string
  readonly moduleName: string
  readonly enabled: boolean
  /** Why the plugin cannot be switched, when it cannot. */
  readonly readOnlyReason?: string | undefined
}

/**
 * Rows of the single plugin list.
 * @param plugins - the plugins of the running profile.
 * @returns one row per plugin with its state.
 */
export function pluginItems(plugins: readonly PluginRow[]): PickerItem[] {
  return plugins.map(plugin => ({
    value: plugin.entryId,
    label: plugin.moduleName,
    detail: [t(plugin.enabled ? 'plugins.status.on' : 'plugins.status.off'), ...plugin.readOnlyReason === undefined ? [] : [t('plugins.status.readOnly')]].join(' · '),
    current: plugin.enabled,
  }))
}
