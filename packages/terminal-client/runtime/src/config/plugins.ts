/**
 * The `/plugins` screen: list the plugin bundles, turn them on and off, install
 * one from a package spec, remove one, and switch single plugins, through the
 * `pluginManager` Remote methods the GUI plugin manager calls.
 * @module @deepseek-ai/dsh-terminal-client/config/plugins
 */
import { bundleItems, PLUGIN_INSTALL, PLUGIN_SINGLE, pluginItems, t } from '@deepseek-ai/dsh-terminal-views'
import type { PickerItem } from '@deepseek-ai/dsh-terminal-views'
import type { BundlePort, ChangeResultPort, RemotePort } from '../ports.ts'
import { confirm, remoteValue } from './ui.ts'
import type { FlowUi } from './ui.ts'

/** Say how a change ended. */
function report(ui: FlowUi, result: ChangeResultPort, done: string): void {
  for (const warning of result.warnings ?? []) ui.info(warning)
  if (result.application === 'applied' || result.application === 'restart-required') {
    ui.info(result.application === 'applied' ? done : t('plugins.restart', { target: result.target }))
    return
  }
  const reason = result.error === undefined ? result.application : `${result.error.code}${result.error.diagnostic === undefined ? '' : `: ${result.error.diagnostic}`}`
  ui.warn(t('plugins.failed', { target: result.target, reason }))
  const builds = result.pendingBuilds ?? []
  if (builds.length > 0) ui.warn(t('plugins.pendingBuilds', { packages: builds.join(', ') }))
}

/** Install a package after the Host inspects it and the person confirms. */
async function install(remote: RemotePort, ui: FlowUi): Promise<void> {
  const spec = await ui.ask(t('plugins.specPrompt'), { hint: t('plugins.specHint') })
  if (spec === undefined || spec === '') return
  const inspected = await remoteValue(ui, message => t('plugins.inspectFailed', { message }), () => remote.pluginManager.inspect(spec))
  if (inspected === undefined) return
  if (inspected.status === 'refused') {
    ui.warn(t('plugins.refused', { reason: inspected.reason }))
    return
  }
  if (inspected.bundle === false) {
    ui.warn(t('plugins.notBundle', { name: inspected.name ?? spec }))
    return
  }
  const name = `${inspected.name ?? spec}${inspected.version === undefined ? '' : `@${inspected.version}`}`
  if (inspected.description !== undefined) ui.info(inspected.description)
  if (!await confirm(ui, t('plugins.installAsk', { name }), t('plugins.installYes'))) return
  ui.info(t('plugins.installing', { name }))
  const result = await remoteValue(ui, message => t('plugins.failed', { target: spec, reason: message }), () => remote.pluginManager.installBundle(spec))
  if (result !== undefined) report(ui, result, t('plugins.installed', { name }))
}

/** Offer the actions on one bundle. */
async function actOnBundle(remote: RemotePort, ui: FlowUi, bundle: BundlePort): Promise<void> {
  const toggle = bundle.readOnlyReason === undefined
    ? [{ value: 'toggle', label: t(bundle.enabled ? 'plugins.turnOff' : 'plugins.turnOn') }]
    : []
  const items: PickerItem[] = [...toggle, ...bundle.removable ? [{ value: 'remove', label: t('plugins.remove') }] : []]
  if (items.length === 0) {
    ui.info(t('plugins.readOnly', { name: bundle.name }))
    return
  }
  if (bundle.description !== undefined) ui.info(bundle.description)
  const picked = await ui.pick(bundle.name, items)
  if (picked?.value === 'toggle') {
    const result = await remoteValue(ui, message => t('plugins.failed', { target: bundle.name, reason: message }), () => remote.pluginManager.setBundleEnabled(bundle.name, !bundle.enabled))
    if (result !== undefined) report(ui, result, t(bundle.enabled ? 'plugins.turnedOff' : 'plugins.turnedOn', { name: bundle.name }))
  } else if (picked?.value === 'remove' && await confirm(ui, t('plugins.removeAsk', { name: bundle.name }), t('plugins.removeYes'))) {
    const result = await remoteValue(ui, message => t('plugins.failed', { target: bundle.name, reason: message }), () => remote.pluginManager.removeBundle(bundle.name))
    if (result !== undefined) report(ui, result, t('plugins.removed', { name: bundle.name }))
  }
}

/** Switch one plugin on or off. */
async function switchPlugin(remote: RemotePort, ui: FlowUi): Promise<void> {
  const plugins = await remoteValue(ui, message => t('picker.loadFailed', { message }), () => remote.pluginManager.listPlugins())
  if (plugins === undefined) return
  const picked = await ui.pick(t('plugins.singleTitle'), pluginItems(plugins))
  const plugin = plugins.find(candidate => candidate.entryId === picked?.value)
  if (plugin === undefined) return
  if (plugin.readOnlyReason !== undefined) {
    ui.info(t('plugins.readOnly', { name: plugin.moduleName }))
    return
  }
  const result = await remoteValue(ui, message => t('plugins.failed', { target: plugin.moduleName, reason: message }), () => remote.pluginManager.setPluginEnabled(plugin.entryId, !plugin.enabled))
  if (result !== undefined) report(ui, result, t(plugin.enabled ? 'plugins.turnedOff' : 'plugins.turnedOn', { name: plugin.moduleName }))
}

/**
 * Run the `/plugins` screen once.
 * @param remote - the Remote namespaces of the connected client.
 * @param ui - where questions and messages go.
 * @returns settles when the person finished or left the screen.
 */
export async function runPlugins(remote: RemotePort, ui: FlowUi): Promise<void> {
  const bundles = await remoteValue(ui, message => t('picker.loadFailed', { message }), () => remote.pluginManager.listBundles())
  if (bundles === undefined) return
  const picked = await ui.pick(t('plugins.title'), bundleItems(bundles))
  if (picked === undefined) return
  if (picked.value === PLUGIN_INSTALL) await install(remote, ui)
  else if (picked.value === PLUGIN_SINGLE) await switchPlugin(remote, ui)
  else await actOnBundle(remote, ui, bundles.find(candidate => candidate.name === picked.value) as BundlePort)
}
