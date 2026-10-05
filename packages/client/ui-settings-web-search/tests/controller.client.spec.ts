import { describe, expect, it, vi } from 'vitest'
import type { SettingsPathOpView } from '@deepseek-ai/dsh-api-remotes/client'
import { RemoteError, stubConfigForm, type StubConfigForm } from '@deepseek-ai/dsh-client-test-runtime'
import { WebSearchCardController, type WebSearchSettings } from '../src/client/web-search-card-controller.ts'

/** Make the stub behave like a Host that accepts every write. */
function acceptWrites(host: StubConfigForm<WebSearchSettings>): void {
  host.mutate.mockImplementation((ops: readonly SettingsPathOpView[]) => {
    const value: Record<string, unknown> = { ...host.scope.getSnapshot().value }
    for (const op of ops) {
      const field = op.path[0]!
      if (op.op === 'set') value[field] = op.value
      else Reflect.deleteProperty(value, field)
    }
    host.publish({ value, user: value })
    return Promise.resolve(true)
  })
}

const PROVIDERS = [
  { id: 'exa', credentialRef: 'EXA_API_KEY' },
  { id: 'brave', credentialRef: 'BRAVE_API_KEY' },
]

type KeyCheck = { ok: true } | { ok: false; reason: 'auth' | 'quota' | 'error'; message: string }

/** The page plugin's context, scripted down to the Remote namespaces the page reaches. */
function bench(options: { configured?: string[]; check?: KeyCheck } = {}) {
  const stored = new Set(options.configured ?? [])
  const describe = vi.fn((refs: string[]) => Promise.resolve({
    ok: true as const,
    value: Object.fromEntries(refs.map(ref => [ref, { configured: stored.has(ref), writable: true }])),
  }))
  const set = vi.fn((ref: string) => {
    stored.add(ref)
    return Promise.resolve({ ok: true as const, value: undefined })
  })
  const searchProviders = vi.fn(() => Promise.resolve({ ok: true as const, value: PROVIDERS }))
  const checkSearchKey = vi.fn(() => Promise.resolve({ ok: true as const, value: options.check ?? { ok: true } }))
  const host = stubConfigForm<WebSearchSettings>()
  acceptWrites(host)
  const ctx = { remote: { credentials: { describe, set }, web: { searchProviders, checkSearchKey } } } as never
  const controller = new WebSearchCardController(host.scope, ctx)
  host.publish({ status: 'ready', writable: true, value: {}, base: {}, user: {} })
  const face = controller.inject()
  const state = () => face.hooks.webSearchCard.getSnapshot()
  return { host, controller, face, state, describe, set, checkSearchKey, searchProviders }
}

describe('WebSearchCardController', () => {
  it('lists the Host providers with whether each has a key', async () => {
    const { state } = bench({ configured: ['BRAVE_API_KEY'] })
    await vi.waitFor(() => {
      expect(state().providers).toEqual([
        { id: 'exa', credentialRef: 'EXA_API_KEY', configured: false, writable: true },
        { id: 'brave', credentialRef: 'BRAVE_API_KEY', configured: true, writable: true },
      ])
    })
  })

  it('checks a staged key with the Host before writing the choice and the key', async () => {
    const { face, state, host, set, checkSearchKey } = bench()
    await vi.waitFor(() => { expect(state().providers).toHaveLength(2) })

    face.edit('searchProvider', 'brave')
    face.edit('apiKey', ' brave-secret ')
    face.save()
    await vi.waitFor(() => { expect(set).toHaveBeenCalled() })

    expect(checkSearchKey).toHaveBeenCalledWith('brave', 'brave-secret')
    expect(host.mutate.mock.calls[0]![0]).toEqual([{ op: 'set', path: ['searchProvider'], value: 'brave' }])
    expect(set).toHaveBeenCalledWith('BRAVE_API_KEY', 'brave-secret')
    await vi.waitFor(() => { expect(state()).toMatchObject({ dirty: false, keyStatus: { kind: 'idle' } }) })
  })

  it('stores nothing when the provider rejects the key, and says why', async () => {
    const { face, state, host, set } = bench({ check: { ok: false, reason: 'auth', message: 'Brave Search rejected the API key (HTTP 401).' } })
    await vi.waitFor(() => { expect(state().providers).toHaveLength(2) })

    face.edit('searchProvider', 'brave')
    face.edit('apiKey', 'wrong')
    face.save()

    await vi.waitFor(() => {
      expect(state().keyStatus).toEqual({ kind: 'auth', message: 'Brave Search rejected the API key (HTTP 401).' })
    })
    expect(host.mutate).not.toHaveBeenCalled()
    expect(set).not.toHaveBeenCalled()
    expect(state().dirty).toBe(true)
  })

  it('saves a key accepted with no quota left and reports the quota', async () => {
    const { face, state, set } = bench({ check: { ok: false, reason: 'quota', message: 'plan limit' } })
    await vi.waitFor(() => { expect(state().providers).toHaveLength(2) })

    face.edit('searchProvider', 'exa')
    face.edit('apiKey', 'exa-secret')
    face.save()

    await vi.waitFor(() => { expect(set).toHaveBeenCalledWith('EXA_API_KEY', 'exa-secret') })
    expect(state().keyStatus).toEqual({ kind: 'quota', message: 'plan limit' })
  })

  it('refuses to pin a provider that has no key', async () => {
    const { controller, face, state, host } = bench()
    await vi.waitFor(() => { expect(state().providers).toHaveLength(2) })

    face.edit('searchProvider', 'exa')
    await controller.save()

    expect(state().keyStatus).toEqual({ kind: 'missing' })
    expect(host.mutate).not.toHaveBeenCalled()
  })

  it('pins a provider whose key is already stored without asking for it again', async () => {
    const { face, state, host, checkSearchKey } = bench({ configured: ['EXA_API_KEY'] })
    await vi.waitFor(() => { expect(state().providers[0]?.configured).toBe(true) })

    face.edit('searchProvider', 'exa')
    face.save()

    await vi.waitFor(() => { expect(host.mutate).toHaveBeenCalled() })
    expect(checkSearchKey).not.toHaveBeenCalled()
  })

  it('drops a key typed for one provider when another is chosen', async () => {
    const { face, state } = bench()
    await vi.waitFor(() => { expect(state().providers).toHaveLength(2) })

    face.edit('searchProvider', 'exa')
    face.edit('apiKey', 'exa-secret')
    face.edit('searchProvider', 'brave')

    expect(state().apiKey.text).toBe('')
  })

  it('re-reads key states when the Host reports a provider reference changed, and ignores another', async () => {
    const { controller, state, describe } = bench()
    await vi.waitFor(() => { expect(state().providers).toHaveLength(2) })
    describe.mockClear()

    controller.refreshCredential('OTHER_KEY')
    expect(describe).not.toHaveBeenCalled()

    controller.refreshCredential('EXA_API_KEY')
    await vi.waitFor(() => { expect(describe).toHaveBeenCalledTimes(1) })
  })

  it('reports a failed check transport as an error, storing nothing', async () => {
    const { face, state, set, checkSearchKey } = bench()
    checkSearchKey.mockImplementation(() => Promise.resolve({
      ok: false as const, error: new RemoteError('gateway/internal', 'offline', {}),
    }) as never)
    await vi.waitFor(() => { expect(state().providers).toHaveLength(2) })

    face.edit('searchProvider', 'exa')
    face.edit('apiKey', 'exa-secret')
    face.save()

    await vi.waitFor(() => { expect(state().keyStatus).toEqual({ kind: 'error', message: 'offline' }) })
    expect(set).not.toHaveBeenCalled()
  })

  it('shows no providers when the Host refuses the list', async () => {
    const host = stubConfigForm<WebSearchSettings>()
    const refused = vi.fn(() => Promise.resolve({ ok: false as const, error: new RemoteError('gateway/internal', 'no web', {}) }))
    const controller = new WebSearchCardController(host.scope, { remote: { web: { searchProviders: refused }, credentials: {} } } as never)
    await vi.waitFor(() => { expect(refused).toHaveBeenCalled() })
    expect(controller.inject().hooks.webSearchCard.getSnapshot().providers).toEqual([])
  })
})
