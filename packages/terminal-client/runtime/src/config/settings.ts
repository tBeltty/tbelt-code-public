/**
 * The `/settings` screen: browse the settings namespaces the Host describes and
 * edit single values. It covers the agent loop, shell sandbox, subagent and
 * session log settings and every other plain value, using the namespace schema
 * to choose the control; keys stay behind `/providers` and `/web-search`.
 * @module @deepseek-ai/dsh-terminal-client/config/settings
 */
import Schema from '@deepseek-ai/schemastery'
import { namespaceItems, SETTINGS_DOCUMENT, settingItems, shownValue, t } from '@deepseek-ai/dsh-terminal-views'
import type { PickerItem } from '@deepseek-ai/dsh-terminal-views'
import type { RemotePort, SettingsNamespacePort, SettingsOpPort } from '../ports.ts'
import { valueAt } from './providers.ts'
import { remoteValue } from './ui.ts'
import type { FlowUi } from './ui.ts'
import { writeSettings } from './write.ts'

/** Deepest object nesting the screen lists. */
const MAX_DEPTH = 4

/** A single value the screen can edit. */
export interface SettingsField {
  readonly path: readonly string[]
  readonly kind: 'boolean' | 'text' | 'number' | 'choice' | 'secret'
  /** Allowed values of a `choice`. */
  readonly choices: readonly (string | number)[]
  readonly description: string | undefined
  readonly defaultValue: unknown
}

/** The description a schema node carries, in English when it has several languages. */
function describe(node: Schema): string | undefined {
  const { description } = node.meta
  if (typeof description === 'string') return description
  if (description === undefined) return undefined
  return description['en'] ?? description['en-US'] ?? Object.values(description)[0]
}

/** Classify one schema node as an editable value. */
function leaf(node: Schema, path: readonly string[]): SettingsField | undefined {
  const base = { path, choices: [], description: describe(node), defaultValue: node.meta.default }
  if (node.meta.role === 'secret') return { ...base, kind: 'secret' }
  switch (node.type) {
    case 'boolean': return { ...base, kind: 'boolean' }
    case 'string': return { ...base, kind: 'text' }
    case 'number': case 'natural': case 'percent': return { ...base, kind: 'number' }
    case 'transform': return leaf(node.inner as Schema, path)
    case 'union': {
      const values = (node.list as Schema[]).map(entry => (entry.type === 'const' ? entry.value : undefined))
      if (values.length === 0 || !values.every(value => typeof value === 'string' || typeof value === 'number')) return undefined
      return { ...base, kind: 'choice', choices: values }
    }
    default: return undefined
  }
}

/** Collect the editable values under a schema node. */
function collect(node: Schema, path: readonly string[], out: SettingsField[]): void {
  if (node.meta.hidden === true || path.length > MAX_DEPTH) return
  if (node.type === 'object') {
    for (const [key, child] of Object.entries(node.dict as Record<string, Schema>)) collect(child, [...path, key], out)
  } else if (node.type === 'intersect') {
    for (const child of node.list as Schema[]) collect(child, path, out)
  } else {
    const field = path.length === 0 ? undefined : leaf(node, path)
    if (field !== undefined) out.push(field)
  }
}

/**
 * The values of a namespace that `/settings` can edit.
 * @param namespace - a namespace as the Host describes it.
 * @returns one field per plain value in the schema, in schema order; records and lists are left to the settings file.
 */
export function settingsFields(namespace: SettingsNamespacePort): SettingsField[] {
  const out: SettingsField[] = []
  collect(new Schema(namespace.schema as Schema), [], out)
  return out
}

/** Ask for the new value of a field; `null` resets it, undefined leaves it. */
async function askValue(
  ui: FlowUi,
  namespace: SettingsNamespacePort,
  field: SettingsField,
): Promise<string | number | boolean | null | undefined> {
  const label = field.path.join('.')
  const current: unknown = valueAt(namespace.value, field.path)
  const reset: PickerItem = { value: 'reset', label: t('settings.reset'), detail: field.defaultValue === undefined ? undefined : shownValue(field.defaultValue) }
  if (field.kind === 'boolean' || field.kind === 'choice') {
    const options: (string | number | boolean)[] = field.kind === 'boolean' ? [true, false] : [...field.choices]
    const picked = await ui.pick(label, [
      ...options.map(option => ({ value: `v:${String(option)}`, label: String(option), current: option === current })),
      reset,
    ])
    if (picked === undefined) return undefined
    return picked.value === 'reset' ? null : options.find(option => `v:${String(option)}` === picked.value)
  }
  const answer = await ui.ask(label, {
    hint: t('settings.valueHint', { current: shownValue(current), fallback: shownValue(field.defaultValue) }),
    initial: current === undefined ? undefined : typeof current === 'string' ? current : JSON.stringify(current),
  })
  if (answer === undefined) return undefined
  if (answer === '') return null
  if (field.kind === 'text') return answer
  const number = Number(answer)
  if (!Number.isFinite(number)) {
    ui.warn(t('settings.notNumber', { value: answer }))
    return undefined
  }
  return number
}

/** Edit values of one namespace until the person leaves its list. */
async function editNamespace(remote: RemotePort, ui: FlowUi, start: SettingsNamespacePort): Promise<void> {
  let namespace = start
  const fields = settingsFields(start)
  for (;;) {
    const picked = await ui.pick(namespace.ns, settingItems(fields.map((field) => {
      const name = field.path.join('.')
      return {
        name,
        secret: field.kind === 'secret',
        secretSet: namespace.secrets.some(entry => entry.path.join('.') === name && entry.set),
        value: valueAt(namespace.value, field.path),
        description: field.description,
      }
    })))
    if (picked === undefined) return
    const field = fields.find(candidate => candidate.path.join('.') === picked.value) as SettingsField
    if (field.kind === 'secret') {
      ui.info(t('settings.secretField'))
      continue
    }
    const value = await askValue(ui, namespace, field)
    if (value === undefined) continue
    const op: SettingsOpPort = value === null ? { op: 'unset', path: field.path } : { op: 'set', path: field.path, value }
    const stored = await writeSettings(remote, ui, namespace.ns, [op], namespace.revision)
    if (stored === undefined) return
    namespace = stored
    ui.info(t(value === null ? 'settings.resetDone' : 'settings.saved', { path: field.path.join('.'), value: shownValue(value) }))
  }
}

/**
 * Run the `/settings` screen once.
 * @param remote - the Remote namespaces of the connected client.
 * @param ui - where questions and messages go.
 * @returns settles when the person left the screen.
 */
export async function runSettings(remote: RemotePort, ui: FlowUi): Promise<void> {
  const described = await remoteValue(ui, message => t('picker.loadFailed', { message }), () => remote.settings.describe())
  if (described === undefined) return
  const picked = await ui.pick(t('settings.title'), namespaceItems(
    described.namespaces.map(namespace => ({ ns: namespace.ns, count: settingsFields(namespace).filter(field => field.kind !== 'secret').length })),
  ))
  if (picked === undefined) return
  if (picked.value === SETTINGS_DOCUMENT) {
    const opened = await remoteValue(ui, message => t('settings.documentFailed', { message }), () => remote.settings.openSettingsDocument())
    if (opened !== undefined) ui.info(t('settings.documentOpened'))
    return
  }
  if (!described.writable) {
    ui.warn(t('settings.readOnly'))
    return
  }
  const namespace = described.namespaces.find(candidate => candidate.ns === picked.value) as SettingsNamespacePort
  await editNamespace(remote, ui, namespace)
}
