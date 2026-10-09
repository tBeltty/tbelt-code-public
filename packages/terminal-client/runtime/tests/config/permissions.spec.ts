import { describe, expect, it, vi } from 'vitest'
import { runPermissions } from '../../src/config/permissions.ts'
import type { RemotePort } from '../../src/ports.ts'
import { fakeNamespaces, scriptedUi } from '../fakes.ts'

const options = [
  { value: 'default', name: 'Default', description: 'Ask first' },
  { value: 'read-only', name: 'Read only' },
  { value: 'danger-full-access', name: 'Full access' },
]

function rig(settings: object[] = [{ ns: 'permission', schema: {}, value: {}, secrets: [], revision: 4 }]) {
  const n = fakeNamespaces()
  n.permissionPresets.catalog.mockResolvedValue({ ok: true, value: { options, defaultOptions: options.slice(0, 2), defaultPreset: 'default' } })
  n.settings.describe.mockResolvedValue({ ok: true, value: { writable: true, namespaces: settings as never } })
  const command = vi.fn((_line: string) => Promise.resolve({ ok: true as const, value: { matched: true } }))
  return { n, command, remote: { ...n, session: {}, $on: () => () => {} } as unknown as RemotePort }
}
const texts = (log: { kind: string; text: string }[], kind: string) => log.filter(entry => entry.kind === kind).map(entry => entry.text)

describe('permissions', () => {
  it('stops when the catalog cannot be read or nothing is chosen', async () => {
    const failing = rig()
    failing.n.permissionPresets.catalog.mockResolvedValue({ ok: false, error: { code: 'x', message: 'down' } } as never)
    const a = scriptedUi([])
    await runPermissions(failing.remote, a.ui, failing.command)
    expect(texts(a.log, 'warn')[0]).toContain('down')
    const { remote, command } = rig()
    await runPermissions(remote, scriptedUi([undefined]).ui, command)
    expect(command).not.toHaveBeenCalled()
  })

  it('switches this session only', async () => {
    const { remote, command, n } = rig()
    const { ui, log } = scriptedUi(['read-only', 'session'])
    await runPermissions(remote, ui, command)
    expect(command).toHaveBeenCalledWith('/permission read-only')
    expect(n.settings.mutate).not.toHaveBeenCalled()
    expect(texts(log, 'info')).toHaveLength(1)
  })

  it('also saves the default for new sessions', async () => {
    const { remote, command, n } = rig()
    const { ui, log } = scriptedUi(['read-only', 'both'])
    await runPermissions(remote, ui, command)
    expect(n.settings.mutate).toHaveBeenCalledWith('permission', [{ op: 'set', path: ['defaultPreset'], value: 'read-only' }], 4)
    expect(texts(log, 'info')).toHaveLength(2)
    const refused = rig()
    refused.n.settings.mutate.mockResolvedValue({ ok: false, error: { code: 'x', message: 'bad' } } as never)
    const second = scriptedUi(['read-only', 'both'])
    await runPermissions(refused.remote, second.ui, refused.command)
    expect(texts(second.log, 'info')).toHaveLength(1)
    const missing = rig([])
    await runPermissions(missing.remote, scriptedUi(['read-only', 'both']).ui, missing.command)
    expect(missing.n.settings.mutate).not.toHaveBeenCalled()
    const unreadable = rig()
    unreadable.n.settings.describe.mockResolvedValue({ ok: false, error: { code: 'x', message: 'no' } } as never)
    await runPermissions(unreadable.remote, scriptedUi(['read-only', 'both']).ui, unreadable.command)
    expect(unreadable.n.settings.mutate).not.toHaveBeenCalled()
  })

  it('leaves the scope question and treats a preset that cannot be the default as session-only', async () => {
    const { remote, command } = rig()
    await runPermissions(remote, scriptedUi(['read-only', undefined]).ui, command)
    expect(command).not.toHaveBeenCalled()
    const full = scriptedUi(['danger-full-access', 'yes'])
    await runPermissions(remote, full.ui, command)
    expect(full.log.some(entry => entry.kind === 'pick' && entry.items?.length === 2 && entry.text === 'Full access')).toBe(false)
    expect(command).toHaveBeenCalledWith('/permission danger-full-access')
  })

  it('asks before full access and reports commands that fail or do not exist', async () => {
    const { remote, command } = rig()
    await runPermissions(remote, scriptedUi(['danger-full-access', 'no']).ui, command)
    expect(command).not.toHaveBeenCalled()
    command.mockResolvedValue({ ok: true, value: { matched: false } })
    const none = scriptedUi(['read-only', 'session'])
    await runPermissions(remote, none.ui, command)
    expect(texts(none.log, 'warn')).toHaveLength(1)
    command.mockResolvedValue({ ok: false, error: { code: 'x', message: 'busy' } } as never)
    const busy = scriptedUi(['read-only', 'session'])
    await runPermissions(remote, busy.ui, command)
    expect(texts(busy.log, 'warn')[0]).toContain('busy')
  })
})
