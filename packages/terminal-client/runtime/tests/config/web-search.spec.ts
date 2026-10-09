import { describe, expect, it } from 'vitest'
import { runWebSearch } from '../../src/config/web-search.ts'
import type { RemotePort } from '../../src/ports.ts'
import { fakeNamespaces, scriptedUi } from '../fakes.ts'

const AUTO = '\u0000automatic'
const webNs = (value: unknown = {}) => ({ ns: 'web', schema: {}, value, secrets: [], revision: 7 })

function rig(options: {
  writable?: boolean
  namespaces?: object[]
  keys?: Record<string, { configured: boolean; writable: boolean }>
  value?: unknown
} = {}) {
  const n = fakeNamespaces()
  n.web.searchProviders.mockResolvedValue({ ok: true, value: [{ id: 'brave', credentialRef: 'BRAVE' }, { id: 'tavily', credentialRef: 'TAVILY' }] })
  n.settings.describe.mockResolvedValue({
    ok: true,
    value: { writable: options.writable ?? true, namespaces: (options.namespaces ?? [webNs(options.value)]) as never },
  })
  n.credentials.describe.mockResolvedValue({ ok: true, value: options.keys ?? {} })
  return { n, remote: { ...n, session: {}, $on: () => () => {} } as unknown as RemotePort }
}
const warns = (log: { kind: string; text: string }[]) => log.filter(entry => entry.kind === 'warn').map(entry => entry.text)

describe('/web-search', () => {
  it('stops when a read fails or the namespace is missing', async () => {
    const failing = rig()
    failing.n.web.searchProviders.mockResolvedValue({ ok: false, error: { code: 'x', message: 'down' } } as never)
    const a = scriptedUi([])
    await runWebSearch(failing.remote, a.ui)
    expect(warns(a.log)[0]).toContain('down')
    const missing = scriptedUi([])
    await runWebSearch(rig({ namespaces: [] }).remote, missing.ui)
    expect(warns(missing.log)).toHaveLength(1)
    const unreadable = rig()
    unreadable.n.credentials.describe.mockResolvedValue({ ok: false, error: { code: 'x', message: 'no keys' } } as never)
    const b = scriptedUi([])
    await runWebSearch(unreadable.remote, b.ui)
    expect(warns(b.log)[0]).toContain('no keys')
  })

  it('lists automatic first and marks the pinned provider', async () => {
    const { remote } = rig({ value: { searchProvider: 'tavily' }, keys: { BRAVE: { configured: true, writable: true } } })
    const { ui, log } = scriptedUi([undefined])
    await runWebSearch(remote, ui)
    const items = log[0]!.items!
    expect(items.map(item => item.value)).toEqual([AUTO, 'brave', 'tavily'])
    expect(items.map(item => item.current)).toEqual([false, false, true])
  })

  it('works without providers and with a read-only namespace', async () => {
    const none = rig()
    none.n.web.searchProviders.mockResolvedValue({ ok: true, value: [] })
    await runWebSearch(none.remote, scriptedUi([AUTO]).ui)
    expect(none.n.credentials.describe).not.toHaveBeenCalled()
    expect(none.n.settings.mutate).toHaveBeenCalledWith('web', [{ op: 'unset', path: ['searchProvider'] }], 7)
    const readOnly = rig({ writable: false })
    const { ui, log } = scriptedUi(['brave'])
    await runWebSearch(readOnly.remote, ui)
    expect(warns(log)).toHaveLength(1)
    const bare = rig({ namespaces: [{ ns: 'web', schema: {}, secrets: [], revision: 1 }] })
    await runWebSearch(bare.remote, scriptedUi([undefined]).ui)
  })

  it('pins a provider whose key is already stored, without asking', async () => {
    const { n, remote } = rig({ keys: { BRAVE: { configured: true, writable: true } } })
    await runWebSearch(remote, scriptedUi(['brave', 'no']).ui)
    expect(n.credentials.set).not.toHaveBeenCalled()
    expect(n.settings.mutate).toHaveBeenCalledWith('web', [{ op: 'set', path: ['searchProvider'], value: 'brave' }], 7)
  })

  it('checks and stores a key for a provider with none, and saves the choice after it', async () => {
    const { n, remote } = rig()
    const { ui, log } = scriptedUi(['tavily', 'tv-key'])
    await runWebSearch(remote, ui)
    expect(n.web.checkSearchKey).toHaveBeenCalledWith('tavily', 'tv-key')
    expect(n.credentials.set).toHaveBeenCalledWith('TAVILY', 'tv-key')
    expect(n.settings.mutate).toHaveBeenCalled()
    expect(log.map(entry => entry.text).join('\n')).not.toContain('tv-key')
  })

  it('replaces a stored key when the person agrees', async () => {
    const { n, remote } = rig({ keys: { BRAVE: { configured: true, writable: true } } })
    await runWebSearch(remote, scriptedUi(['brave', 'yes', 'new-key']).ui)
    expect(n.credentials.set).toHaveBeenCalledWith('BRAVE', 'new-key')
  })

  it('does not save the choice when a missing key was not stored', async () => {
    for (const answer of [undefined, '', 'bad\u0007', '   ']) {
      const { n, remote } = rig()
      await runWebSearch(remote, scriptedUi(['brave', answer]).ui)
      expect(n.settings.mutate).not.toHaveBeenCalled()
    }
    const rejected = rig()
    rejected.n.web.checkSearchKey.mockResolvedValue({ ok: true, value: { ok: false, reason: 'auth', message: 'bad key' } } as never)
    rejected.n.web.checkSearchKey.mockResolvedValue({ ok: false, error: { code: 'x', message: 'offline' } } as never)
    await runWebSearch(rejected.remote, scriptedUi(['brave', 'k']).ui)
    expect(rejected.n.settings.mutate).not.toHaveBeenCalled()
    const refused = rig()
    refused.n.web.checkSearchKey.mockResolvedValue({ ok: true, value: { ok: false, reason: 'auth', message: 'bad key' } } as never)
    const { ui, log } = scriptedUi(['brave', 'k'])
    await runWebSearch(refused.remote, ui)
    expect(warns(log)).toContain('bad key')
    expect(refused.n.settings.mutate).not.toHaveBeenCalled()
  })

  it('stores a key with no credit left, with the Host note, and keeps an old key when a replacement fails', async () => {
    const quota = rig()
    quota.n.web.checkSearchKey.mockResolvedValue({ ok: true, value: { ok: false, reason: 'quota', message: 'no credit' } } as never)
    const { ui, log } = scriptedUi(['brave', 'k'])
    await runWebSearch(quota.remote, ui)
    expect(warns(log)).toContain('no credit')
    expect(quota.n.credentials.set).toHaveBeenCalled()
    const keep = rig({ keys: { BRAVE: { configured: true, writable: true } } })
    await runWebSearch(keep.remote, scriptedUi(['brave', 'yes', undefined]).ui)
    expect(keep.n.settings.mutate).toHaveBeenCalled()
    const unstored = rig()
    unstored.n.credentials.set.mockResolvedValue({ ok: false, error: { code: 'x', message: 'locked' } } as never)
    await runWebSearch(unstored.remote, scriptedUi(['brave', 'k']).ui)
    expect(unstored.n.settings.mutate).not.toHaveBeenCalled()
    const refused = rig()
    refused.n.settings.mutate.mockResolvedValue({ ok: false, error: { code: 'x', message: 'bad' } } as never)
    const second = scriptedUi([AUTO])
    await runWebSearch(refused.remote, second.ui)
    expect(second.log.filter(entry => entry.kind === 'info')).toEqual([])
  })
})
