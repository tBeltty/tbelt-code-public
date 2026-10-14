/**
 * Rows of the language list of `/language`.
 * @module @deepseek-ai/dsh-terminal-views/language
 */
import { t } from './copy.ts'
import type { CopyKey, CopyLocale } from './copy.ts'
import type { PickerItem } from './picker.ts'

/** Value of the row that removes the saved language. */
export const LANGUAGE_AUTOMATIC = '@auto'

/** Languages offered, each with the key of its native name. */
const LANGUAGES: readonly { readonly value: CopyLocale; readonly name: CopyKey }[] = [
  { value: 'en', name: 'language.english' },
  { value: 'es', name: 'language.spanish' },
  { value: 'el', name: 'language.greek' },
  { value: 'fr', name: 'language.french' },
]

/**
 * Rows of the language list.
 * @param saved - the saved language id; `undefined` when the terminal follows its environment.
 * @returns the Automatic row followed by one row per language, with the saved choice marked.
 */
export function languageItems(saved: string | undefined): PickerItem[] {
  return [
    { value: LANGUAGE_AUTOMATIC, label: t('language.automatic'), detail: t('language.automaticDetail'), current: saved === undefined },
    ...LANGUAGES.map(language => ({ value: language.value, label: t(language.name), current: saved === language.value })),
  ]
}

/**
 * Name a language in its own words.
 * @param locale - a language id from the list.
 * @returns its native name.
 */
export function languageName(locale: CopyLocale): string {
  const language = LANGUAGES.find(candidate => candidate.value === locale)
  return t(language?.name ?? 'language.english')
}
