/** `sessionPanel` namespace dictionaries. */

/** Dictionary namespace owned by this plugin. */
export const NS = 'sessionPanel'

/** English dictionary and key-set source of truth. */
export const en = {
  'panel.name': 'Session panel',
  'toggle.show': 'Show session panel',
  'toggle.hide': 'Hide session panel',
  'toggle.unavailable': 'Switch to the Chat view to show the session panel',
  'section.environment': 'Environment',
  'project.label': 'Working folder',
  'project.actions': 'Working folder actions',
} satisfies Record<string, string>

/** Every key of the `sessionPanel` namespace. */
export type SessionPanelKey = keyof typeof en

/** Spanish dictionary, checked against the English keys. */
export const es = {
  'panel.name': 'Panel de la sesión',
  'toggle.show': 'Mostrar el panel de la sesión',
  'toggle.hide': 'Ocultar el panel de la sesión',
  'toggle.unavailable': 'Cambia a la vista Chat para mostrar el panel de la sesión',
  'section.environment': 'Entorno',
  'project.label': 'Carpeta de trabajo',
  'project.actions': 'Acciones de la carpeta de trabajo',
} satisfies Record<SessionPanelKey, string>

/** Greek dictionary, checked against the English keys. */
export const el = {
  'panel.name': 'Πλαίσιο συνεδρίας',
  'toggle.show': 'Εμφάνιση του πλαισίου συνεδρίας',
  'toggle.hide': 'Απόκρυψη του πλαισίου συνεδρίας',
  'toggle.unavailable': 'Μεταβείτε στην προβολή Συνομιλίας για να εμφανίσετε το πλαίσιο συνεδρίας',
  'section.environment': 'Περιβάλλον',
  'project.label': 'Φάκελος εργασίας',
  'project.actions': 'Ενέργειες φακέλου εργασίας',
} satisfies Record<SessionPanelKey, string>

/** French dictionary, checked against the English keys. */
export const fr = {
  'panel.name': 'Panneau de session',
  'toggle.show': 'Afficher le panneau de session',
  'toggle.hide': 'Masquer le panneau de session',
  'toggle.unavailable': 'Passez à la vue Discussion pour afficher le panneau de session',
  'section.environment': 'Environnement',
  'project.label': 'Dossier de travail',
  'project.actions': 'Actions sur le dossier de travail',
} satisfies Record<SessionPanelKey, string>
