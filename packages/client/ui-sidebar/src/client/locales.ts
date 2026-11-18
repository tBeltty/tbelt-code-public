/** `sidebar` namespace dictionaries for shell controls and global panels. */

/** The sidebar namespace key union. */
export type SidebarKey = keyof typeof en

/** English dictionary and key-set source of truth. */
export const en = {
  'panels.unpinTooltip': 'Unpin from left sidebar',
  'panels.unpin': 'Unpin {name} from sidebar',
  'session.new': 'New Session',
  'session.new.label': 'New session',
  'toggle.open': 'Open sidebar',
  'toggle.collapse': 'Collapse sidebar',
  'panels.label': 'Global panels',
  'navigation.label': 'Navigation',
  'brand.preview': 'Preview',
  'panels.more': 'More',
  'version.copied': 'Version copied',
} satisfies Record<string, string>

/** Spanish dictionary, checked against the English keys. */
export const es = {
  'panels.unpinTooltip': 'Desanclar de la barra lateral izquierda',
  'panels.unpin': 'Desfijar {name} de la barra lateral',
  'session.new': 'Nueva sesión',
  'session.new.label': 'Nueva sesión',
  'toggle.open': 'Abrir barra lateral',
  'toggle.collapse': 'Contraer barra lateral',
  'panels.label': 'Paneles globales',
  'navigation.label': 'Navegación',
  'brand.preview': 'Vista previa',
  'panels.more': 'Más',
  'version.copied': 'Versión copiada',
} satisfies Record<keyof typeof en, string>

/** Greek dictionary, checked complete against the English key set. */
export const el = {
  'panels.unpinTooltip': 'Ξεκαρφίτσωμα από την αριστερή πλευρική γραμμή',
  'panels.unpin': 'Ξεκαρφίτσωμα του {name} από την πλευρική γραμμή',
  'session.new': 'Νέα συνεδρία',
  'session.new.label': 'Νέα συνεδρία',
  'toggle.open': 'Άνοιγμα πλευρικής γραμμής',
  'toggle.collapse': 'Σύμπτυξη πλευρικής γραμμής',
  'panels.label': 'Καθολικοί πίνακες',
  'navigation.label': 'Πλοήγηση',
  'brand.preview': 'Προεπισκόπηση',
  'panels.more': 'Περισσότερα',
  'version.copied': 'Η έκδοση αντιγράφηκε',
} satisfies Record<keyof typeof en, string>

/** French dictionary, checked against the English keys. */
export const fr = {
  'panels.unpinTooltip': "Retirer l'épingle de la barre latérale gauche",
  'session.new': 'Nouvelle session',
  'session.new.label': 'Nouvelle session',
  'panels.unpin': 'Désépingler {name} de la barre latérale',
  'toggle.open': 'Ouvrir la barre latérale',
  'toggle.collapse': 'Réduire la barre latérale',
  'panels.label': 'Panneaux globaux',
  'navigation.label': 'Navigation',
  'brand.preview': 'Aperçu',
  'panels.more': 'Plus',
  'version.copied': 'Version copiée',
} satisfies Record<keyof typeof en, string>
