/** `goal` namespace dictionaries. */

/** The goal namespace key union. */
export type GoalKey = keyof typeof en

/** English dictionary and key-set source of truth. */
export const en = {
  'phase.active': 'Ongoing Goal',
  'phase.active.disarmed': 'Inactive Goal',
  'phase.paused': 'Paused Goal',
  'phase.blocked': 'Blocked Goal',
  'objective.aria': 'Goal objective',
  'commandInput.aria': 'Command input',
  'action.save': 'Save goal',
  'action.cancel': 'Cancel edit',
  'action.pause': 'Pause goal',
  'action.resume': 'Resume goal',
  'action.edit': 'Edit goal',
  'action.clear': 'Clear goal',
} satisfies Record<string, string>

/** Spanish dictionary, checked against the English keys. */
export const es = {
  'phase.active': 'Objetivo en curso',
  'phase.active.disarmed': 'Objetivo inactivo',
  'phase.paused': 'Objetivo en pausa',
  'phase.blocked': 'Objetivo bloqueado',
  'objective.aria': 'Meta del objetivo',
  'commandInput.aria': 'Entrada de comandos',
  'action.save': 'Guardar objetivo',
  'action.cancel': 'Cancelar edición',
  'action.pause': 'Pausar objetivo',
  'action.resume': 'Reanudar objetivo',
  'action.edit': 'Editar objetivo',
  'action.clear': 'Borrar objetivo',
} satisfies Record<keyof typeof en, string>

/** Greek dictionary, checked complete against the English key set. */
export const el = {
  'phase.active': 'Στόχος σε εξέλιξη',
  'phase.active.disarmed': 'Ανενεργός στόχος',
  'phase.paused': 'Στόχος σε παύση',
  'phase.blocked': 'Αποκλεισμένος στόχος',
  'objective.aria': 'Σκοπός του στόχου',
  'commandInput.aria': 'Είσοδος εντολών',
  'action.save': 'Αποθήκευση στόχου',
  'action.cancel': 'Ακύρωση επεξεργασίας',
  'action.pause': 'Παύση στόχου',
  'action.resume': 'Συνέχιση στόχου',
  'action.edit': 'Επεξεργασία στόχου',
  'action.clear': 'Εκκαθάριση στόχου',
} satisfies Record<keyof typeof en, string>

/** French dictionary, checked against the English keys. */
export const fr = {
  'phase.active': 'Objectif en cours',
  'phase.active.disarmed': 'Objectif inactif',
  'phase.paused': 'Objectif en pause',
  'phase.blocked': 'Objectif bloqué',
  'objective.aria': 'But de l’objectif',
  'commandInput.aria': 'Saisie de commandes',
  'action.save': 'Enregistrer l’objectif',
  'action.cancel': 'Annuler la modification',
  'action.pause': 'Mettre l’objectif en pause',
  'action.resume': 'Reprendre l’objectif',
  'action.edit': 'Modifier l’objectif',
  'action.clear': 'Effacer l’objectif',
} satisfies Record<keyof typeof en, string>
