/** `settings.theme` namespace dictionaries (the Appearance and font settings rows' copy). */

/** The settings.theme namespace key union. */
export type ThemeKey = keyof typeof en

/** English dictionary and key-set source of truth. */
export const en = {
  'appearance.title': 'Appearance',
  'appearance.light': 'Light',
  'appearance.dark': 'Dark',
  'appearance.system': 'System',
  'fontSize.text.title': 'Font size',
  'fontSize.text.description': 'Only affects conversation content',
  'fontSize.text.increase': 'Increase font size',
  'fontSize.text.decrease': 'Decrease font size',
  'fontSize.code.title': 'Code font size',
  'fontSize.code.description': 'Used for code blocks, inline code, and tool output',
  'fontSize.code.increase': 'Increase code font size',
  'fontSize.code.decrease': 'Decrease code font size',
  'fontSize.terminal.title': 'Terminal font size',
  'fontSize.terminal.description': 'Used for the sidebar terminal',
  'fontSize.terminal.increase': 'Increase terminal font size',
  'fontSize.terminal.decrease': 'Decrease terminal font size',
  'fontSize.unit': 'px',
  'fontFamily.text.title': 'Text font',
  'fontFamily.text.description': 'Used for the interface and conversation text. Separate fonts with commas; leave empty for the default',
  'fontFamily.code.title': 'Code font',
  'fontFamily.code.description': 'Used for code blocks, inline code, and tool output. Separate fonts with commas; leave empty for the default',
  'fontFamily.terminal.title': 'Terminal font',
  'fontFamily.terminal.description': 'Used for the sidebar terminal. Separate fonts with commas; leave empty for the default',
  'fontFamily.placeholder': 'Default',
  'fontSize.more': 'More font settings',
} satisfies Record<string, string>

/** Spanish dictionary, checked complete against the English key set. */
export const es = {
  'appearance.title': 'Apariencia',
  'appearance.light': 'Claro',
  'appearance.dark': 'Oscuro',
  'appearance.system': 'Sistema',
  'fontSize.text.title': 'Tamaño de letra',
  'fontSize.text.description': 'Solo afecta al contenido de la conversación',
  'fontSize.text.increase': 'Aumentar el tamaño de letra',
  'fontSize.text.decrease': 'Reducir el tamaño de letra',
  'fontSize.code.title': 'Tamaño de letra del código',
  'fontSize.code.description': 'Se usa en bloques de código, código en línea y salida de herramientas',
  'fontSize.code.increase': 'Aumentar el tamaño de letra del código',
  'fontSize.code.decrease': 'Reducir el tamaño de letra del código',
  'fontSize.terminal.title': 'Tamaño de letra del terminal',
  'fontSize.terminal.description': 'Se usa en el terminal de la barra lateral',
  'fontSize.terminal.increase': 'Aumentar el tamaño de letra del terminal',
  'fontSize.terminal.decrease': 'Reducir el tamaño de letra del terminal',
  'fontSize.unit': 'px',
  'fontFamily.text.title': 'Fuente del texto',
  'fontFamily.text.description': 'Se usa en la interfaz y en el texto de la conversación. Separa las fuentes con comas; déjalo vacío para usar la predeterminada',
  'fontFamily.code.title': 'Fuente del código',
  'fontFamily.code.description': 'Se usa en bloques de código, código en línea y salida de herramientas. Separa las fuentes con comas; déjalo vacío para usar la predeterminada',
  'fontFamily.terminal.title': 'Fuente del terminal',
  'fontFamily.terminal.description': 'Se usa en el terminal de la barra lateral. Separa las fuentes con comas; déjalo vacío para usar la predeterminada',
  'fontFamily.placeholder': 'Predeterminada',
  'fontSize.more': 'Más ajustes de fuente',
} satisfies Record<keyof typeof en, string>
