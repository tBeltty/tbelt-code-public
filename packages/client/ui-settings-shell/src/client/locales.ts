/** Locale bundles for the shell executor's settings page. */

import type { SettingsFormLabels } from '@deepseek-ai/dsh-client-ui-primitives'

/** Locale keys the page renders. */
export type ShellSettingsLocaleKey =
  | 'title' | 'description'
  | 'timeoutMs' | 'timeoutMsHint' | 'maxOutputBytes' | 'maxOutputBytesHint'
  | 'overridden' | 'reset' | 'readOnly' | 'unavailable'
  | 'save' | 'saving' | 'saveFailed' | 'invalidNumber'

/** English copy. */
export const en = {
  title: 'Shell',
  description: 'Limit how long each command may run and how much it may output.',
  timeoutMs: 'Command timeout (ms)',
  timeoutMsHint: 'How long one command may run before it is terminated.',
  maxOutputBytes: 'Output cap per stream (bytes)',
  maxOutputBytesHint: 'Output beyond this spills to a temporary file rather than being lost.',
  overridden: 'Overridden',
  reset: 'Reset to default',
  readOnly: 'This deployment stores settings read-only.',
  unavailable: 'This plugin is not loaded, so it cannot be configured right now.',
  save: 'Save',
  saving: 'Saving…',
  saveFailed: 'The deployment did not accept these values; they were left for you to correct.',
  invalidNumber: 'Enter a number, or leave blank to use the default.',
} satisfies Record<string, string>

/** Spanish dictionary, checked complete against the English key set. */
export const es = {
  title: 'Shell',
  description: 'Limita cuánto puede durar cada comando y cuánta salida puede producir.',
  timeoutMs: 'Tiempo límite del comando (ms)',
  timeoutMsHint: 'Cuánto puede ejecutarse un comando antes de que se termine.',
  maxOutputBytes: 'Límite de salida por flujo (bytes)',
  maxOutputBytesHint: 'La salida que supere este límite pasa a un archivo temporal en lugar de perderse.',
  overridden: 'Modificado',
  reset: 'Restablecer el valor predeterminado',
  readOnly: 'Esta instalación guarda los ajustes en modo de solo lectura.',
  unavailable: 'Este plugin no está cargado, así que ahora no se puede configurar.',
  save: 'Guardar',
  saving: 'Guardando…',
  saveFailed: 'La instalación no aceptó estos valores; se dejaron para que los corrijas.',
  invalidNumber: 'Introduce un número, o déjalo en blanco para usar el valor predeterminado.',
} satisfies Record<keyof typeof en, string>

/**
 * The form frame's copy, read from this page's dictionary.
 * @param t - the page's locale reader.
 * @returns the labels the shared settings form renders.
 */
export function formLabels(t: (key: ShellSettingsLocaleKey) => string): SettingsFormLabels {
  return { unavailable: t('unavailable'), readOnly: t('readOnly'), saveFailed: t('saveFailed'), save: t('save'), saving: t('saving') }
}
