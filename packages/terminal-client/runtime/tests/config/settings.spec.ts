import Schema from '@deepseek-ai/schemastery'
import { describe, expect, it } from 'vitest'
import { runSettings, settingsFields } from '../../src/config/settings.ts'
import type { RemotePort, SettingsNamespacePort } from '../../src/ports.ts'
import { fakeNamespaces, scriptedUi } from '../fakes.ts'

const DOCUMENT = '\u0000document'
const schema = Schema.object({
  maxSteps: Schema.number().default(5).description('Steps per turn'),
  verbose: Schema.boolean().default(false),
  mode: Schema.union(['fast', 'slow']).default('fast'),
  level: Schema.union([1, 2]),
  label: Schema.string(),
  count: Schema.natural(),
  ratio: Schema.percent(),
  apiKey: Schema.string().role('secret'),
  nested: Schema.object({ deep: Schema.number() }),
  merged: Schema.intersect([Schema.object({ extra: Schema.string() })]),
  mapped: Schema.transform(Schema.number(), value => value),
  hidden: Schema.string().hidden(),
  anything: Schema.any(),
  mixed: Schema.union([Schema.string(), Schema.number()]),
  odd: Schema.union([Schema.object({ a: Schema.string() })]),
  unnamed: Schema.union([]),
  lang: Schema.string(),
  tags: Schema.array(Schema.string()),
  l1: Schema.object({ l2: Schema.object({ l3: Schema.object({ l4: Schema.object({ l5: Schema.string() }) }) }) }),
})

interface Serialized { uid: number; refs: Record<string, { meta?: Record<string, unknown>; dict?: Record<string, number> }> }

/** The serialized schema with descriptions in several languages, which the builder API does not produce. */
function serialize(): Serialized {
  const serialized: Serialized = JSON.parse(JSON.stringify(schema.toJSON()))
  const fields = serialized.refs[serialized.uid]!.dict!
  const describe = (key: string, description: Record<string, string>): void => {
    const node = serialized.refs[fields[key]!]!
    node.meta = { ...node.meta, description }
  }
  describe('mode', { en: 'Mode', 'zh-CN': '模式' })
  describe('lang', { 'zh-CN': '语言' })
  return serialized
}

const namespace = (overrides: Partial<SettingsNamespacePort> = {}): SettingsNamespacePort => ({
  ns: 'agent-loop', schema: serialize(), value: { maxSteps: 8, label: 'x' }, user: {}, base: {}, secrets: [{ path: ['apiKey'], set: true }], revision: 2, ...overrides,
})

function rig(options: { writable?: boolean; namespaces?: SettingsNamespacePort[] } = {}) {
  const n = fakeNamespaces()
  n.settings.describe.mockResolvedValue({ ok: true, value: { writable: options.writable ?? true, namespaces: options.namespaces ?? [namespace(), namespace({ ns: 'empty', schema: Schema.object({}).toJSON() })] } })
  n.settings.mutate.mockImplementation(((ns: string) => Promise.resolve({ ok: true, value: namespace({ ns, revision: 3 }) })) as never)
  return { n, remote: { ...n, session: {}, $on: () => () => {} } as unknown as RemotePort }
}
const texts = (log: { kind: string; text: string }[], kind: string) => log.filter(entry => entry.kind === kind).map(entry => entry.text)
const picks = (log: { kind: string; text: string; items?: readonly { value: string }[] }[]) => log.filter(entry => entry.kind === 'pick')

describe('settings fields', () => {
  it('lists plain values in schema order and skips records, lists, hidden and deep values', () => {
    const fields = settingsFields(namespace())
    expect(fields.map(field => field.path.join('.'))).toEqual([
      'maxSteps', 'verbose', 'mode', 'level', 'label', 'count', 'ratio', 'apiKey', 'nested.deep', 'merged.extra', 'mapped', 'lang',
    ])
  })

  it('finds nothing in a schema that is not an object', () => {
    expect(settingsFields(namespace({ schema: Schema.string().toJSON() }))).toEqual([])
  })

  it('classifies each value and keeps its description and default', () => {
    const byPath = Object.fromEntries(settingsFields(namespace()).map(field => [field.path.join('.'), field]))
    expect(byPath['maxSteps']).toMatchObject({ kind: 'number', defaultValue: 5, description: 'Steps per turn' })
    expect(byPath['verbose']!.kind).toBe('boolean')
    expect(byPath['mode']).toMatchObject({ kind: 'choice', choices: ['fast', 'slow'], description: 'Mode' })
    expect(byPath['level']!.choices).toEqual([1, 2])
    expect(byPath['apiKey']!.kind).toBe('secret')
    expect(byPath['lang']!.description).toBe('语言')
    expect(byPath['label']!.description).toBeUndefined()
  })
})

describe('/settings', () => {
  it('stops when the read fails and opens the settings file on request', async () => {
    const failing = rig()
    failing.n.settings.describe.mockResolvedValue({ ok: false, error: { code: 'x', message: 'down' } } as never)
    const a = scriptedUi([])
    await runSettings(failing.remote, a.ui)
    expect(texts(a.log, 'warn')[0]).toContain('down')
    const { n, remote } = rig()
    const opened = scriptedUi([DOCUMENT])
    await runSettings(remote, opened.ui)
    expect(n.settings.openSettingsDocument).toHaveBeenCalled()
    expect(texts(opened.log, 'info')).toHaveLength(1)
    n.settings.openSettingsDocument.mockResolvedValue({ ok: false, error: { code: 'x', message: 'no editor' } } as never)
    const refused = scriptedUi([DOCUMENT])
    await runSettings(remote, refused.ui)
    expect(texts(refused.log, 'warn')[0]).toContain('no editor')
    await runSettings(remote, scriptedUi([undefined]).ui)
  })

  it('lists only namespaces with editable values, and refuses edits when read only', async () => {
    const { remote } = rig()
    const listed = scriptedUi([undefined])
    await runSettings(remote, listed.ui)
    expect(picks(listed.log)[0]!.items!.map(item => item.value)).toEqual([DOCUMENT, 'agent-loop'])
    const readOnly = scriptedUi(['agent-loop'])
    await runSettings(rig({ writable: false }).remote, readOnly.ui)
    expect(texts(readOnly.log, 'warn')).toHaveLength(1)
  })

  it('shows current values and secret state, and leaves the namespace', async () => {
    const { remote } = rig()
    const { ui, log } = scriptedUi(['agent-loop', undefined])
    await runSettings(remote, ui)
    const rows = picks(log)[1]!.items as { value: string; detail: string }[]
    expect(rows.find(row => row.value === 'maxSteps')!.detail).toContain('8')
    expect(rows.find(row => row.value === 'label')!.detail).toContain('"x"')
    expect(rows.find(row => row.value === 'verbose')!.detail).toBeDefined()
    expect(rows.find(row => row.value === 'apiKey')!.detail).not.toContain('sk')
  })

  it('does not edit secrets', async () => {
    const { n, remote } = rig({ namespaces: [namespace({ secrets: [] })] })
    const { ui, log } = scriptedUi(['agent-loop', 'apiKey', undefined])
    await runSettings(remote, ui)
    expect(texts(log, 'info')).toHaveLength(1)
    expect(n.settings.mutate).not.toHaveBeenCalled()
  })

  it('writes typed numbers and text, and resets with an empty answer', async () => {
    const { n, remote } = rig()
    const { ui, log } = scriptedUi(['agent-loop', 'maxSteps', '12', 'label', 'new', 'label', '', 'verbose', undefined, undefined])
    await runSettings(remote, ui)
    expect(n.settings.mutate.mock.calls.map(call => call[1])).toEqual([
      [{ op: 'set', path: ['maxSteps'], value: 12 }],
      [{ op: 'set', path: ['label'], value: 'new' }],
      [{ op: 'unset', path: ['label'] }],
    ])
    expect(n.settings.mutate.mock.calls[1]![2]).toBe(3)
    expect(texts(log, 'info')).toHaveLength(3)
  })

  it('rejects a number that is not one and a cancelled answer', async () => {
    const { n, remote } = rig()
    const { ui, log } = scriptedUi(['agent-loop', 'maxSteps', 'abc', 'maxSteps', undefined, undefined])
    await runSettings(remote, ui)
    expect(texts(log, 'warn')[0]).toContain('abc')
    expect(n.settings.mutate).not.toHaveBeenCalled()
  })

  it('chooses booleans and fixed choices from a list, with reset', async () => {
    const { n, remote } = rig({ namespaces: [namespace({ value: { verbose: true, mode: 'slow' } })] })
    const { ui, log } = scriptedUi(['agent-loop', 'verbose', 'v:false', 'mode', 'v:fast', 'level', 'v:2', 'mode', 'reset', 'verbose', undefined, 'count', '3', undefined, undefined])
    await runSettings(remote, ui)
    expect(n.settings.mutate.mock.calls.map(call => call[1])).toEqual([
      [{ op: 'set', path: ['verbose'], value: false }],
      [{ op: 'set', path: ['mode'], value: 'fast' }],
      [{ op: 'set', path: ['level'], value: 2 }],
      [{ op: 'unset', path: ['mode'] }],
      [{ op: 'set', path: ['count'], value: 3 }],
    ])
    const verbose = picks(log).find(entry => entry.text === 'verbose')!
    expect(verbose.items!.map(item => item.value)).toEqual(['v:true', 'v:false', 'reset'])
  })

  it('goes back to the namespace list when a write is refused', async () => {
    const { n, remote } = rig()
    n.settings.mutate.mockResolvedValue({ ok: false, error: { code: 'settings/conflict', message: 'c' } } as never)
    const { ui, log } = scriptedUi(['agent-loop', 'maxSteps', '3'])
    await runSettings(remote, ui)
    expect(texts(log, 'warn')).toHaveLength(1)
  })
})
