/** Locale bundles for the Subagent settings page. */

import type { SettingsFormLabels } from '@deepseek-ai/dsh-client-ui-primitives'

/** Locale keys the page renders. */
export type SubagentSettingsLocaleKey =
  | 'overridden' | 'reset' | 'readOnly' | 'unavailable'
  | 'save' | 'saving' | 'saveFailed'
  | 'subagentTitle' | 'subagentDescription' | 'subagentLimitsTitle'
  | 'subagentMaxDepth'
  | 'subagentDepthHelpLabel' | 'subagentDepthHelp'
  | 'subagentDepthZero' | 'subagentDepthOne' | 'subagentDepthOverride'
  | 'subagentMaxActive'
  | 'subagentCapacityHelpLabel' | 'subagentCapacityHelp'
  | 'subagentDepthInvalid'
  | 'subagentCapacityInvalid'
  | 'subagentModelSelectionTitle'
  | 'subagentModelSelectionToggle' | 'subagentModelSelectionChoose' | 'subagentModelSelectionAllowed'
  | 'subagentModelSelectionLoading' | 'subagentModelSelectionLoadFailed' | 'subagentModelSelectionRetry'
  | 'subagentModelSelectionPartial' | 'subagentModelSelectionUnavailable'
  | 'subagentModelSelectionUnavailableGroup' | 'subagentModelSelectionEmpty'
  | 'subagentModelSelectionRequired' | 'subagentModelSelectionConflict' | 'subagentModelSelectionOff'

/** English copy. */
export const en = {
  overridden: 'Overridden',
  reset: 'Reset to default',
  readOnly: 'This deployment stores settings read-only.',
  unavailable: 'This plugin is not loaded, so it cannot be configured right now.',
  save: 'Save',
  saving: 'Saving…',
  saveFailed: 'The deployment did not accept these values; they were left for you to correct.',
  subagentTitle: 'Subagent',
  subagentDescription: 'Set Subagent recursion depth, count, and models.',
  subagentLimitsTitle: 'Limits',
  subagentMaxDepth: 'Maximum recursion depth',
  subagentDepthHelpLabel: 'About maximum recursion depth',
  subagentDepthHelp: 'Limits how many levels of Subagents an Agent can create.',
  subagentDepthZero: 'Disable Subagents',
  subagentDepthOne: 'Only the main Agent can create Subagents',
  subagentDepthOverride: 'If a tool defines its own maximum recursion depth, that setting takes precedence.',
  subagentMaxActive: 'Subagent parallelism limit',
  subagentCapacityHelpLabel: 'About the Subagent parallelism limit',
  subagentCapacityHelp: 'Total live Subagents under the same main Agent, across all recursion levels. The main Agent is excluded. New start requests are rejected when the limit is reached.',
  subagentDepthInvalid: 'Enter a whole number of 0 or more.',
  subagentCapacityInvalid: 'Enter a whole number of 1 or more.',
  subagentModelSelectionTitle: 'Model selection',
  subagentModelSelectionToggle: 'Allow agents to choose models for Subagents',
  subagentModelSelectionChoose: 'When enabled, agents can choose a provider, model, and reasoning effort for each Subagent from the authorized models below. Applies only to new sessions.',
  subagentModelSelectionAllowed: 'Models agents may choose',
  subagentModelSelectionLoading: 'Loading models…',
  subagentModelSelectionLoadFailed: 'Models could not be loaded.',
  subagentModelSelectionRetry: 'Retry',
  subagentModelSelectionPartial: 'Some model providers could not be loaded; saved choices remain removable.',
  subagentModelSelectionUnavailable: 'Currently unavailable',
  subagentModelSelectionUnavailableGroup: 'Saved but currently unavailable',
  subagentModelSelectionEmpty: 'No model provider currently advertises a model.',
  subagentModelSelectionRequired: 'Select at least one model before saving.',
  subagentModelSelectionConflict: 'Settings changed elsewhere. Discard your draft and try again.',
  subagentModelSelectionOff: 'Subagents use configured defaults or inherit the parent agent\'s model. Saved model choices are retained.',
} satisfies Record<string, string>

/** Spanish dictionary, checked complete against the English key set. */
export const es = {
  overridden: 'Modificado',
  reset: 'Restablecer el valor predeterminado',
  readOnly: 'Esta instalación guarda los ajustes en modo de solo lectura.',
  unavailable: 'Este plugin no está cargado, así que ahora no se puede configurar.',
  save: 'Guardar',
  saving: 'Guardando…',
  saveFailed: 'La instalación no aceptó estos valores; se dejaron para que los corrijas.',
  subagentTitle: 'Subagentes',
  subagentDescription: 'Define la profundidad de recursión, el número y los modelos de los subagentes.',
  subagentLimitsTitle: 'Límites',
  subagentMaxDepth: 'Profundidad máxima de recursión',
  subagentDepthHelpLabel: 'Acerca de la profundidad máxima de recursión',
  subagentDepthHelp: 'Limita cuántos niveles de subagentes puede crear un agente.',
  subagentDepthZero: 'Desactivar subagentes',
  subagentDepthOne: 'Solo el agente principal puede crear subagentes',
  subagentDepthOverride: 'Si una herramienta define su propia profundidad máxima de recursión, esa configuración tiene prioridad.',
  subagentMaxActive: 'Límite de paralelismo de subagentes',
  subagentCapacityHelpLabel: 'Acerca del límite de paralelismo de subagentes',
  subagentCapacityHelp: 'Total de subagentes activos bajo un mismo agente principal, en todos los niveles de recursión. El agente principal no cuenta. Las solicitudes de inicio nuevas se rechazan cuando se alcanza el límite.',
  subagentDepthInvalid: 'Introduce un número entero igual o mayor que 0.',
  subagentCapacityInvalid: 'Introduce un número entero igual o mayor que 1.',
  subagentModelSelectionTitle: 'Selección de modelo',
  subagentModelSelectionToggle: 'Permitir que los agentes elijan modelos para los subagentes',
  subagentModelSelectionChoose: 'Al activarlo, los agentes pueden elegir proveedor, modelo y esfuerzo de razonamiento para cada subagente entre los modelos autorizados de abajo. Solo se aplica a las sesiones nuevas.',
  subagentModelSelectionAllowed: 'Modelos que los agentes pueden elegir',
  subagentModelSelectionLoading: 'Cargando modelos…',
  subagentModelSelectionLoadFailed: 'No se pudieron cargar los modelos.',
  subagentModelSelectionRetry: 'Reintentar',
  subagentModelSelectionPartial: 'Algunos proveedores de modelos no se pudieron cargar; las opciones guardadas se pueden quitar igualmente.',
  subagentModelSelectionUnavailable: 'No disponible por ahora',
  subagentModelSelectionUnavailableGroup: 'Guardados pero no disponibles por ahora',
  subagentModelSelectionEmpty: 'Ningún proveedor de modelos ofrece un modelo por ahora.',
  subagentModelSelectionRequired: 'Selecciona al menos un modelo antes de guardar.',
  subagentModelSelectionConflict: 'Los ajustes cambiaron en otro lugar. Descarta tu borrador e inténtalo de nuevo.',
  subagentModelSelectionOff: 'Los subagentes usan los valores predeterminados configurados o heredan el modelo del agente principal. Las opciones de modelo guardadas se conservan.',
} satisfies Record<keyof typeof en, string>

/**
 * The form frame's copy, read from this page's dictionary.
 * @param t - the page's locale reader.
 * @returns the labels the shared settings form renders.
 */
export function formLabels(t: (key: SubagentSettingsLocaleKey) => string): SettingsFormLabels {
  return { unavailable: t('unavailable'), readOnly: t('readOnly'), saveFailed: t('saveFailed'), save: t('save'), saving: t('saving') }
}
