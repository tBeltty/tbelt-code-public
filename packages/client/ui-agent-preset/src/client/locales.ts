/** Locale bundles for the agent-preset hero chip, header label, and management section. */

import { guideEn, guideEs, type PresetGuideKey } from './guide-locales.ts'

/** Locale keys these surfaces render. */
export type AgentPresetSettingsKey =
  | PresetGuideKey
  | 'builtInGroup'
  | 'customGroup'
  | 'seatHint'
  | 'headerHint'
  | 'nav'
  | 'sectionIntro'
  | 'setDefault'
  | 'view'
  | 'presetStandardName'
  | 'presetStandardDescription'
  | 'presetPtcName'
  | 'presetPtcDescription'
  | 'presetMinimalName'
  | 'presetMinimalDescription'
  | 'presetFastName'
  | 'presetFastDescription'
  | 'presetCordisName'
  | 'presetCordisDescription'
  | 'inUse'
  | 'noDescription'
  | 'brokenBadge'
  | 'switchRefused'
  | 'standardUnavailable'
  | 'close'
  | 'creatorDraft'
  | 'createPlugin'
  | 'createPluginDescription'
  | 'createPluginChecking'
  | 'createPluginUnavailable'
  | 'createPluginMissing'

/** English copy. */
export const en = {
  ...guideEn,
  builtInGroup: 'Built-in', customGroup: 'Custom',
  sectionIntro: 'Choose the agent’s tools and how it works. Use Standard mode for everyday tasks, or Creator mode to add capabilities to tBelt Code.',

  seatHint: 'Choose the agent preset for your new task',
  headerHint: 'The agent preset chosen when this task started',
  nav: 'Agent presets',

  setDefault: 'Set as new task default',
  view: 'View configuration',

  presetStandardName: 'Standard mode',
  presetStandardDescription:
    'Work with code, files, and information. Suitable for most tasks, with search, editing, terminal commands, and other tools available as needed.',
  presetPtcName: 'PTC mode',
  presetPtcDescription:
    'Includes all Standard mode capabilities. Better suited to tasks that call tools in batches and then filter, organize, deduplicate, count, or summarize the results.',
  presetMinimalName: 'Minimal mode',
  presetMinimalDescription:
    'The agent works using only a terminal tool. Useful for testing and comparing its basic performance.',
  presetFastName: 'Fast mode',
  presetFastDescription:
    'A short prompt and a few core tools keep each step small and quick. The agent turns on search, web, subagents and other tools when a task needs them.',
  presetCordisName: 'Creator mode',
  presetCordisDescription:
    'Customize tBelt Code through conversation. Let the agent write plugins that add features or UI, or combine tools and prompts to create your own mode.',

  inUse: 'Default',

  noDescription: 'No description.',
  brokenBadge: 'Failed to load',

  switchRefused: 'Could not switch to {name}: {reason}',
  standardUnavailable: 'Standard mode is unavailable. Restore it or choose another available mode.',

  close: 'Close',

  creatorDraft: 'Let the agent help me create a preset',
  createPlugin: 'Let the agent create a plugin',
  createPluginDescription: 'Enter Creator mode and make your own tBelt Code plugin',
  createPluginChecking: 'Checking whether Creator mode is available',
  createPluginUnavailable: 'Temporarily unavailable. Reopen this menu to retry',
  createPluginMissing: 'Creator mode is not included in this configuration',

} satisfies Record<string, string>

/** Spanish dictionary, checked complete against the English key set. */
export const es = {
  ...guideEs,
  builtInGroup: 'Integrados',
  customGroup: 'Propios',
  sectionIntro: 'Elige las herramientas del agente y cómo trabaja. Usa el modo Estándar para el día a día, o el modo Creador para añadir capacidades a tBelt Code.',
  seatHint: 'Elige el preajuste de agente para tu tarea nueva',
  headerHint: 'El preajuste de agente elegido al empezar esta tarea',
  nav: 'Preajustes de agente',
  setDefault: 'Usar en tareas nuevas',
  view: 'Ver configuración',
  presetStandardName: 'Modo estándar',
  presetStandardDescription: 'Trabaja con código, archivos e información. Sirve para la mayoría de las tareas, con búsqueda, edición, comandos de terminal y otras herramientas disponibles cuando hacen falta.',
  presetPtcName: 'Modo PTC',
  presetPtcDescription: 'Incluye todas las capacidades del modo estándar. Se adapta mejor a las tareas que llaman a herramientas por lotes y luego filtran, organizan, deduplican, cuentan o resumen los resultados.',
  presetMinimalName: 'Modo mínimo',
  presetMinimalDescription: 'El agente trabaja solo con una herramienta de terminal. Útil para probar y comparar su rendimiento básico.',
  presetFastName: 'Modo rápido',
  presetFastDescription:
    'Un prompt corto y pocas herramientas básicas mantienen cada paso pequeño y veloz. El agente activa la búsqueda, la web, los subagentes y otras herramientas cuando una tarea las necesita.',
  presetCordisName: 'Modo creador',
  presetCordisDescription: 'Personaliza tBelt Code conversando. Deja que el agente escriba plugins que añadan funciones o interfaz, o combine herramientas y prompts para crear tu propio modo.',
  inUse: 'Predeterminado',
  noDescription: 'Sin descripción.',
  brokenBadge: 'No se pudo cargar',
  switchRefused: 'No se pudo cambiar a {name}: {reason}',
  close: 'Cerrar',
  creatorDraft: 'Quiero que el agente me ayude a crear un preajuste',
  standardUnavailable: 'El modo estándar no está disponible. Restáuralo o elige otro modo disponible.',
  createPlugin: 'Que el agente cree un plugin',
  createPluginDescription: 'Entra en el modo creador y crea tu propio plugin de tBelt Code',
  createPluginChecking: 'Comprobando si el modo creador está disponible',
  createPluginUnavailable: 'No disponible por ahora. Vuelve a abrir este menú para reintentar',
  createPluginMissing: 'El modo creador no está incluido en esta configuración',
} satisfies Record<keyof typeof en, string>

// The resolution itself is the shared fold in `dsh-agent-preset-registry/display`,
// re-exported here so every surface in this plugin reads one path; the
// Settings plugin list inlines the same fold over this plugin's dictionaries.
export { isBuiltInPreset, presetDisplayText } from '@deepseek-ai/dsh-agent-preset-registry/display'
export type { PresetDisplaySource, PresetDisplayText } from '@deepseek-ai/dsh-agent-preset-registry/display'
