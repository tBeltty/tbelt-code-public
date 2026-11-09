/** The text choices of the one-shot runner: the Session `--resume` names and the model `--model` names. */

import { describe, expect, it } from 'vitest'
import { brandString } from '@deepseek-ai/dsh-brand'
import { ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import type { SessionId } from '@deepseek-ai/dsh-session'
import { resolveModel, resolveResume } from '../src/choose.ts'
import type { ModelRegistry } from '../src/choose.ts'

const id = (value: string): SessionId => brandString<SessionId>(value)

describe('resolveResume()', () => {
  const stored = [id('session-3f9a01'), id('session-3f9b02'), id('session-77aa10')].map(value => ({ id: value }))

  it('takes an exact id', () => {
    expect(resolveResume('session-77aa10', stored)).toBe('session-77aa10')
  })

  it('takes the start of an id with or without the session prefix', () => {
    expect(resolveResume('77a', stored)).toBe('session-77aa10')
    expect(resolveResume('session-77', stored)).toBe('session-77aa10')
  })

  it('names the candidates when the start is ambiguous', () => {
    expect(() => resolveResume('3f9', stored)).toThrow('"3f9" matches several sessions: session-3f9a01, session-3f9b02')
  })

  it('counts the candidates it does not list', () => {
    const many = Array.from({ length: 11 }, (_, index) => ({ id: id(`session-ab${String(index).padStart(2, '0')}`) }))
    expect(() => resolveResume('ab', many)).toThrow('session-ab07 and 3 more')
  })

  it('fails when no stored session starts with the text', () => {
    expect(() => resolveResume('zzz', stored)).toThrow('no stored session starts with "zzz"')
  })

  it('never opens a subagent session', () => {
    const rows = [{ id: id('session-child1'), origin: 'subagent' as const }, { id: id('session-main1') }]
    expect(() => resolveResume('child', rows)).toThrow('no stored session starts with "child"')
    expect(resolveResume('session-', rows)).toBe('session-main1')
  })
})

/** A registry over fixed catalogs; a provider mapped to an Error fails to list. */
function registry(catalog: Record<string, readonly string[] | Error>, effort?: string): ModelRegistry & { resolved: unknown[] } {
  const resolved: unknown[] = []
  return {
    resolved,
    listProviders: () => Object.keys(catalog).map(key => ({ id: key, name: key })),
    listModels: async (provider) => {
      const models = catalog[provider]
      if (models instanceof Error) throw models
      return (models ?? []).map(model => ({ provider, id: model, name: model }))
    },
    resolveCallConfig: async (config) => {
      resolved.push(config)
      return { ...config, ...effort === undefined ? {} : { reasoningEffort: ReasoningEffortId(effort) } }
    },
  }
}

describe('resolveModel()', () => {
  it('accepts provider/model without asking the other providers', async () => {
    const models = registry({ alpha: ['a1'], beta: new Error('offline') })
    await expect(resolveModel('alpha/a1', models)).resolves.toEqual({ provider: 'alpha', model: 'a1' })
    expect(models.resolved).toEqual([{ provider: 'alpha', model: 'a1' }])
  })

  it('accepts a bare model id that one provider offers', async () => {
    await expect(resolveModel('b1', registry({ alpha: ['a1'], beta: ['b1'] }))).resolves.toEqual({ provider: 'beta', model: 'b1' })
  })

  it('accepts a model id that contains a slash', async () => {
    const models = registry({ router: ['vendor/x1'] })
    await expect(resolveModel('vendor/x1', models)).resolves.toEqual({ provider: 'router', model: 'vendor/x1' })
    await expect(resolveModel('router/vendor/x1', models)).resolves.toEqual({ provider: 'router', model: 'vendor/x1' })
  })

  it('keeps the reasoning effort the adapter defaults to', async () => {
    await expect(resolveModel('alpha/a1', registry({ alpha: ['a1'] }, 'high')))
      .resolves.toEqual({ provider: 'alpha', model: 'a1', reasoningEffort: 'high' })
  })

  it('names the providers when a bare id is offered twice', async () => {
    await expect(resolveModel('m', registry({ alpha: ['m'], beta: ['m'] })))
      .rejects.toThrow('model "m" is offered by several providers: alpha/m, beta/m; name one as provider/model')
  })

  it('fails when no provider offers the model', async () => {
    await expect(resolveModel('nope', registry({ alpha: ['a1'] })))
      .rejects.toThrow('no provider offers model "nope"; name it as provider/model')
  })

  it('does not take a model the named provider lacks', async () => {
    await expect(resolveModel('alpha/zz', registry({ alpha: ['a1'] }))).rejects.toThrow('no provider offers model "alpha/zz"')
  })

  it('says which providers could not be listed', async () => {
    await expect(resolveModel('nope', registry({ alpha: new Error('offline'), beta: ['b1'] })))
      .rejects.toThrow('could not list alpha (offline)')
    await expect(resolveModel('alpha/a1', registry({ alpha: new Error('offline') })))
      .rejects.toThrow(/could not list alpha \(offline\)$/)
  })

  it('reports a listing failure that is not an Error', async () => {
    const models = registry({ alpha: ['a1'] })
    models.listModels = () => Promise.reject('refused')
    await expect(resolveModel('a1', models)).rejects.toThrow('could not list alpha (refused)')
  })

  it('lets the registry refuse the route', async () => {
    const models = registry({ alpha: ['a1'] })
    models.resolveCallConfig = () => Promise.reject(new Error('unsupported'))
    await expect(resolveModel('alpha/a1', models)).rejects.toThrow('unsupported')
  })
})
