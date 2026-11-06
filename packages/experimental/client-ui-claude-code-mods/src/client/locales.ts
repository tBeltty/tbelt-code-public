/** Web dictionaries for the chrome around a mod's band; the mods' own content is theirs. */

/** Locale namespace owned by the mods band. */
export const NS = 'claude-code-mods'

/** English dictionary and key-set source of truth. */
export const en = {
  band: 'Claude Code mods',
  pressing: 'Working…',
  'press.failed': 'The button failed: {message}',
  'press.stale': 'That button belonged to an earlier drawing; the band has refreshed',
} satisfies Record<string, string>

/** Mods band locale key union. */
export type ModsBandKey = keyof typeof en

/** Spanish dictionary, checked against the English keys. */
export const es = {
  band: 'Mods de Claude Code',
  pressing: 'Trabajando…',
  'press.failed': 'El botón falló: {message}',
  'press.stale': 'Ese botón era de un dibujo anterior; la banda se ha actualizado',
} satisfies Record<ModsBandKey, string>

/** Greek dictionary, checked against the English keys. */
export const el = {
  band: 'Mods του Claude Code',
  pressing: 'Σε εξέλιξη…',
  'press.failed': 'Το κουμπί απέτυχε: {message}',
  'press.stale': 'Αυτό το κουμπί ανήκε σε προηγούμενο σχέδιο· η λωρίδα ανανεώθηκε',
} satisfies Record<ModsBandKey, string>

/** French dictionary, checked against the English keys. */
export const fr = {
  band: 'Mods Claude Code',
  pressing: 'En cours…',
  'press.failed': 'Le bouton a échoué : {message}',
  'press.stale': 'Ce bouton appartenait à un dessin antérieur ; le bandeau a été actualisé',
} satisfies Record<ModsBandKey, string>
