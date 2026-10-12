/**
 * `slash.menu` namespace dictionaries: group titles keyed by source name
 * (the lookup chain returns the key itself, so an unknown source shows its
 * raw name), the pending row, and the listbox and header aria labels.
 */

/** The slash.menu namespace key union. */
export type MenuKey = keyof typeof en

/** English dictionary and key-set source of truth. */
export const en = {
  'command': 'Commands',
  'skill': 'Skills',
  'subagent': 'Subagents',
  'loading': 'Loading…',
  'drill.aria': 'Browse folder',
  'drill.hint': 'Browse folder',
  'drill.key': 'Tab',
  'crumbs.aria': 'Folder navigation',
  'suggestions.aria': 'Trigger suggestions',
} satisfies Record<string, string>

/** Spanish dictionary, checked complete against the English key set. */
export const es = {
  'command': 'Comandos',
  'skill': 'Skills',
  'subagent': 'Subagentes',
  'loading': 'Cargando…',
  'drill.aria': 'Explorar carpeta',
  'drill.hint': 'Explorar carpeta',
  'drill.key': 'Tab',
  'crumbs.aria': 'Navegación de carpetas',
  'suggestions.aria': 'Sugerencias del activador',
} satisfies Record<keyof typeof en, string>
