import { describe, expect, it, vi } from 'vitest'
import { protocolChoices, runProviders, valueAt } from '../../src/config/providers.ts'
import type { RemotePort, SettingsNamespacePort } from '../../src/ports.ts'
import { fakeNamespaces, fakeSessionRemote, scriptedUi } from '../fakes.ts'

const CUSTOM = '\u0000custom'
const protocolSchema = {
  type: 'object',
  dict: { providers: { type: 'dict', inner: { type: 'object', dict: { api: { type: 'union', list: [{ type: 'const', value: 'openai-completions' }, { type: 'const', value: 'anthropic-messages' }] } } } } },
}
const ns = (overrides: Partial<SettingsNamespacePort> = {}): SettingsNamespacePort => ({
  ns: 'llm-pi-ai', schema: protocolSchema, value: {}, user: {}, base: {}, secrets: [], revision: 3, ...overrides,
})
const listed = (provider: string, displayName: string, extra: object = {}) => ({
  provider, displayName, settingsNs: 'llm-pi-ai', settingsPath: ['providers', provider], ...extra,
})

function rig(options: {
  namespaces?: SettingsNamespacePort[]
  configurable?: object[]
  registered?: { id: string; name: string }[]
  keys?: Record<string, { configured: boolean; writable: boolean }>
  writable?: boolean
  catalog?: unknown
} = {}) {
  const n = fakeNamespaces()
  const session = fakeSessionRemote()
  const configurable = options.configurable ?? [listed('acme', 'Acme')]
  n.llm.listProviders.mockResolvedValue({ ok: true, value: options.registered ?? [{ id: 'acme', name: 'Acme' }] })
  n.llm.listConfigurableProviders.mockResolvedValue({ ok: true, value: configurable as never })
  n.settings.describe.mockResolvedValue({
    ok: true,
    value: { writable: options.writable ?? true, namespaces: options.namespaces ?? [ns()] },
  })
  n.credentials.describe.mockResolvedValue({ ok: true, value: options.keys ?? {} })
  if (options.catalog !== undefined) session.modelCatalog.mockResolvedValue(options.catalog)
  const remote = { ...n, session, $on: () => () => {} } as unknown as RemotePort
  return { n, session, remote }
}
const flat = (log: { kind: string; text: string }[], kind: string) => log.filter(entry => entry.kind === kind).map(entry => entry.text)
const emptyCatalog = { ok: true, value: { default: undefined, groups: [] } }

describe('valueAt and protocolChoices', () => {
  it('walks object keys and stops at gaps', () => {
    expect(valueAt({ a: { b: 1 } }, ['a', 'b'])).toBe(1)
    expect(valueAt({ a: 1 }, ['a', 'b'])).toBeUndefined()
    expect(valueAt(null, ['a'])).toBeUndefined()
    expect(valueAt(5, [])).toBe(5)
  })

  it('reads the protocol ids from the schema', () => {
    expect(protocolChoices(ns())).toEqual(['openai-completions', 'anthropic-messages'])
  })

  it('returns nothing when the schema does not name them', () => {
    expect(protocolChoices(ns({ schema: { type: 'object', dict: {} } }))).toEqual([])
    expect(protocolChoices(ns({ schema: { type: 'string' } }))).toEqual([])
    expect(protocolChoices(ns({ schema: { type: 'object', dict: { providers: { type: 'array', inner: { type: 'object', dict: { api: { type: 'string' } } } } } } }))).toEqual([])
    expect(protocolChoices(ns({ schema: { type: 'object', dict: { providers: { type: 'dict' } } } }))).toEqual([])
  })
})

describe('/providers', () => {
  it('stops with a message when a read fails', async () => {
    const { n, remote } = rig()
    n.llm.listProviders.mockResolvedValue({ ok: false, error: { code: 'x', message: 'down' } } as never)
    const { ui, log } = scriptedUi([])
    await runProviders(remote, ui)
    expect(flat(log, 'warn')[0]).toContain('down')
    expect(flat(log, 'pick')).toEqual([])
  })

  it('leaves quietly when the list is closed and warns when settings are read-only', async () => {
    const closed = scriptedUi([undefined])
    await runProviders(rig().remote, closed.ui)
    expect(closed.log.filter(entry => entry.kind === 'warn')).toEqual([])
    const readOnly = scriptedUi(['acme'])
    await runProviders(rig({ writable: false }).remote, readOnly.ui)
    expect(flat(readOnly.log, 'warn')).toHaveLength(1)
  })

  it('hides vendor-account routes and unknown rows', async () => {
    const { remote } = rig({ configurable: [listed('deepseek-account', 'Account'), listed('acme', 'Acme')], registered: [] })
    const { ui, log } = scriptedUi([undefined])
    await runProviders(remote, ui)
    expect(log[0]!.items!.map(item => item.value)).toEqual([CUSTOM, 'acme'])
  })

  it('sets up a provider with a checked key and chosen models, key stored after the profile, first model made default', async () => {
    const { n, session, remote } = rig({ catalog: emptyCatalog })
    n.llm.discoverModels.mockResolvedValue({ ok: true, value: [{ id: 'm1' }, { id: 'm2', name: 'Two' }] } as never)
    const { ui, log } = scriptedUi(['acme', 'setup', 'sk-test', ['m1']])
    await runProviders(remote, ui)
    expect(n.llm.discoverModels).toHaveBeenCalledWith('llm-pi-ai', { provider: 'acme', apiKey: 'sk-test', live: true })
    const order = [n.settings.mutate.mock.invocationCallOrder[0]!, n.credentials.set.mock.invocationCallOrder[0]!]
    expect(order[0]).toBeLessThan(order[1]!)
    expect(n.credentials.set).toHaveBeenCalledWith('ACME_API_KEY', 'sk-test')
    expect(session.setDefaultModel).toHaveBeenCalledWith({ provider: 'acme', model: 'm1' })
    expect(flat(log, 'info').at(-1)).toContain('Acme')
    expect(log.flatMap(entry => entry.text).join('\n')).not.toContain('sk-test')
  })

  it('does not change the default when a model already works or the default is refused', async () => {
    const working = rig({ catalog: { ok: true, value: { default: undefined, groups: [{ id: 'g', name: 'g', models: [{ id: 'x', name: 'x' }] }] } } })
    working.n.llm.discoverModels.mockResolvedValue({ ok: true, value: [{ id: 'm1' }] } as never)
    await runProviders(working.remote, scriptedUi(['acme', 'setup', 'sk-test', ['m1']]).ui)
    expect(working.session.setDefaultModel).not.toHaveBeenCalled()
    const refused = rig({ catalog: { ok: false, error: { code: 'x', message: 'm' } } })
    refused.n.llm.discoverModels.mockResolvedValue({ ok: true, value: [{ id: 'm1' }] } as never)
    refused.session.setDefaultModel.mockRejectedValue(new Error('no'))
    const { ui, log } = scriptedUi(['acme', 'setup', 'sk-test', ['m1']])
    await runProviders(refused.remote, ui)
    expect(flat(log, 'info').at(-1)).toContain('Acme')
    const thrown = rig()
    thrown.session.modelCatalog.mockRejectedValue(new Error('x'))
    thrown.n.llm.discoverModels.mockResolvedValue({ ok: true, value: [{ id: 'm1' }] } as never)
    await runProviders(thrown.remote, scriptedUi(['acme', 'setup', 'sk-test', ['m1']]).ui)
    expect(thrown.session.setDefaultModel).toHaveBeenCalled()
  })

  it('stops on a cancelled, blank or illegal key, a rejected key and an empty model list', async () => {
    for (const answers of [['acme', 'setup', undefined], ['acme', 'setup', '']]) {
      const { n, remote } = rig()
      const { ui, log } = scriptedUi(answers)
      await runProviders(remote, ui)
      expect(flat(log, 'info')).toHaveLength(1)
      expect(n.settings.mutate).not.toHaveBeenCalled()
    }
    for (const key of ['bad\u0007key', '   ']) {
      const { n, remote } = rig()
      const { ui, log } = scriptedUi(['acme', 'setup', key])
      await runProviders(remote, ui)
      expect(flat(log, 'warn')).toHaveLength(1)
      expect(n.llm.discoverModels).not.toHaveBeenCalled()
    }
    const codes: [object, string][] = [
      [{ code: 'x', message: 'm', details: { code: 'INVALID_CREDENTIAL' } }, 'rejected'],
      [{ code: 'x', message: 'm', details: { code: 'QUOTA' } }, 'credit'],
      [{ code: 'x', message: 'plain failure' }, 'plain failure'],
    ]
    for (const [error, text] of codes) {
      const { n, remote } = rig()
      n.llm.discoverModels.mockResolvedValue({ ok: false, error } as never)
      const { ui, log } = scriptedUi(['acme', 'setup', 'sk-test'])
      await runProviders(remote, ui)
      expect(flat(log, 'warn').join(' ')).toContain(text)
      expect(n.settings.mutate).not.toHaveBeenCalled()
    }
    const thrown = rig()
    thrown.n.llm.discoverModels.mockRejectedValue('offline')
    const second = scriptedUi(['acme', 'setup', 'sk-test'])
    await runProviders(thrown.remote, second.ui)
    expect(flat(second.log, 'warn')[0]).toContain('offline')
    const thrownError = rig()
    thrownError.n.llm.discoverModels.mockRejectedValue(new Error('boom'))
    const third = scriptedUi(['acme', 'setup', 'sk-test'])
    await runProviders(thrownError.remote, third.ui)
    expect(flat(third.log, 'warn')[0]).toContain('boom')
    const none = rig()
    const fourth = scriptedUi(['acme', 'setup', 'sk-test'])
    await runProviders(none.remote, fourth.ui)
    expect(flat(fourth.log, 'warn')).toHaveLength(1)
    expect(none.n.settings.mutate).not.toHaveBeenCalled()
  })

  it('stops when no model is ticked, the profile is refused or the key cannot be stored', async () => {
    const unticked = rig()
    unticked.n.llm.discoverModels.mockResolvedValue({ ok: true, value: [{ id: 'm1' }] } as never)
    await runProviders(unticked.remote, scriptedUi(['acme', 'setup', 'sk-test', undefined]).ui)
    expect(unticked.n.settings.mutate).not.toHaveBeenCalled()
    const refused = rig()
    refused.n.llm.discoverModels.mockResolvedValue({ ok: true, value: [{ id: 'm1' }] } as never)
    refused.n.settings.mutate.mockResolvedValue({ ok: false, error: { code: 'settings/conflict', message: 'c' } } as never)
    await runProviders(refused.remote, scriptedUi(['acme', 'setup', 'sk-test', ['m1']]).ui)
    expect(refused.n.credentials.set).not.toHaveBeenCalled()
    const unstored = rig()
    unstored.n.llm.discoverModels.mockResolvedValue({ ok: true, value: [{ id: 'm1' }] } as never)
    unstored.n.credentials.set.mockResolvedValue({ ok: false, error: { code: 'x', message: 'locked' } } as never)
    const { ui, log } = scriptedUi(['acme', 'setup', 'sk-test', ['m1']])
    await runProviders(unstored.remote, ui)
    expect(flat(log, 'warn')[0]).toContain('locked')
    expect(unstored.session.setDefaultModel).not.toHaveBeenCalled()
  })

  it('sets up a keyless provider with models it lists or typed ids', async () => {
    const listedModels = rig({ catalog: emptyCatalog })
    listedModels.n.llm.discoverModels.mockResolvedValue({ ok: true, value: [{ id: 'm1' }] } as never)
    await runProviders(listedModels.remote, scriptedUi(['acme', 'keyless', ['m1']]).ui)
    expect(listedModels.n.llm.discoverModels).toHaveBeenCalledWith('llm-pi-ai', { provider: 'acme' })
    expect(listedModels.n.credentials.set).not.toHaveBeenCalled()
    const typed = rig()
    typed.n.llm.discoverModels.mockResolvedValue({ ok: false, error: { code: 'x', message: 'no list' } } as never)
    const { ui, log } = scriptedUi(['acme', 'keyless', 'one, two one'])
    await runProviders(typed.remote, ui)
    expect(flat(log, 'warn')[0]).toContain('no list')
    expect(typed.n.settings.mutate).toHaveBeenCalled()
    const empty = rig()
    await runProviders(empty.remote, scriptedUi(['acme', 'keyless', undefined]).ui)
    expect(empty.n.settings.mutate).not.toHaveBeenCalled()
    const blank = rig()
    await runProviders(blank.remote, scriptedUi(['acme', 'keyless', ' , ']).ui)
    expect(blank.n.settings.mutate).not.toHaveBeenCalled()
  })

  it('offers only the actions that apply and says when none do', async () => {
    const none = rig({ namespaces: [] })
    const first = scriptedUi(['acme'])
    await runProviders(none.remote, first.ui)
    expect(flat(first.log, 'info')).toHaveLength(1)
    const configured = rig({
      namespaces: [ns({
        value: { providers: { acme: { apiKeyEnv: 'ACME_KEY', models: [{ id: 'm1' }, 'odd', { id: 5 }] } } },
        user: { providers: { acme: { apiKeyEnv: 'ACME_KEY' } } },
      })],
      keys: { ACME_KEY: { configured: true, writable: true } },
    })
    const second = scriptedUi(['acme', undefined])
    await runProviders(configured.remote, second.ui)
    const actions = second.log[1]!.items!.map(item => item.value)
    expect(actions).toEqual(['setup', 'keyless', 'models', 'replace', 'removeKey', 'remove'])
    expect(configured.n.credentials.describe).toHaveBeenCalledWith(['ACME_KEY'])
  })

  const configured = (extra: Partial<SettingsNamespacePort> = {}) => rig({
    namespaces: [ns({
      value: { providers: { acme: { apiKeyEnv: 'ACME_KEY', models: [{ id: 'old' }, { id: 'm1' }, 'odd', { id: 5 }, null] } } },
      user: { providers: { acme: { apiKeyEnv: 'ACME_KEY' } } },
      ...extra,
    })],
    keys: { ACME_KEY: { configured: true, writable: true } },
  })

  it('chooses models again, keeping the current ones ticked', async () => {
    const { n, remote } = configured()
    n.llm.discoverModels.mockResolvedValue({ ok: true, value: [{ id: 'm1' }, { id: 'm3' }] } as never)
    const { ui, log } = scriptedUi(['acme', 'models', ['m3']])
    await runProviders(remote, ui)
    expect(log[2]!.items!.map(item => item.value)).toEqual(['m1', 'm3', 'old'])
    expect(flat(log, 'info').at(-1)).toContain('Acme')
    const failing = configured()
    failing.n.llm.discoverModels.mockResolvedValue({ ok: false, error: { code: 'x', message: 'nope' } } as never)
    const second = scriptedUi(['acme', 'models'])
    await runProviders(failing.remote, second.ui)
    expect(flat(second.log, 'warn')[0]).toContain('nope')
    const none = configured()
    none.n.llm.discoverModels.mockResolvedValue({ ok: true, value: [] } as never)
    none.n.settings.mutate.mockClear()
    await runProviders(none.remote, scriptedUi(['acme', 'models', []]).ui)
    const refused = configured()
    refused.n.llm.discoverModels.mockResolvedValue({ ok: true, value: [{ id: 'm1' }] } as never)
    refused.n.settings.mutate.mockResolvedValue({ ok: false, error: { code: 'x', message: 'bad' } } as never)
    await runProviders(refused.remote, scriptedUi(['acme', 'models', ['m1']]).ui)
    const unreadable = configured()
    unreadable.n.credentials.describe.mockResolvedValue({ ok: false, error: { code: 'x', message: 'no keys' } } as never)
    const keyless = scriptedUi(['acme', undefined])
    await runProviders(unreadable.remote, keyless.ui)
    expect(flat(keyless.log, 'warn')[0]).toContain('no keys')
    const absent = rig({ namespaces: [ns({ value: { providers: { acme: { apiKeyEnv: 'K' } } } })], keys: {} })
    absent.n.llm.discoverModels.mockResolvedValue({ ok: true, value: [{ id: 'm1' }] } as never)
    await runProviders(absent.remote, scriptedUi(['acme', 'models', ['m1']]).ui)
    expect(absent.n.settings.mutate).toHaveBeenCalled()
  })

  it('replaces a key after the provider accepts it, or after the person insists', async () => {
    const accepted = configured()
    await runProviders(accepted.remote, scriptedUi(['acme', 'replace', 'sk-new']).ui)
    expect(accepted.n.credentials.set).toHaveBeenCalledWith('ACME_KEY', 'sk-new')
    for (const [answers, stored] of [[['acme', 'replace', undefined], false], [['acme', 'replace', ''], false], [['acme', 'replace', '  '], false]] as const) {
      const rejected = configured()
      await runProviders(rejected.remote, scriptedUi([...answers]).ui)
      expect(rejected.n.credentials.set).toHaveBeenCalledTimes(stored ? 1 : 0)
    }
    const bad = configured()
    bad.n.llm.discoverModels.mockResolvedValue({ ok: false, error: { code: 'x', message: 'm', details: { code: 'INVALID_CREDENTIAL' } } } as never)
    await runProviders(bad.remote, scriptedUi(['acme', 'replace', 'sk-new', 'no']).ui)
    expect(bad.n.credentials.set).not.toHaveBeenCalled()
    await runProviders(bad.remote, scriptedUi(['acme', 'replace', 'sk-new', 'yes']).ui)
    expect(bad.n.credentials.set).toHaveBeenCalledWith('ACME_KEY', 'sk-new')
    const unstored = configured()
    unstored.n.credentials.set.mockResolvedValue({ ok: false, error: { code: 'x', message: 'locked' } } as never)
    const { ui, log } = scriptedUi(['acme', 'replace', 'sk-new'])
    await runProviders(unstored.remote, ui)
    expect(flat(log, 'warn')[0]).toContain('locked')
  })

  it('removes a key and a provider only after confirmation', async () => {
    const keep = configured()
    await runProviders(keep.remote, scriptedUi(['acme', 'removeKey', 'no']).ui)
    expect(keep.n.credentials.unset).not.toHaveBeenCalled()
    const dropKey = configured()
    const first = scriptedUi(['acme', 'removeKey', 'yes'])
    await runProviders(dropKey.remote, first.ui)
    expect(dropKey.n.credentials.unset).toHaveBeenCalledWith('ACME_KEY')
    expect(flat(first.log, 'info')).toHaveLength(1)
    const failing = configured()
    failing.n.credentials.unset.mockRejectedValue(new Error('locked'))
    const second = scriptedUi(['acme', 'removeKey', 'yes'])
    await runProviders(failing.remote, second.ui)
    expect(flat(second.log, 'warn')[0]).toContain('locked')
    const keepProvider = configured()
    await runProviders(keepProvider.remote, scriptedUi(['acme', 'remove', 'no']).ui)
    expect(keepProvider.n.settings.mutate).not.toHaveBeenCalled()
    const drop = configured()
    const third = scriptedUi(['acme', 'remove', 'yes'])
    await runProviders(drop.remote, third.ui)
    expect(drop.n.settings.mutate).toHaveBeenCalledWith('llm-pi-ai', [{ op: 'unset', path: ['providers', 'acme'] }], 3)
    const refused = configured()
    refused.n.settings.mutate.mockResolvedValue({ ok: false, error: { code: 'x', message: 'bad' } } as never)
    await runProviders(refused.remote, scriptedUi(['acme', 'remove', 'yes']).ui)
    const left = scriptedUi(['acme', undefined])
    await runProviders(configured().remote, left.ui)
    expect(left.remaining()).toBe(0)
  })
})

describe('/providers custom provider', () => {
  const custom = (extra: Parameters<typeof rig>[0] = {}) => rig({ configurable: [listed('acme', 'Acme')], ...extra })

  it('refuses a route that is already declared, even when no provider list exists', async () => {
    const declared = custom({ namespaces: [ns({ value: { providers: { gw: {} } } })] })
    const first = scriptedUi([CUSTOM, '', 'gw', undefined])
    await runProviders(declared.remote, first.ui)
    expect(flat(first.log, 'warn')[0]).toContain('gw')
    const nothing = custom({ namespaces: [ns({ value: { providers: null } })] })
    const second = scriptedUi([CUSTOM, '', 'gw', undefined])
    await runProviders(nothing.remote, second.ui)
    expect(flat(second.log, 'warn')).toEqual([])
  })

  it('says so when the declaring namespace is missing', async () => {
    const { remote } = custom({ namespaces: [] })
    const { ui, log } = scriptedUi([CUSTOM])
    await runProviders(remote, ui)
    expect(flat(log, 'warn')).toHaveLength(1)
  })

  it('adds a local server from a template with models it lists', async () => {
    const { n, remote, session } = custom({ catalog: emptyCatalog })
    n.llm.discoverModels.mockResolvedValue({ ok: true, value: [{ id: 'llama' }] } as never)
    const { ui, log } = scriptedUi([CUSTOM, 'ollama', 'ollama', 'Ollama', 'http://localhost:11434/v1', 'openai-completions', '', ['llama']])
    await runProviders(remote, ui)
    const [, ops] = n.settings.mutate.mock.calls[0]!
    expect(ops[0]).toMatchObject({ op: 'set', path: ['providers', 'ollama'] })
    expect(n.credentials.set).not.toHaveBeenCalled()
    expect(session.setDefaultModel).toHaveBeenCalledWith({ provider: 'ollama', model: 'llama' })
    expect(flat(log, 'info').at(-1)).toContain('Ollama')
  })

  it('adds a hand-declared gateway with a key and typed models', async () => {
    const { n, remote } = custom()
    n.llm.discoverModels.mockResolvedValue({ ok: false, error: { code: 'x', message: 'no list' } } as never)
    const { ui, log } = scriptedUi([
      CUSTOM, '', 'Bad Route', 'acme', 'my-gw', '', 'ftp://x', 'http://example.com/v1', 'anthropic-messages', 'sk-gw', 'gpt-a',
    ])
    await runProviders(remote, ui)
    const warnings = flat(log, 'warn')
    expect(warnings.some(text => text.includes('acme'))).toBe(true)
    expect(n.llm.discoverModels).toHaveBeenCalledWith('llm-pi-ai', { baseURL: 'http://example.com/v1', api: 'anthropic-messages', apiKey: 'sk-gw' })
    expect(n.credentials.set).toHaveBeenCalledWith(expect.stringContaining('MY_GW'), 'sk-gw')
    expect(flat(log, 'info').some(text => text.includes('plain HTTP') || text.includes('cleartext') || text.includes('http'))).toBe(true)
  })

  it('stops at every question the person leaves', async () => {
    const steps = [
      [CUSTOM, undefined],
      [CUSTOM, '', undefined],
      [CUSTOM, '', 'gw', undefined],
      [CUSTOM, '', 'gw', 'Name', undefined],
      [CUSTOM, '', 'gw', 'Name', 'http://x/v1', undefined],
      [CUSTOM, '', 'gw', 'Name', 'http://x/v1', 'openai-completions', undefined],
      [CUSTOM, '', 'gw', 'Name', 'http://x/v1', 'openai-completions', 'bad\u0007' ],
      [CUSTOM, '', 'gw', 'Name', 'http://x/v1', 'openai-completions', '', undefined],
    ]
    for (const answers of steps) {
      const { n, remote } = custom()
      await runProviders(remote, scriptedUi(answers).ui)
      expect(n.settings.mutate).not.toHaveBeenCalled()
    }
  })

  it('does not save when the profile is refused or the key is not stored, and names the route when the name is empty', async () => {
    const refused = custom()
    refused.n.settings.mutate.mockResolvedValue({ ok: false, error: { code: 'x', message: 'bad' } } as never)
    await runProviders(refused.remote, scriptedUi([CUSTOM, '', 'gw', 'Name', 'http://x/v1', 'openai-completions', 'k', 'm']).ui)
    expect(refused.n.credentials.set).not.toHaveBeenCalled()
    const unstored = custom({ catalog: emptyCatalog })
    unstored.n.credentials.set.mockResolvedValue({ ok: false, error: { code: 'x', message: 'locked' } } as never)
    await runProviders(unstored.remote, scriptedUi([CUSTOM, '', 'gw', 'Name', 'http://x/v1', 'openai-completions', 'k', 'm']).ui)
    expect(unstored.session.setDefaultModel).not.toHaveBeenCalled()
    const noName = custom()
    const { ui, log } = scriptedUi([CUSTOM, '', 'gw', '', 'http://x/v1', 'openai-completions', '', 'm'])
    await runProviders(noName.remote, ui)
    expect(flat(log, 'info').at(-1)).toContain('gw')
  })

  it('uses the only protocol, or the preferred one, when the schema does not offer a choice', async () => {
    const single = { type: 'object', dict: { providers: { type: 'dict', inner: { type: 'object', dict: { api: { type: 'union', list: [{ type: 'const', value: 'only' }] } } } } } }
    const one = custom({ namespaces: [ns({ schema: single })] })
    await runProviders(one.remote, scriptedUi([CUSTOM, '', 'gw', 'N', 'http://x/v1', '', 'm']).ui)
    expect(one.n.settings.mutate.mock.calls[0]![1][0]).toMatchObject({ value: expect.objectContaining({ api: 'only' }) })
    const none = custom({ namespaces: [ns({ schema: { type: 'object', dict: {} } })] })
    await runProviders(none.remote, scriptedUi([CUSTOM, '', 'gw', 'N', 'http://x/v1', '', 'm']).ui)
    expect(none.n.settings.mutate.mock.calls[0]![1][0]).toMatchObject({ value: expect.objectContaining({ api: 'openai-completions' }) })
  })
})

void vi
