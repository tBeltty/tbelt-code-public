/**
 * The `/language` screen: choose a language or follow the language of the
 * terminal. The choice is the `locale.preference` setting the GUI language
 * selector writes, so both surfaces follow one saved language.
 * @module @deepseek-ai/dsh-terminal-client/config/language
 */
import { LANGUAGE_AUTOMATIC, languageItems, languageName, resolveCopyLocale, setCopyLocale, t } from '@deepseek-ai/dsh-terminal-views'
import type { CopyLocale } from '@deepseek-ai/dsh-terminal-views'
import type { RemotePort, SettingsNamespacePort } from '../ports.ts'
import { remoteValue } from './ui.ts'
import type { FlowUi } from './ui.ts'
import { writeSettings } from './write.ts'

/** The settings namespace that stores the language. */
export const LOCALE_NS = 'locale'

/** The field of {@link LOCALE_NS} that holds the saved language. */
const PREFERENCE_FIELD = 'preference'

/**
 * Read the saved language out of the locale namespace.
 * @param namespace - the namespace as the Host describes it; `undefined` when the Host has none.
 * @returns the saved language id, or `undefined` when none is saved.
 */
export function savedLanguage(namespace: SettingsNamespacePort | undefined): string | undefined {
  const value = namespace?.value
  if (typeof value !== 'object' || value === null) return undefined
  const preference = (value as Readonly<Record<string, unknown>>)[PREFERENCE_FIELD]
  return typeof preference === 'string' ? preference : undefined
}

/**
 * Read the saved language at start-up.
 * @param remote - the Remote namespaces of the connected client.
 * @returns the saved language id, or `undefined` when none is saved or the Host cannot say.
 */
export async function loadSavedLanguage(remote: RemotePort): Promise<string | undefined> {
  let result
  try {
    result = await remote.settings.describe()
  } catch {
    // A rejected settings.describe() (the Host dropped the connection) only costs the saved language; the environment still names one.
    return undefined
  }
  return result.ok ? savedLanguage(result.value.namespaces.find(candidate => candidate.ns === LOCALE_NS)) : undefined
}

/**
 * Run the `/language` screen once.
 * @param remote - the Remote namespaces of the connected client.
 * @param ui - where questions and messages go.
 * @param environment - process environment used when the automatic row is chosen.
 * @returns settles when the person finished or left the screen.
 */
export async function runLanguage(
  remote: RemotePort,
  ui: FlowUi,
  environment: Readonly<Record<string, string | undefined>>,
): Promise<void> {
  const described = await remoteValue(ui, message => t('picker.loadFailed', { message }), () => remote.settings.describe())
  if (described === undefined) return
  const namespace = described.namespaces.find(candidate => candidate.ns === LOCALE_NS)
  if (namespace === undefined) {
    ui.warn(t('language.unavailable'))
    return
  }
  const saved = savedLanguage(namespace)
  const picked = await ui.pick(t('language.title'), languageItems(saved))
  if (picked === undefined) return
  const chosen: CopyLocale | undefined = picked.value === LANGUAGE_AUTOMATIC ? undefined : picked.value as CopyLocale
  const op = chosen === undefined
    ? { op: 'unset', path: [PREFERENCE_FIELD] } as const
    : { op: 'set', path: [PREFERENCE_FIELD], value: chosen } as const
  if (await writeSettings(remote, ui, LOCALE_NS, [op], namespace.revision) === undefined) return
  setCopyLocale(resolveCopyLocale(chosen, environment))
  ui.info(chosen === undefined ? t('language.automaticSaved') : t('language.saved', { name: languageName(chosen) }))
}
