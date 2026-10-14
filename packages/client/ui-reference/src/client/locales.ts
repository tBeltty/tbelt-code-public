/** `reference` namespace dictionaries for the unified `@` source. */

import type {} from '@deepseek-ai/dsh-client-ui-slots'

/** Dictionary namespace owned by this plugin. */
export const NS = 'reference'

/** The reference namespace key union. */
export type ReferenceKey = keyof typeof en

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The unified `@` reference menu's copy. */
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
  'time.now': 'now',
  'time.minutes': '{n}min',
  'time.hours': '{n}h',
  'time.days': '{n}d',
  'time.months': '{n}mo',
  'time.years': '{n}y',
} satisfies Record<string, string>

/** Spanish dictionary, checked complete against the English key set. */
export const es = {
  'section.files': 'Archivos y carpetas',
  'section.subagents': 'Subagentes',
  'section.sessions': 'Sesiones',
  'candidate.noCwd': '(sin directorio)',
  'crumb.root': 'Espacio de trabajo',
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
  'time.now': 'τώρα',
  'time.minutes': '{n}λ',
  'time.hours': '{n}ω',
  'time.days': '{n}ημ.',
  'time.months': '{n}μ.',
  'time.years': '{n}έ.',
} satisfies Record<keyof typeof en, string>

/** French dictionary, checked complete against the English key set. */
export const fr = {
  'section.files': 'Fichiers et dossiers',
  'section.subagents': 'Sous-agents',
  'section.sessions': 'Sessions',
  'candidate.noCwd': '(pas de cwd)',
  'crumb.root': 'Espace de travail',
  'time.now': 'à l’instant',
  'time.minutes': '{n} min',
  'time.hours': '{n} h',
  'time.days': '{n} j',
  'time.months': '{n} mois',
  'time.years': '{n} an',
} satisfies Record<keyof typeof en, string>
