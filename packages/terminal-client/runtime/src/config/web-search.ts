/**
 * The `/web-search` screen: choose the web search provider and store its API
 * key after the Host checks it, through the same Remote calls as the GUI card.
 * @module @deepseek-ai/dsh-terminal-client/config/web-search
 */
import { apiKeyFailure } from '@deepseek-ai/dsh-presentation-settings'
import { keyProblemText, t, webSearchItems } from '@deepseek-ai/dsh-terminal-views'
import type { RemotePort } from '../ports.ts'
import { confirm, remoteDone, remoteValue } from './ui.ts'
import type { FlowUi } from './ui.ts'
import { writeSettings } from './write.ts'

/** The settings namespace that pins the search provider. */
const WEB_NS = 'web'

/**
 * Run the `/web-search` screen once.
 * @param remote - the Remote namespaces of the connected client.
 * @param ui - where questions and messages go.
 * @returns settles when the person finished or left the screen.
 */
export async function runWebSearch(remote: RemotePort, ui: FlowUi): Promise<void> {
  const failed = (message: string): string => t('picker.loadFailed', { message })
  const [providers, settings] = await Promise.all([
    remoteValue(ui, failed, () => remote.web.searchProviders()),
    remoteValue(ui, failed, () => remote.settings.describe()),
  ])
  if (providers === undefined || settings === undefined) return
  const namespace = settings.namespaces.find(candidate => candidate.ns === WEB_NS)
  if (namespace === undefined) {
    ui.warn(t('webSearch.unavailable'))
    return
  }
  const described = providers.length === 0
    ? {}
    : await remoteValue(ui, failed, () => remote.credentials.describe(providers.map(provider => provider.credentialRef)))
  if (described === undefined) return
  const pinned = (namespace.value as { searchProvider?: unknown } | undefined)?.searchProvider
  const items = webSearchItems(
    providers.map(provider => ({ id: provider.id, keyConfigured: described[provider.credentialRef]?.configured === true })),
    typeof pinned === 'string' ? pinned : undefined,
  )
  const chosen = await ui.pick(t('webSearch.title'), items)
  if (chosen === undefined) return
  if (!settings.writable) {
    ui.warn(t('settings.readOnly'))
    return
  }
  const provider = providers.find(candidate => candidate.id === chosen.value)
  if (provider !== undefined) {
    const hasKey = described[provider.credentialRef]?.configured === true
    if (!hasKey || await confirm(ui, t('webSearch.replaceAsk', { provider: provider.id }), t('webSearch.replaceYes'))) {
      const stored = await askKey(remote, ui, provider.id, provider.credentialRef)
      // A provider without a key cannot search, so the choice is not saved without one.
      if (!stored && !hasKey) return
    }
  }
  const ops = provider === undefined
    ? [{ op: 'unset' as const, path: ['searchProvider'] }]
    : [{ op: 'set' as const, path: ['searchProvider'], value: provider.id }]
  if (await writeSettings(remote, ui, WEB_NS, ops, namespace.revision) !== undefined) {
    ui.info(t('webSearch.saved', { provider: provider?.id ?? t('webSearch.automatic') }))
  }
}

/** Ask for a key, have the Host check it, and store it; a key with no credit left is stored with a note. */
async function askKey(remote: RemotePort, ui: FlowUi, provider: string, ref: string): Promise<boolean> {
  const typed = await ui.ask(t('webSearch.keyPrompt', { provider }), { secret: true, hint: t('providers.keyHint') })
  if (typed === undefined || typed === '') {
    ui.info(t('providers.cancelled'))
    return false
  }
  const problem = apiKeyFailure(typed)
  if (problem !== undefined) {
    ui.warn(keyProblemText(problem))
    return false
  }
  ui.info(t('providers.checking'))
  const check = await remoteValue(ui, message => t('webSearch.checkFailed', { message }), () => remote.web.checkSearchKey(provider, typed))
  if (check === undefined) return false
  if (!check.ok && check.reason !== 'quota') {
    ui.warn(check.message)
    return false
  }
  if (!check.ok) ui.warn(check.message)
  return await remoteDone(ui, message => t('providers.keyNotStored', { message }), () => remote.credentials.set(ref, typed))
}
