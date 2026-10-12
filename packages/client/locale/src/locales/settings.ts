/** `settings.locale` namespace dictionaries (the Language row's copy). */

/** English dictionary (the key-set source of truth). */
export const en = {
  'language.title': 'Language',
  'language.auto': 'Automatic',
} satisfies Record<string, string>

/** The settings.locale namespace key union. */
export type SettingsLocaleKey = keyof typeof en

/** Spanish dictionary, checked complete against the English key set. */
export const es = {
  'language.title': 'Idioma',
  'language.auto': 'Automático',
} satisfies Record<SettingsLocaleKey, string>
