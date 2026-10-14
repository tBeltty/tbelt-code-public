/** `sidebar` namespace dictionaries for shell controls and global panels. */

/** The sidebar namespace key union. */
export type SidebarKey = keyof typeof en

/** English dictionary and key-set source of truth. */
export const en = {
  'session.new': 'New Session',
  'session.new.label': 'New session',
  'toggle.open': 'Open sidebar',
  'toggle.collapse': 'Collapse sidebar',
  'panels.label': 'Global panels',
  'brand.preview': 'Preview',
} satisfies Record<string, string>

/** Spanish dictionary, checked complete against the English key set. */
export const es = {
  'session.new': 'Nueva sesión',
  'session.new.label': 'Nueva sesión',
  'toggle.open': 'Abrir barra lateral',
  'toggle.collapse': 'Contraer barra lateral',
  'panels.label': 'Paneles globales',
  'brand.preview': 'Vista previa',
} satisfies Record<keyof typeof en, string>

/** Greek dictionary, checked complete against the English key set. */
export const el = {
  'session.new': 'Νέα συνεδρία',
  'session.new.label': 'Νέα συνεδρία',
  'toggle.open': 'Άνοιγμα πλευρικής γραμμής',
  'toggle.collapse': 'Σύμπτυξη πλευρικής γραμμής',
  'panels.label': 'Καθολικοί πίνακες',
  'brand.preview': 'Προεπισκόπηση',
} satisfies Record<keyof typeof en, string>

/** French dictionary, checked complete against the English key set. */
export const fr = {
  'session.new': 'Nouvelle session',
  'session.new.label': 'Nouvelle session',
  'toggle.open': 'Ouvrir la barre latérale',
  'toggle.collapse': 'Réduire la barre latérale',
  'panels.label': 'Panneaux globaux',
  'brand.preview': 'Aperçu',
} satisfies Record<keyof typeof en, string>
