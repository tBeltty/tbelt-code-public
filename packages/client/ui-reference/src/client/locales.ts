/** `reference` dictionaries for the unified `@` source and inline file navigation. */

import type {} from '@deepseek-ai/dsh-client-ui-slots'

/** Dictionary namespace owned by this plugin. */
export const NS = 'reference'

/** The reference namespace key union. */
export type ReferenceKey = keyof typeof en

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Reference menu and per-file navigation feedback. */
    reference: ReferenceKey
  }
}

/** English dictionary and key-set source of truth. */
export const en = {
  'section.files': 'Files & folders',
  'section.subagents': 'Subagents',
  'section.sessions': 'Sessions',
  'candidate.noCwd': '(no cwd)',
  'crumb.root': 'Workspace',
  'fileOpen.title': 'Couldn’t open file',
  'fileOpen.failed': 'Couldn’t open “{path}”. Try again or close this message.',
  'fileOpen.close': 'Close',
  'fileOpen.retry': 'Retry',
  'time.now': 'now',
  'time.minutes': '{n}min',
  'time.hours': '{n}h',
  'time.days': '{n}d',
  'time.months': '{n}mo',
  'time.years': '{n}y',
} satisfies Record<string, string>

/** Spanish dictionary, checked against the English keys. */
export const es = {
  'section.files': 'Archivos y carpetas',
  'section.subagents': 'Subagentes',
  'section.sessions': 'Sesiones',
  'candidate.noCwd': '(sin directorio)',
  'crumb.root': 'Espacio de trabajo',
  'fileOpen.title': 'No se pudo abrir el archivo',
  'fileOpen.failed': 'No se pudo abrir «{path}». Inténtalo de nuevo o cierra este mensaje.',
  'fileOpen.close': 'Cerrar',
  'fileOpen.retry': 'Reintentar',
  'time.now': 'ahora',
  'time.minutes': '{n} min',
  'time.hours': '{n} h',
  'time.days': '{n} d',
  'time.months': '{n} m',
  'time.years': '{n} a',
} satisfies Record<keyof typeof en, string>

/** Greek dictionary, checked complete against the English key set. */
export const el = {
  'section.files': 'Αρχεία και φάκελοι',
  'section.subagents': 'Υποπράκτορες',
  'section.sessions': 'Συνεδρίες',
  'candidate.noCwd': '(χωρίς cwd)',
  'crumb.root': 'Χώρος εργασίας',
  'fileOpen.title': 'Δεν ήταν δυνατό το άνοιγμα του αρχείου',
  'fileOpen.failed': 'Δεν ήταν δυνατό το άνοιγμα του «{path}». Δοκιμάστε ξανά ή κλείστε αυτό το μήνυμα.',
  'fileOpen.close': 'Κλείσιμο',
  'fileOpen.retry': 'Επανάληψη',
  'time.now': 'τώρα',
  'time.minutes': '{n}λ',
  'time.hours': '{n}ω',
  'time.days': '{n}ημ.',
  'time.months': '{n}μ.',
  'time.years': '{n}έ.',
} satisfies Record<keyof typeof en, string>

/** French dictionary, checked against the English keys. */
export const fr = {
  'section.files': 'Fichiers et dossiers',
  'section.subagents': 'Sous-agents',
  'section.sessions': 'Sessions',
  'candidate.noCwd': '(pas de cwd)',
  'crumb.root': 'Espace de travail',
  'fileOpen.title': 'Impossible d’ouvrir le fichier',
  'fileOpen.failed': 'Impossible d’ouvrir « {path} ». Réessayez ou fermez ce message.',
  'fileOpen.close': 'Fermer',
  'fileOpen.retry': 'Réessayer',
  'time.now': 'à l’instant',
  'time.minutes': '{n} min',
  'time.hours': '{n} h',
  'time.days': '{n} j',
  'time.months': '{n} mois',
  'time.years': '{n} a',
} satisfies Record<keyof typeof en, string>
