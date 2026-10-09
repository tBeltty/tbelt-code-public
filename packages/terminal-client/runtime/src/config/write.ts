/**
 * Settings writes for the configuration flows: one `settings.mutate` call whose
 * refusal is reported in words.
 * @module @deepseek-ai/dsh-terminal-client/config/write
 */
import { t } from '@deepseek-ai/dsh-terminal-views'
import type { RemotePort, SettingsNamespacePort, SettingsOpPort } from '../ports.ts'
import type { FlowUi } from './ui.ts'

/**
 * Apply edits to one namespace's user layer.
 * @param remote - the Remote namespaces of the connected client.
 * @param ui - where a refusal is printed.
 * @param ns - the settings namespace.
 * @param ops - the edits, applied in order.
 * @param revision - the revision the caller read; a namespace that moved since is refused as a conflict.
 * @returns the namespace as stored after the write, or undefined after a refusal was printed.
 */
export async function writeSettings(
  remote: RemotePort,
  ui: FlowUi,
  ns: string,
  ops: readonly SettingsOpPort[],
  revision: number | undefined,
): Promise<SettingsNamespacePort | undefined> {
  let result
  try {
    result = await remote.settings.mutate(ns, ops, revision)
  } catch (error) {
    ui.warn(t('settings.writeFailed', { message: error instanceof Error ? error.message : String(error) }))
    return undefined
  }
  if (result.ok) return result.value
  ui.warn(result.error.code === 'settings/conflict' ? t('settings.conflict') : t('settings.writeFailed', { message: result.error.message }))
  return undefined
}
