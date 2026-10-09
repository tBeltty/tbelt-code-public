/**
 * The `/providers` screen: list the providers, add one from the catalog or a
 * local server, replace or remove its API key, choose its models and remove it.
 * Every read and write goes through the Remote namespaces the GUI Models page
 * uses; the rules for references, model entries and key checks come from
 * `dsh-presentation-settings`.
 * @module @deepseek-ai/dsh-terminal-client/config/providers
 */
import Schema from '@deepseek-ai/schemastery'
import {
  apiKeyFailure, cleartextRemote, customProfile, deriveKeyRef, isHttpUrl, joinProviderDirectory, LOCAL_PROVIDER_TEMPLATES,
  providerKeyRef, ROUTE_PATTERN, setupOps,
} from '@deepseek-ai/dsh-presentation-settings'
import type { DiscoveredModel, ProviderDirectoryEntry, ProviderTemplate } from '@deepseek-ai/dsh-presentation-settings'
import { CUSTOM_PROVIDER, keyProblemText, providerItems, t } from '@deepseek-ai/dsh-terminal-views'
import type { PickerItem } from '@deepseek-ai/dsh-terminal-views'
import type { CredentialInfoPort, RemotePort, SettingsNamespacePort, SettingsOpPort } from '../ports.ts'
import { confirm, remoteDone, remoteValue } from './ui.ts'
import type { FlowUi } from './ui.ts'
import { writeSettings } from './write.ts'

/** The settings namespace that holds hand-declared providers. */
const CUSTOM_NS = 'llm-pi-ai'

/** A route key no real provider uses, to walk a dictionary schema to the node every route shares. */
const PROBE_ROUTE = '\u0000probe'

/** Providers that sign in with a vendor account; the terminal offers key-based providers only. */
const ACCOUNT_ROUTES: ReadonlySet<string> = new Set(['deepseek-account'])

/** One provider as the screen lists it. */
export interface ProviderRowFacts {
  readonly entry: ProviderDirectoryEntry
  readonly namespace: SettingsNamespacePort | undefined
  /** Whether a layer configures the provider. */
  readonly configured: boolean
  /** Whether only the user layer carries the profile, so removing it restores the base. */
  readonly removable: boolean
  /** The credential reference the profile names, or the conventional one. */
  readonly keyRef: string
  /** Whether the profile names a reference at all; a profile that names none needs no stored key. */
  readonly needsKey: boolean
  readonly key: CredentialInfoPort | undefined
}

/**
 * Read a nested value by an object-key path.
 * @param value - the value to walk.
 * @param path - object keys.
 * @returns the value at the path, or undefined when any step is missing.
 */
export function valueAt(value: unknown, path: readonly string[]): unknown {
  let current = value
  for (const key of path) {
    if (typeof current !== 'object' || current === null) return undefined
    current = (current as Record<string, unknown>)[key]
  }
  return current
}

/** Whether the user layer holds a value at a non-empty path. */
function storedAt(layer: unknown, path: readonly string[]): boolean {
  const parent = valueAt(layer, path.slice(0, -1))
  return typeof parent === 'object' && parent !== null && (path.at(-1) as string) in parent
}

/**
 * The wire protocols a hand-declared provider may name, read from the namespace schema so the choices cannot drift
 * from what the adapter accepts.
 * @param namespace - the `llm-pi-ai` namespace.
 * @returns the protocol ids, or an empty list when the schema names none.
 */
export function protocolChoices(namespace: SettingsNamespacePort): string[] {
  let node: Schema | undefined = new Schema(namespace.schema as Schema)
  for (const key of ['providers', PROBE_ROUTE, 'api']) {
    if (node === undefined) return []
    if (node.type === 'object') node = (node.dict as Record<string, Schema> | undefined)?.[key]
    else if (node.type === 'dict' || node.type === 'array') node = node.inner as Schema | undefined
    else return []
  }
  if (node?.type !== 'union' || node.list === undefined) return []
  return node.list.map(entry => entry.value).filter((value): value is string => typeof value === 'string')
}

/** Everything the screen reads before it draws the list. */
interface ProviderSnapshot {
  readonly writable: boolean
  readonly rows: readonly ProviderRowFacts[]
  readonly custom: SettingsNamespacePort | undefined
  readonly hasModels: boolean
}

/** The Remote calls and prompts of the screen. */
interface Context {
  readonly remote: RemotePort
  readonly ui: FlowUi
}

/** Read the providers, their settings and the state of their keys. */
async function load({ remote, ui }: Context): Promise<ProviderSnapshot | undefined> {
  const failed = (message: string): string => t('picker.loadFailed', { message })
  const [registered, configurable, settings, catalog] = await Promise.all([
    remoteValue(ui, failed, () => remote.llm.listProviders()),
    remoteValue(ui, failed, () => remote.llm.listConfigurableProviders()),
    remoteValue(ui, failed, () => remote.settings.describe()),
    remote.session.modelCatalog().catch(() => undefined),
  ])
  if (registered === undefined || configurable === undefined || settings === undefined) return undefined
  const entries = joinProviderDirectory(registered, configurable).filter(entry => !ACCOUNT_ROUTES.has(entry.provider))
  const rows = entries.map((entry): ProviderRowFacts => {
    const namespace = settings.namespaces.find(candidate => candidate.ns === entry.settingsNs)
    const profile = namespace === undefined ? undefined : valueAt(namespace.value, entry.settingsPath)
    const named = typeof profile === 'object' && profile !== null && typeof (profile as { apiKeyEnv?: unknown }).apiKeyEnv === 'string'
    return {
      entry,
      namespace,
      configured: namespace !== undefined && (entry.settingsPath.length === 0 || profile !== undefined),
      removable: namespace !== undefined && entry.settingsPath.length > 0
        && storedAt(namespace.user, entry.settingsPath) && !storedAt(namespace.base, entry.settingsPath),
      keyRef: providerKeyRef(profile, entry.provider),
      needsKey: named,
      key: undefined,
    }
  })
  const refs = [...new Set(rows.filter(row => row.needsKey).map(row => row.keyRef))]
  const described = refs.length === 0 ? {} : await remoteValue(ui, failed, () => remote.credentials.describe(refs)) ?? {}
  return {
    writable: settings.writable,
    rows: rows.map(row => ({ ...row, key: row.needsKey ? described[row.keyRef] : undefined })),
    custom: settings.namespaces.find(candidate => candidate.ns === CUSTOM_NS),
    hasModels: catalog?.ok === true && catalog.value.groups.some(group => group.models.length > 0),
  }
}

/** A model-discovery answer: the models, or the line that explains why there are none. */
type Discovery = { readonly models: readonly DiscoveredModel[] } | { readonly failure: string }

/** Ask the provider which models a request can use. */
async function discover(
  { remote }: Context,
  ns: string,
  request: Parameters<RemotePort['llm']['discoverModels']>[1],
): Promise<Discovery> {
  let result
  try {
    result = await remote.llm.discoverModels(ns, request)
  } catch (error) {
    return { failure: error instanceof Error ? error.message : String(error) }
  }
  if (result.ok) return { models: result.value }
  const code = result.error.details?.code
  if (code === 'INVALID_CREDENTIAL') return { failure: t('providers.keyRejected') }
  if (code === 'QUOTA') return { failure: t('providers.keyQuota') }
  return { failure: result.error.message }
}

/** Apply settings edits, saying why when the Host refuses them. */
async function write({ remote, ui }: Context, ns: string, ops: readonly SettingsOpPort[], revision: number): Promise<boolean> {
  return await writeSettings(remote, ui, ns, ops, revision) !== undefined
}

/** Judge a typed key and say what is wrong with it. */
function keyProblem(ui: FlowUi, key: string): boolean {
  const failure = apiKeyFailure(key)
  if (failure === undefined) return false
  ui.warn(keyProblemText(failure))
  return true
}

/** Let the person tick the models to keep. */
async function chooseModels(
  ui: FlowUi,
  models: readonly DiscoveredModel[],
  checked: readonly string[] = [],
): Promise<DiscoveredModel[] | undefined> {
  const items = models.map(model => ({ value: model.id, label: model.id, detail: model.name }))
  const values = await ui.pickMany(t('providers.modelsTitle'), items, { checked })
  const chosen = values === undefined ? [] : models.filter(model => values.includes(model.id))
  if (chosen.length === 0) {
    ui.info(t('providers.nothingChosen'))
    return undefined
  }
  return chosen
}

/** Ask for model ids by hand, for a provider that lists none. */
async function typedModels(ui: FlowUi): Promise<DiscoveredModel[] | undefined> {
  const answer = await ui.ask(t('providers.typedModels'), { hint: t('providers.typedModelsHint') })
  const ids = [...new Set((answer ?? '').split(/[\s,]+/u).filter(id => id !== ''))]
  if (ids.length === 0) {
    ui.info(t('providers.nothingChosen'))
    return undefined
  }
  return ids.map(id => ({ id }))
}

/** Make the first model of a new provider the default when no model was usable before. */
async function defaultFirst({ remote }: Context, snapshot: ProviderSnapshot, provider: string, model: string | undefined): Promise<void> {
  if (snapshot.hasModels || model === undefined) return
  // A refused default only leaves /model to choose, so it does not fail the setup.
  await remote.session.setDefaultModel({ provider, model }).catch(() => undefined)
}

/** Store a key and say so. */
async function storeKey({ remote, ui }: Context, ref: string, key: string): Promise<boolean> {
  return await remoteDone(ui, message => t('providers.keyNotStored', { message }), () => remote.credentials.set(ref, key))
}

/** Add a catalog provider: key, models, then the profile and the key in that order. */
async function setup(context: Context, snapshot: ProviderSnapshot, row: ProviderRowFacts, withKey: boolean): Promise<void> {
  const { ui } = context
  const namespace = row.namespace as SettingsNamespacePort
  const name = row.entry.displayName
  let key: string | undefined
  if (withKey) {
    const typed = await ui.ask(t('providers.keyPrompt', { name }), { secret: true, hint: t('providers.keyHint') })
    if (typed === undefined || typed === '') {
      ui.info(t('providers.cancelled'))
      return
    }
    if (keyProblem(ui, typed)) return
    key = typed
    ui.info(t('providers.checking'))
  }
  const found = await discover(context, namespace.ns, {
    provider: row.entry.provider,
    ...key === undefined ? {} : { apiKey: key, live: true },
  })
  let models: readonly DiscoveredModel[] | undefined
  if ('failure' in found) {
    ui.warn(found.failure)
    if (withKey) return
    models = []
  } else {
    models = found.models
  }
  let chosen: DiscoveredModel[] | undefined
  if (models.length === 0) {
    if (withKey) ui.warn(t('providers.noModels'))
    chosen = withKey ? undefined : await typedModels(ui)
  } else {
    chosen = await chooseModels(ui, models)
  }
  if (chosen === undefined) return
  const stored = valueAt(namespace.user, row.entry.settingsPath)
  const ops = setupOps(row.entry.settingsPath, stored, key === undefined ? undefined : row.keyRef, chosen)
  if (!await write(context, namespace.ns, ops, namespace.revision)) return
  if (key !== undefined && !await storeKey(context, row.keyRef, key)) return
  await defaultFirst(context, snapshot, row.entry.provider, chosen[0]?.id)
  ui.info(t('providers.added', { name, count: chosen.length }))
}

/** Choose again which models a configured provider offers. */
async function chooseAgain(context: Context, row: ProviderRowFacts): Promise<void> {
  const { ui } = context
  const namespace = row.namespace as SettingsNamespacePort
  const found = await discover(context, namespace.ns, { provider: row.entry.provider })
  if ('failure' in found) {
    ui.warn(found.failure)
    return
  }
  const stored = valueAt(namespace.value, [...row.entry.settingsPath, 'models'])
  const current = Array.isArray(stored) ? stored.flatMap((model: unknown) => {
    const id = typeof model === 'object' && model !== null ? (model as { id?: unknown }).id : undefined
    return typeof id === 'string' ? [id] : []
  }) : []
  const known = new Set(found.models.map(model => model.id))
  const chosen = await chooseModels(ui, [...found.models, ...current.filter(id => !known.has(id)).map(id => ({ id }))], current)
  if (chosen === undefined) return
  const ops = setupOps(row.entry.settingsPath, valueAt(namespace.user, row.entry.settingsPath), undefined, chosen)
  if (!await write(context, namespace.ns, ops, namespace.revision)) return
  ui.info(t('providers.modelsSaved', { name: row.entry.displayName, count: chosen.length }))
}

/** Replace the stored key of a provider, checking it with the provider first. */
async function replaceKey(context: Context, row: ProviderRowFacts): Promise<void> {
  const { ui } = context
  const namespace = row.namespace as SettingsNamespacePort
  const typed = await ui.ask(t('providers.keyPrompt', { name: row.entry.displayName }), { secret: true, hint: t('providers.keyHint') })
  if (typed === undefined || typed === '') {
    ui.info(t('providers.cancelled'))
    return
  }
  if (keyProblem(ui, typed)) return
  ui.info(t('providers.checking'))
  const found = await discover(context, namespace.ns, { provider: row.entry.provider, apiKey: typed, live: true })
  if ('failure' in found) {
    ui.warn(found.failure)
    if (!await confirm(ui, t('providers.saveAnyway'), t('providers.saveAnywayYes'))) return
  }
  if (await storeKey(context, row.keyRef, typed)) ui.info(t('providers.keyReplaced', { name: row.entry.displayName }))
}

/** Remove a stored key after the person confirms. */
async function removeKey({ remote, ui }: Context, row: ProviderRowFacts): Promise<void> {
  if (!await confirm(ui, t('providers.removeKeyAsk', { name: row.entry.displayName }), t('providers.removeKeyYes'))) return
  if (await remoteDone(ui, message => t('providers.keyNotRemoved', { message }), () => remote.credentials.unset(row.keyRef))) {
    ui.info(t('providers.keyRemoved', { name: row.entry.displayName }))
  }
}

/** Remove a provider the user added, after the person confirms. */
async function removeProvider(context: Context, row: ProviderRowFacts): Promise<void> {
  const { ui } = context
  const namespace = row.namespace as SettingsNamespacePort
  if (!await confirm(ui, t('providers.removeAsk', { name: row.entry.displayName }), t('providers.removeYes'))) return
  if (await write(context, namespace.ns, [{ op: 'unset', path: [...row.entry.settingsPath] }], namespace.revision)) {
    ui.info(t('providers.removed', { name: row.entry.displayName }))
  }
}

/** The actions available on one provider. */
function actionItems(row: ProviderRowFacts): PickerItem[] {
  if (row.namespace === undefined) return []
  return [
    { value: 'setup', label: t('providers.action.setup') },
    { value: 'keyless', label: t('providers.action.keyless') },
    ...row.configured ? [{ value: 'models', label: t('providers.action.models') }] : [],
    ...row.needsKey ? [{ value: 'replace', label: t('providers.action.replaceKey') }] : [],
    ...row.key?.configured === true && row.key.writable ? [{ value: 'removeKey', label: t('providers.action.removeKey') }] : [],
    ...row.removable ? [{ value: 'remove', label: t('providers.action.remove') }] : [],
  ]
}

/** Offer the actions of one provider and run the chosen one. */
async function act(context: Context, snapshot: ProviderSnapshot, row: ProviderRowFacts): Promise<void> {
  const { ui } = context
  const items = actionItems(row)
  if (items.length === 0) {
    ui.info(t('providers.noActions', { name: row.entry.displayName }))
    return
  }
  const action = await ui.pick(row.entry.displayName, items)
  switch (action?.value) {
    case 'setup':
      await setup(context, snapshot, row, true)
      return
    case 'keyless':
      await setup(context, snapshot, row, false)
      return
    case 'models':
      await chooseAgain(context, row)
      return
    case 'replace':
      await replaceKey(context, row)
      return
    case 'removeKey':
      await removeKey(context, row)
      return
    case 'remove':
      await removeProvider(context, row)
      return
    default:
  }
}

/** Ask for a route id until it is usable. */
async function askRoute(ui: FlowUi, taken: ReadonlySet<string>, initial: string): Promise<string | undefined> {
  let proposal = initial
  for (;;) {
    const answer = await ui.ask(t('providers.routePrompt'), { hint: t('providers.routeHint'), initial: proposal })
    if (answer === undefined) return undefined
    if (!ROUTE_PATTERN.test(answer)) ui.warn(t('providers.routeInvalid'))
    else if (taken.has(answer)) ui.warn(t('providers.routeTaken', { route: answer }))
    else return answer
    proposal = answer
  }
}

/** Ask for a base URL until it is an http or https address. */
async function askBaseUrl(ui: FlowUi, initial: string): Promise<string | undefined> {
  let proposal = initial
  for (;;) {
    const answer = await ui.ask(t('providers.baseUrlPrompt'), { hint: t('providers.baseUrlHint'), initial: proposal })
    if (answer === undefined) return undefined
    if (isHttpUrl(answer)) {
      if (cleartextRemote(answer)) ui.info(t('providers.cleartext'))
      return answer
    }
    ui.warn(t('providers.baseUrlInvalid'))
    proposal = answer
  }
}

/** Choose the wire protocol of a hand-declared provider. */
async function chooseProtocol(ui: FlowUi, namespace: SettingsNamespacePort, preferred: string | undefined): Promise<string | undefined> {
  const choices = protocolChoices(namespace)
  if (choices.length === 0) return preferred ?? 'openai-completions'
  if (choices.length === 1) return choices[0]
  const picked = await ui.pick(t('providers.protocolTitle'), choices.map(choice => ({ value: choice, label: choice, current: choice === preferred })))
  return picked?.value
}

/** Declare a provider the catalog does not list: a local server or a compatible gateway. */
async function addCustom(context: Context, snapshot: ProviderSnapshot): Promise<void> {
  const { ui } = context
  const namespace = snapshot.custom
  if (namespace === undefined) {
    ui.warn(t('providers.customUnavailable'))
    return
  }
  const templateRows: PickerItem[] = [
    ...LOCAL_PROVIDER_TEMPLATES.map(template => ({ value: template.id, label: template.displayName, detail: template.baseURL })),
    { value: '', label: t('providers.templateOther'), detail: t('providers.templateOtherDetail') },
  ]
  const picked = await ui.pick(t('providers.templateTitle'), templateRows)
  if (picked === undefined) return
  const template: ProviderTemplate | undefined = LOCAL_PROVIDER_TEMPLATES.find(candidate => candidate.id === picked.value)
  const declared = valueAt(namespace.value, ['providers'])
  const taken = new Set([...snapshot.rows.map(row => row.entry.provider), ...typeof declared === 'object' && declared !== null ? Object.keys(declared) : []])
  const route = await askRoute(ui, taken, template?.route ?? '')
  if (route === undefined) return
  const displayName = await ui.ask(t('providers.namePrompt'), { hint: t('providers.nameHint'), initial: template?.displayName })
  if (displayName === undefined) return
  const baseURL = await askBaseUrl(ui, template?.baseURL ?? '')
  if (baseURL === undefined) return
  const api = await chooseProtocol(ui, namespace, template?.api)
  if (api === undefined) return
  const key = await ui.ask(t('providers.customKeyPrompt'), { secret: true, hint: t('providers.customKeyHint'), initial: template?.placeholderKey })
  if (key === undefined || keyProblem(ui, key)) return
  const found = await discover(context, CUSTOM_NS, { baseURL, api, ...key === '' ? {} : { apiKey: key } })
  if ('failure' in found) ui.warn(found.failure)
  const listed = 'models' in found ? found.models : []
  const chosen = listed.length > 0 ? await chooseModels(ui, listed) : await typedModels(ui)
  if (chosen === undefined) return
  const keyRef = key === '' ? undefined : deriveKeyRef(route)
  const profile = customProfile({ route, displayName, baseURL, api, keyRef, models: chosen })
  if (!await write(context, CUSTOM_NS, [{ op: 'set', path: ['providers', route], value: profile }], namespace.revision)) return
  if (keyRef !== undefined && !await storeKey(context, keyRef, key)) return
  await defaultFirst(context, snapshot, route, chosen[0]?.id)
  ui.info(t('providers.added', { name: displayName === '' ? route : displayName, count: chosen.length }))
}

/**
 * Run the `/providers` screen once.
 * @param remote - the Remote namespaces of the connected client.
 * @param ui - where questions and messages go.
 * @returns settles when the person finished or left the screen.
 */
export async function runProviders(remote: RemotePort, ui: FlowUi): Promise<void> {
  const context: Context = { remote, ui }
  const snapshot = await load(context)
  if (snapshot === undefined) return
  const chosen = await ui.pick(t('providers.title'), providerItems(snapshot.rows.map(row => ({
    provider: row.entry.provider,
    displayName: row.entry.displayName,
    active: row.entry.active,
    error: row.entry.error,
    configured: row.configured,
    needsKey: row.needsKey,
    keyConfigured: row.key?.configured === true,
  }))))
  if (chosen === undefined) return
  if (!snapshot.writable) {
    ui.warn(t('settings.readOnly'))
    return
  }
  if (chosen.value === CUSTOM_PROVIDER) {
    await addCustom(context, snapshot)
    return
  }
  await act(context, snapshot, snapshot.rows.find(candidate => candidate.entry.provider === chosen.value) as ProviderRowFacts)
}
