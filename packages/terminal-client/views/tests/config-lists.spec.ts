import { describe, expect, it } from 'vitest'
import { keyProblemText } from '../src/credentials.ts'
import { permissionItems } from '../src/permission.ts'
import { bundleItems, PLUGIN_INSTALL, PLUGIN_SINGLE, pluginItems } from '../src/plugins.ts'
import { presetItems } from '../src/presets.ts'
import { CUSTOM_PROVIDER, providerItems } from '../src/providers.ts'
import { namespaceItems, SETTINGS_DOCUMENT, settingItems, shownValue, WEB_SEARCH_AUTOMATIC, webSearchItems } from '../src/settings.ts'
import type { ProviderListRow } from '../src/providers.ts'

describe('provider list', () => {
  const row = (provider: string, extra: Partial<ProviderListRow> = {}): ProviderListRow => ({
    provider, displayName: provider, active: false, configured: false, needsKey: true, keyConfigured: false, ...extra,
  })

  it('puts the add row first, then working providers, then the rest, each described', () => {
    const items = providerItems([
      row('a'),
      row('b', { configured: true }),
      row('c', { active: true, keyConfigured: true }),
      row('d', { active: true, needsKey: false }),
      row('e', { error: 'bad' }),
    ])
    expect(items.map(item => item.value)).toEqual([CUSTOM_PROVIDER, 'c', 'd', 'a', 'b', 'e'])
    expect(items.map(item => item.detail)).toEqual([
      expect.any(String), 'ready', 'ready, no key needed', 'not set up', 'needs an API key', 'problem: bad',
    ])
    expect(items.map(item => item.current)).toEqual([undefined, true, true, false, false, false])
  })
})

describe('key problems', () => {
  it('names an empty key and any other fault', () => {
    expect(keyProblemText('keyBlank')).toContain('empty')
    expect(keyProblemText('keyIllegalCharacters')).toContain('characters')
  })
})

describe('settings lists', () => {
  it('shows a value as JSON cut to the row width, or says none is set', () => {
    expect(shownValue(undefined)).toBe('not set')
    expect(shownValue('x')).toBe('"x"')
    expect(shownValue(12)).toBe('12')
    expect(shownValue({ list: 'a'.repeat(80) }).length).toBeLessThanOrEqual(40)
  })

  it('lists automatic first and marks the pinned web search provider', () => {
    const rows = [{ id: 'brave', keyConfigured: true }, { id: 'tavily', keyConfigured: false }]
    const pinned = webSearchItems(rows, 'tavily')
    expect(pinned.map(item => item.value)).toEqual([WEB_SEARCH_AUTOMATIC, 'brave', 'tavily'])
    expect(pinned.map(item => item.current)).toEqual([false, false, true])
    expect(pinned.map(item => item.detail)).toEqual([expect.any(String), 'key stored', 'no key'])
    expect(webSearchItems(rows, undefined)[0]!.current).toBe(true)
  })

  it('shows each value, or whether a secret is stored without reading it', () => {
    const items = settingItems([
      { name: 'maxSteps', secret: false, secretSet: false, value: 8, description: 'Steps' },
      { name: 'label', secret: false, secretSet: false, value: undefined, description: undefined },
      { name: 'apiKey', secret: true, secretSet: true, value: 'sk-never-shown', description: undefined },
      { name: 'other', secret: true, secretSet: false, value: undefined, description: undefined },
    ])
    expect(items.map(item => item.detail)).toEqual(['8 · Steps', 'not set', 'a key is stored', 'no key stored'])
    expect(JSON.stringify(items)).not.toContain('sk-never-shown')
  })

  it('lists the settings file first and only the namespaces that have values', () => {
    const items = namespaceItems([{ ns: 'a', count: 3 }, { ns: 'b', count: 0 }])
    expect(items.map(item => item.value)).toEqual([SETTINGS_DOCUMENT, 'a'])
    expect(items[1]!.detail).toBe('3 values')
  })
})

describe('plugin lists', () => {
  it('describes bundles between the install row and the single plugins row', () => {
    const items = bundleItems([
      { name: 'a', enabled: false, installed: false, optional: false },
      { name: 'b', enabled: true, installed: true, optional: true, version: '1.0.0' },
      { name: 'c', enabled: true, installed: true, optional: false, error: { code: 'bad' } },
    ])
    expect(items.map(item => item.value)).toEqual([PLUGIN_INSTALL, 'a', 'b', 'c', PLUGIN_SINGLE])
    expect(items[1]!.detail).toBe('off · supplied by dsh')
    expect(items[2]!.detail).toBe('on · 1.0.0 · installed · optional')
    expect(items[3]!.detail).toBe('problem: bad')
  })

  it('describes single plugins and marks fixed ones', () => {
    const items = pluginItems([{ entryId: 'e1', moduleName: 'mod-a', enabled: true }, { entryId: 'e2', moduleName: 'mod-b', enabled: false, readOnlyReason: 'profile' }])
    expect(items.map(item => item.detail)).toEqual(['on', 'off · fixed'])
    expect(items.map(item => item.current)).toEqual([true, false])
  })
})

describe('preset lists', () => {
  it('describes each agent preset, marking the default and the broken ones', () => {
    const items = presetItems([
      { id: 'build', name: 'Builder', description: 'Writes code', isDefault: true },
      { id: 'plain', isDefault: false },
      { id: 'bad', isDefault: false, broken: 'missing model' },
    ])
    expect(items.map(item => item.label)).toEqual(['Builder', 'plain', 'bad'])
    expect(items[0]).toMatchObject({ detail: 'build · Writes code', current: true })
    expect(items[1]!.detail).toBe('plain')
    expect(items[2]!.detail).toContain('missing model')
  })

  it('marks the default permission preset', () => {
    const options = [{ value: 'default', name: 'Default', description: 'Ask first' }, { value: 'read-only', name: 'Read only' }]
    expect(permissionItems(options, 'read-only').map(item => item.current)).toEqual([false, true])
    expect(permissionItems(options, 'read-only')[0]!.detail).toBe('Ask first')
  })
})
