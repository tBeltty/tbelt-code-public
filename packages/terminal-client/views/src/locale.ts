/**
 * Language choice of the terminal client: the saved preference, else the
 * language of the shell environment.
 * @module @deepseek-ai/dsh-terminal-views/locale
 */
import type { CopyLocale } from './copy.ts'

/** Environment variables that name the user's language, strongest first. */
const LANGUAGE_VARIABLES = ['LC_ALL', 'LC_MESSAGES', 'LANGUAGE', 'LANG'] as const

/** Languages the terminal client is written in. */
const SUPPORTED: readonly CopyLocale[] = ['en', 'es']

/**
 * Read a language from a POSIX locale such as `es_ES.UTF-8` or a `LANGUAGE` list such as `es:en`.
 * @param value - raw variable value.
 * @returns the first entry that names a supported language; `undefined` for `C`, `POSIX` and other languages.
 */
function languageOf(value: string): CopyLocale | undefined {
  for (const entry of value.split(':')) {
    const language = entry.split(/[._@-]/u, 1)[0]?.toLowerCase()
    if (language === 'c' || language === 'posix' || language === undefined || language === '') continue
    return SUPPORTED.find(locale => locale === language)
  }
  return undefined
}

/**
 * Pick the language of the terminal client.
 * @param preference - saved `locale.preference` setting; `undefined` or any value other than a supported language means automatic.
 * @param env - process environment to read `LC_ALL`, `LC_MESSAGES`, `LANGUAGE` and `LANG` from.
 * @returns the saved language when set; otherwise the language of the first variable that is set;
 *   `en` when that variable names another language or none is set.
 */
export function resolveCopyLocale(
  preference: string | undefined,
  env: Readonly<Record<string, string | undefined>>,
): CopyLocale {
  const saved = SUPPORTED.find(locale => locale === preference)
  if (saved !== undefined) return saved
  for (const name of LANGUAGE_VARIABLES) {
    const value = env[name]
    if (value !== undefined && value !== '') return languageOf(value) ?? 'en'
  }
  return 'en'
}
