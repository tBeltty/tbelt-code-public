/** Layout command labels. */

/** English labels for the same layout commands. */
export const en = { toggle: 'Toggle left sidebar' } satisfies Record<string, string>

/** Spanish dictionary, checked complete against the English key set. */
export const es = {
  toggle: 'Mostrar u ocultar la barra lateral izquierda',
} satisfies Record<keyof typeof en, string>

/** Greek dictionary, checked complete against the English key set. */
export const el = {
  toggle: 'Εναλλαγή αριστερής πλευρικής γραμμής',
} satisfies Record<keyof typeof en, string>

/** French dictionary, checked complete against the English key set. */
export const fr = {
  toggle: 'Afficher ou masquer la barre latérale gauche',
} satisfies Record<keyof typeof en, string>
