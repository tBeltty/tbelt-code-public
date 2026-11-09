/** Layout command labels. */

/** English labels for the same layout commands. */
export const en = { toggle: 'Toggle left sidebar' } satisfies Record<string, string>

/** Spanish dictionary, checked against the English keys. */
export const es = { toggle: 'Alternar barra lateral izquierda' } satisfies Record<keyof typeof en, string>

/** Greek dictionary, checked complete against the English key set. */
export const el = {
  toggle: 'Εναλλαγή αριστερής πλευρικής γραμμής',
} satisfies Record<keyof typeof en, string>

/** French dictionary, checked against the English keys. */
export const fr = { toggle: 'Basculer la barre latérale gauche' } satisfies Record<keyof typeof en, string>
