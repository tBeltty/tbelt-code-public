/** English labels for the NodeJS Inspector bottom panel and command; key-set source of truth. */
export const en = {
  title: 'NodeJS inspector',
  toggle: 'Toggle NodeJS inspector',
  close: 'Collapse',
  resize: 'Resize NodeJS inspector panel',
  frameTitle: 'NodeJS inspector',
} satisfies Record<string, string>

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Shared Inspector frontend copy. */
    inspectorPanel: keyof typeof en
  }
}

/** Spanish dictionary, checked against the English keys. */
export const es = {
  title: 'Inspector NodeJS',
  toggle: 'Alternar inspector NodeJS',
  close: 'Contraer',
  resize: 'Cambiar el tamaño del panel inspector NodeJS',
  frameTitle: 'Inspector NodeJS',
} satisfies Record<keyof typeof en, string>

/** Greek labels, checked complete against the English key set. */
export const el = {
  title: 'Επιθεωρητής NodeJS',
  toggle: 'Εναλλαγή επιθεωρητή NodeJS',
  close: 'Σύμπτυξη',
  resize: 'Αλλαγή μεγέθους πίνακα επιθεωρητή NodeJS',
  frameTitle: 'Επιθεωρητής NodeJS',
}

/** French dictionary, checked against the English keys. */
export const fr = {
  title: 'Inspecteur NodeJS',
  toggle: "Basculer l'inspecteur NodeJS",
  close: 'Réduire',
  resize: "Redimensionner le panneau d'inspection NodeJS",
  frameTitle: 'Inspecteur NodeJS',
} satisfies Record<keyof typeof en, string>
