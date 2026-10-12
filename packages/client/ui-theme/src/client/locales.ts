/** `settings.theme` namespace dictionaries (the Appearance and font-size rows' copy). */

/** The settings.theme namespace key union. */
export type ThemeKey = keyof typeof en

/** English dictionary and key-set source of truth. */
export const en = {
  'appearance.title': 'Appearance',
  'appearance.light': 'Light',
  'appearance.dark': 'Dark',
  'appearance.system': 'System',
  'fontSize.title': 'Font size',
  'fontSize.description': 'Only affects conversation content',
  'fontSize.unit': 'px',
  'fontSize.increase': 'Increase font size',
  'fontSize.decrease': 'Decrease font size',
} satisfies Record<string, string>

/** Spanish dictionary, checked complete against the English key set. */
export const es = {
  'appearance.title': 'Apariencia',
  'appearance.light': 'Claro',
  'appearance.dark': 'Oscuro',
  'appearance.system': 'Sistema',
  'fontSize.title': 'Tamaño de letra',
  'fontSize.description': 'Solo afecta al contenido de la conversación',
  'fontSize.unit': 'px',
  'fontSize.increase': 'Aumentar el tamaño de letra',
  'fontSize.decrease': 'Reducir el tamaño de letra',
} satisfies Record<keyof typeof en, string>
