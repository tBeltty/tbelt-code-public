/**
 * The `/permissions` screen: choose how freely the agent may act, for this
 * session and optionally for new sessions. The catalog and the default come
 * from the same Remote calls as the GUI permission menu; the session switch is
 * the `/permission` command the Host already offers.
 * @module @deepseek-ai/dsh-terminal-client/config/permissions
 */
import { permissionItems, t } from '@deepseek-ai/dsh-terminal-views'
import type { RemotePort, RemoteResultPort } from '../ports.ts'
import { confirm, remoteValue } from './ui.ts'
import type { FlowUi } from './ui.ts'
import { writeSettings } from './write.ts'

/** The settings namespace that stores the default preset. */
const PERMISSION_NS = 'permission'

/** The preset that lets the agent act outside the sandbox. */
const FULL_ACCESS = 'danger-full-access'

/**
 * Run the `/permissions` screen once.
 * @param remote - the Remote namespaces of the connected client.
 * @param ui - where questions and messages go.
 * @param command - runs a slash command line in the open session.
 * @returns settles when the person finished or left the screen.
 */
export async function runPermissions(
  remote: RemotePort,
  ui: FlowUi,
  command: (line: string) => Promise<RemoteResultPort<{ readonly matched: boolean }>>,
): Promise<void> {
  const catalog = await remoteValue(ui, message => t('picker.loadFailed', { message }), () => remote.permissionPresets.catalog())
  if (catalog === undefined) return
  const picked = await ui.pick(t('permissions.title'), permissionItems(catalog.options, catalog.defaultPreset))
  const option = catalog.options.find(candidate => candidate.value === picked?.value)
  if (option === undefined) return
  if (option.value === FULL_ACCESS && !await confirm(ui, t('permissions.fullAccessAsk'), t('permissions.fullAccessYes'))) return
  const canDefault = catalog.defaultOptions.some(candidate => candidate.value === option.value)
  const scope = canDefault
    ? await ui.pick(option.name, [
      { value: 'session', label: t('permissions.scope.session') },
      { value: 'both', label: t('permissions.scope.both') },
    ])
    : { value: 'session' }
  if (scope === undefined) return
  const switched = await remoteValue(ui, message => t('permissions.failed', { message }), () => command(`/permission ${option.value}`))
  if (switched === undefined) return
  if (!switched.matched) {
    ui.warn(t('permissions.noCommand'))
    return
  }
  ui.info(t('permissions.session', { name: option.name }))
  if (scope.value !== 'both') return
  const described = await remoteValue(ui, message => t('picker.loadFailed', { message }), () => remote.settings.describe())
  const namespace = described?.namespaces.find(candidate => candidate.ns === PERMISSION_NS)
  if (namespace === undefined) return
  if (await writeSettings(remote, ui, PERMISSION_NS, [{ op: 'set', path: ['defaultPreset'], value: option.value }], namespace.revision) !== undefined) {
    ui.info(t('permissions.default', { name: option.name }))
  }
}
