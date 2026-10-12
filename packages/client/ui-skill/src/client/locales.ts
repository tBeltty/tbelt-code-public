/** `skill` namespace dictionaries for the dedicated tool row. */

/** Dictionary namespace owned by this plugin. */
export const NS = 'skill'

/** The skill namespace key union. */
export type SkillKey = keyof typeof en

/** English dictionary and key-set source of truth. */
export const en = {
  'row.title': 'Skill',
  'row.running': 'Loading skill',
  'row.preparing': 'Preparing to load a skill',
  'row.failed': 'Skill load failed',
  'row.stopped': 'Skill load stopped',
  'row.instructions': 'Instructions',
  'row.inspect': 'Inspect',
  'menu.userOnly': 'user-only',
} satisfies Record<string, string>

/** Spanish dictionary, checked complete against the English key set. */
export const es = {
  'row.title': 'Skill',
  'row.running': 'Cargando skill',
  'row.preparing': 'Preparando la carga de un skill',
  'row.failed': 'Error al cargar el skill',
  'row.stopped': 'Carga del skill detenida',
  'row.instructions': 'Instrucciones',
  'row.inspect': 'Inspeccionar',
  'menu.userOnly': 'solo usuario',
} satisfies Record<keyof typeof en, string>
