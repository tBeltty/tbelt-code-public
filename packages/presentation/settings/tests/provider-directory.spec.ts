import { describe, expect, it } from 'vitest'
import { deriveKeyRef, joinProviderDirectory, providerKeyRef } from '../src/index.ts'

describe('joinProviderDirectory', () => {
  const directory = [
    { provider: 'anthropic', displayName: 'Anthropic', settingsNs: 'llm-pi-ai', settingsPath: ['providers', 'anthropic'] },
    { provider: 'deepseek-official', displayName: 'DeepSeek', settingsNs: 'llm-deepseek', settingsPath: [], declared: false },
    { provider: 'broken', displayName: 'Broken', settingsNs: 'llm-pi-ai', settingsPath: ['providers', 'broken'], error: 'bad base URL' },
  ]

  it('marks configurable providers active when their route is live and keeps the Host diagnostics', () => {
    const rows = joinProviderDirectory([{ id: 'anthropic', name: 'Anthropic' }], directory)
    expect(rows.map(row => [row.provider, row.active])).toEqual([
      ['deepseek-official', false], ['anthropic', true], ['broken', false],
    ])
    expect(rows.find(row => row.provider === 'deepseek-official')).toMatchObject({ declared: false })
    expect(rows.find(row => row.provider === 'broken')).toMatchObject({ error: 'bad base URL' })
    expect(rows.find(row => row.provider === 'anthropic')).not.toHaveProperty('error')
  })

  it('adds a live route that no adapter declares as configurable, without a settings address', () => {
    const rows = joinProviderDirectory([{ id: 'custom', name: 'Custom' }], [])
    expect(rows).toEqual([{ provider: 'custom', displayName: 'Custom', settingsNs: '', settingsPath: [], active: true }])
  })

  it('places the account route before the official route and both before the rest', () => {
    const rows = joinProviderDirectory([], [
      { provider: 'zed', displayName: 'Zed', settingsNs: 'n', settingsPath: [] },
      { provider: 'deepseek-official', displayName: 'Official', settingsNs: 'n', settingsPath: [] },
      { provider: 'deepseek-account', displayName: 'Account', settingsNs: 'n', settingsPath: [] },
    ])
    expect(rows.map(row => row.provider)).toEqual(['deepseek-account', 'deepseek-official', 'zed'])
  })
})

describe('credential references', () => {
  it('derives an upper-case reference from a route id', () => {
    expect(deriveKeyRef('anthropic')).toBe('ANTHROPIC_API_KEY')
    expect(deriveKeyRef('minimax-cn')).toBe('MINIMAX_CN_API_KEY')
  })

  it('uses the reference a profile names and derives one otherwise', () => {
    expect(providerKeyRef({ apiKeyEnv: 'MY_KEY' }, 'acme')).toBe('MY_KEY')
    expect(providerKeyRef({ apiKeyEnv: '' }, 'acme')).toBe('ACME_API_KEY')
    expect(providerKeyRef({ apiKeyEnv: 3 }, 'acme')).toBe('ACME_API_KEY')
    expect(providerKeyRef({}, 'acme')).toBe('ACME_API_KEY')
    expect(providerKeyRef(undefined, 'acme')).toBe('ACME_API_KEY')
    expect(providerKeyRef(null, 'acme')).toBe('ACME_API_KEY')
  })
})
