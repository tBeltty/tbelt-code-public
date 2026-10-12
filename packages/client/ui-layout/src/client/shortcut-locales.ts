/** Layout command labels. */

/** English labels for the same layout commands. */
export const en = { toggle: 'Toggle left sidebar' } satisfies Record<string, string>

/** Spanish dictionary, checked complete against the English key set. */
export const es = {
  toggle: 'Mostrar u ocultar la barra lateral izquierda',
} satisfies Record<keyof typeof en, string>
