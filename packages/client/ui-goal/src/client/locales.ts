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

/** Spanish dictionary, checked complete against the English key set. */
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
