import { describe, expect, it } from 'vitest'
import {
  cleartextRemote, customProfile, isHttpUrl, modelEntry, profileOps, ROUTE_PATTERN, setupOps,
} from '../src/index.ts'

describe('modelEntry', () => {
  it('carries only what the provider disclosed', () => {
    expect(modelEntry({ id: 'm1' })).toEqual({ id: 'm1' })
    expect(modelEntry({
      id: 'm2', name: 'Model Two', contextWindow: 1000, maxTokens: 100, inputModalities: ['text', 'image'], pricing: { input: 1, output: 2 },
    })).toEqual({
      id: 'm2', name: 'Model Two', contextWindow: 1000, maxTokens: 100, input: ['text', 'image'], pricing: { input: 1, output: 2 },
    })
  })
})

describe('profileOps', () => {
  it('sets changed fields, skips equal ones and unsets removed ones', () => {
    expect(profileOps(['providers', 'openai'], { baseURL: 'https://old', reasoning: 'high' }, { reasoning: 'high' }))
      .toEqual([{ op: 'unset', path: ['providers', 'openai', 'baseURL'] }])
    expect(profileOps(['p'], { a: 1 }, { a: 2, b: [1] })).toEqual([
      { op: 'set', path: ['p', 'a'], value: 2 }, { op: 'set', path: ['p', 'b'], value: [1] },
    ])
  })

  it('treats a missing or non-object profile as empty', () => {
    expect(profileOps(['p'], undefined, { a: 1 })).toEqual([{ op: 'set', path: ['p', 'a'], value: 1 }])
    expect(profileOps(['p'], [1], { a: 1 })).toEqual([{ op: 'set', path: ['p', 'a'], value: 1 }])
    expect(profileOps(['p'], null, {})).toEqual([])
  })
})

describe('setupOps', () => {
  const models = [{ id: 'm1', name: 'One' }]

  it('stores the whole profile when the user layer has none', () => {
    expect(setupOps(['providers', 'acme'], undefined, 'ACME_API_KEY', models)).toEqual([
      { op: 'set', path: ['providers', 'acme'], value: { apiKeyEnv: 'ACME_API_KEY', models: [{ id: 'm1', name: 'One' }] } },
    ])
    expect(setupOps(['providers', 'acme'], [], 'K', models)).toHaveLength(1)
    expect(setupOps(['providers', 'acme'], undefined, undefined, models)).toEqual([
      { op: 'set', path: ['providers', 'acme'], value: { models: [{ id: 'm1', name: 'One' }] } },
    ])
  })

  it('edits the stored fields when the user layer has a profile', () => {
    expect(setupOps(['providers', 'acme'], { baseURL: 'https://x', apiKeyEnv: 'K' }, 'K', models)).toEqual([
      { op: 'set', path: ['providers', 'acme', 'models'], value: [{ id: 'm1', name: 'One' }] },
    ])
  })
})

describe('customProfile', () => {
  const base = { route: 'acme', displayName: '', baseURL: 'https://acme.test/v1', api: 'openai-completions', models: [{ id: 'm1' }] }

  it('names the display name and key reference only when given', () => {
    expect(customProfile(base)).toEqual({ api: 'openai-completions', baseURL: 'https://acme.test/v1', models: [{ id: 'm1' }] })
    expect(customProfile({ ...base, displayName: 'Acme', keyRef: 'ACME_API_KEY' })).toEqual({
      displayName: 'Acme', apiKeyEnv: 'ACME_API_KEY', api: 'openai-completions', baseURL: 'https://acme.test/v1', models: [{ id: 'm1' }],
    })
  })
})

describe('route and URL rules', () => {
  it('accepts lower-case route ids that can stem a credential reference', () => {
    for (const id of ['acme', 'acme-gateway', 'a1', 'minimax-cn']) expect(ROUTE_PATTERN.test(id), id).toBe(true)
    for (const id of ['', '1acme', 'Acme', 'acme_x', 'acme-', '-acme', 'acme--x']) expect(ROUTE_PATTERN.test(id), id).toBe(false)
  })

  it('accepts only absolute http and https URLs', () => {
    expect(isHttpUrl('https://a.test/v1')).toBe(true)
    expect(isHttpUrl('http://localhost:11434/v1')).toBe(true)
    expect(isHttpUrl('ftp://a.test')).toBe(false)
    expect(isHttpUrl('a.test/v1')).toBe(false)
  })

  it('flags plain HTTP to another machine only', () => {
    expect(cleartextRemote('http://192.168.1.4:8000/v1')).toBe(true)
    expect(cleartextRemote('http://localhost:11434/v1')).toBe(false)
    expect(cleartextRemote('http://127.0.0.1:1234')).toBe(false)
    expect(cleartextRemote('http://app.localhost/v1')).toBe(false)
    expect(cleartextRemote('https://api.example.com/v1')).toBe(false)
  })
})
