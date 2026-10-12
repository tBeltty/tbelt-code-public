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
