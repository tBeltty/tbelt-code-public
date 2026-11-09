import { describe, expect, it } from 'vitest'
import { runPlugins } from '../../src/config/plugins.ts'
import type { BundlePort } from '../../src/ports.ts'
import type { RemotePort } from '../../src/ports.ts'
import { PLUGIN_INSTALL, PLUGIN_SINGLE } from '@deepseek-ai/dsh-terminal-views'
import { fakeNamespaces, scriptedUi } from '../fakes.ts'

const INSTALL = PLUGIN_INSTALL
const PLUGINS = PLUGIN_SINGLE
const bundle = (name: string, extra: Partial<BundlePort> = {}): BundlePort => ({
  name, enabled: true, installed: true, optional: false, removable: true, ...extra,
})

function rig(bundles: BundlePort[] = [bundle('web', { version: '1.0.0', optional: true, description: 'Web tools' }), bundle('base', { removable: false, readOnlyReason: 'profile' })]) {
  const n = fakeNamespaces()
  n.pluginManager.listBundles.mockResolvedValue({ ok: true, value: bundles })
  return { n, remote: { ...n, session: {}, $on: () => () => {} } as unknown as RemotePort }
}
const texts = (log: { kind: string; text: string }[], kind: string) => log.filter(entry => entry.kind === kind).map(entry => entry.text)
const applied = { changed: true, application: 'applied' as const, target: 'web' }

describe('/plugins', () => {
  it('stops when the list cannot be read or nothing is chosen', async () => {
    const failing = rig()
    failing.n.pluginManager.listBundles.mockResolvedValue({ ok: false, error: { code: 'x', message: 'down' } } as never)
    const a = scriptedUi([])
    await runPlugins(failing.remote, a.ui)
    expect(texts(a.log, 'warn')[0]).toContain('down')
    await runPlugins(rig().remote, scriptedUi([undefined]).ui)
  })

  it('turns a bundle off and on, with the Host warnings', async () => {
    const { n, remote } = rig()
    n.pluginManager.setBundleEnabled.mockResolvedValue({ ok: true, value: { ...applied, warnings: ['heads up'] } })
    const off = scriptedUi(['web', 'toggle'])
    await runPlugins(remote, off.ui)
    expect(n.pluginManager.setBundleEnabled).toHaveBeenCalledWith('web', false)
    expect(texts(off.log, 'info')).toEqual(['Web tools', 'heads up', expect.any(String)])
    const { remote: second, n: m } = rig([bundle('web', { enabled: false })])
    await runPlugins(second, scriptedUi(['web', 'toggle']).ui)
    expect(m.pluginManager.setBundleEnabled).toHaveBeenCalledWith('web', true)
  })

  it('reports restarts, failures and builds that are pending', async () => {
    const { n, remote } = rig()
    n.pluginManager.setBundleEnabled.mockResolvedValue({ ok: true, value: { changed: true, application: 'restart-required', target: 'web' } })
    const restart = scriptedUi(['web', 'toggle'])
    await runPlugins(remote, restart.ui)
    expect(texts(restart.log, 'warn')).toEqual([])
    n.pluginManager.setBundleEnabled.mockResolvedValue({ ok: true, value: { changed: false, application: 'failed', target: 'web', error: { code: 'E', diagnostic: 'why' }, pendingBuilds: ['pkg-a', 'pkg-b'] } })
    const failed = scriptedUi(['web', 'toggle'])
    await runPlugins(remote, failed.ui)
    expect(texts(failed.log, 'warn')[0]).toContain('E: why')
    expect(texts(failed.log, 'warn')[1]).toContain('pkg-a, pkg-b')
    n.pluginManager.setBundleEnabled.mockResolvedValue({ ok: true, value: { changed: false, application: 'cancelled', target: 'web', error: { code: 'E' } } })
    const noDiagnostic = scriptedUi(['web', 'toggle'])
    await runPlugins(remote, noDiagnostic.ui)
    expect(texts(noDiagnostic.log, 'warn')[0]).toContain('E')
    n.pluginManager.setBundleEnabled.mockResolvedValue({ ok: true, value: { changed: false, application: 'overridden', target: 'web' } })
    const overridden = scriptedUi(['web', 'toggle'])
    await runPlugins(remote, overridden.ui)
    expect(texts(overridden.log, 'warn')[0]).toContain('overridden')
    n.pluginManager.setBundleEnabled.mockResolvedValue({ ok: false, error: { code: 'x', message: 'refused' } } as never)
    const refused = scriptedUi(['web', 'toggle'])
    await runPlugins(remote, refused.ui)
    expect(texts(refused.log, 'warn')[0]).toContain('refused')
  })

  it('removes a removable bundle after confirmation', async () => {
    const { n, remote } = rig()
    n.pluginManager.removeBundle.mockResolvedValue({ ok: true, value: applied })
    await runPlugins(remote, scriptedUi(['web', 'remove', 'no']).ui)
    expect(n.pluginManager.removeBundle).not.toHaveBeenCalled()
    await runPlugins(remote, scriptedUi(['web', 'remove', 'yes']).ui)
    expect(n.pluginManager.removeBundle).toHaveBeenCalledWith('web')
    n.pluginManager.removeBundle.mockResolvedValue({ ok: false, error: { code: 'x', message: 'busy' } } as never)
    const busy = scriptedUi(['web', 'remove', 'yes'])
    await runPlugins(remote, busy.ui)
    expect(texts(busy.log, 'warn')[0]).toContain('busy')
    await runPlugins(remote, scriptedUi(['web', undefined]).ui)
  })

  it('says a bundle is read only when it offers no action, and offers the actions it has', async () => {
    const locked = rig([bundle('base', { removable: false, readOnlyReason: 'profile' }), bundle('only-remove', { readOnlyReason: 'x' }), bundle('plain', { removable: false })])
    const first = scriptedUi(['base'])
    await runPlugins(locked.remote, first.ui)
    expect(texts(first.log, 'info')).toHaveLength(1)
    const second = scriptedUi(['only-remove', undefined])
    await runPlugins(locked.remote, second.ui)
    expect(second.log.filter(entry => entry.kind === 'pick')[1]!.items!.map(item => item.value)).toEqual(['remove'])
    const third = scriptedUi(['plain', undefined])
    await runPlugins(locked.remote, third.ui)
    expect(third.log.filter(entry => entry.kind === 'pick')[1]!.items!.map(item => item.value)).toEqual(['toggle'])
  })

  it('installs a package after inspecting it', async () => {
    const { n, remote } = rig()
    n.pluginManager.inspect.mockResolvedValue({ ok: true, value: { status: 'accepted', kind: 'npm', name: 'tools', version: '2.0.0', description: 'Extra tools', bundle: true } })
    n.pluginManager.installBundle.mockResolvedValue({ ok: true, value: applied })
    const done = scriptedUi([INSTALL, 'tools', 'yes'])
    await runPlugins(remote, done.ui)
    expect(n.pluginManager.installBundle).toHaveBeenCalledWith('tools')
    expect(texts(done.log, 'info')).toContain('Extra tools')
    n.pluginManager.installBundle.mockClear()
    await runPlugins(remote, scriptedUi([INSTALL, 'tools', 'no']).ui)
    expect(n.pluginManager.installBundle).not.toHaveBeenCalled()
    n.pluginManager.inspect.mockResolvedValue({ ok: true, value: { status: 'accepted', kind: 'npm', bundle: null } })
    await runPlugins(remote, scriptedUi([INSTALL, 'bare', 'yes']).ui)
    expect(n.pluginManager.installBundle).toHaveBeenCalledWith('bare')
    n.pluginManager.installBundle.mockResolvedValue({ ok: false, error: { code: 'x', message: 'offline' } } as never)
    const failed = scriptedUi([INSTALL, 'bare', 'yes'])
    await runPlugins(remote, failed.ui)
    expect(texts(failed.log, 'warn')[0]).toContain('offline')
  })

  it('refuses specs that are not bundles and stops on empty or failed inspection', async () => {
    const { n, remote } = rig()
    n.pluginManager.inspect.mockResolvedValue({ ok: true, value: { status: 'refused', problem: 'p', reason: 'not allowed' } })
    const refused = scriptedUi([INSTALL, 'x'])
    await runPlugins(remote, refused.ui)
    expect(texts(refused.log, 'warn')[0]).toContain('not allowed')
    n.pluginManager.inspect.mockResolvedValue({ ok: true, value: { status: 'accepted', kind: 'npm', name: 'lib', bundle: false } })
    const named = scriptedUi([INSTALL, 'lib'])
    await runPlugins(remote, named.ui)
    expect(texts(named.log, 'warn')[0]).toContain('lib')
    n.pluginManager.inspect.mockResolvedValue({ ok: true, value: { status: 'accepted', kind: 'npm', bundle: false } })
    const unnamed = scriptedUi([INSTALL, 'spec-only'])
    await runPlugins(remote, unnamed.ui)
    expect(texts(unnamed.log, 'warn')[0]).toContain('spec-only')
    n.pluginManager.inspect.mockResolvedValue({ ok: false, error: { code: 'x', message: 'unreachable' } } as never)
    const broken = scriptedUi([INSTALL, 'x'])
    await runPlugins(remote, broken.ui)
    expect(texts(broken.log, 'warn')[0]).toContain('unreachable')
    for (const answer of [undefined, '']) {
      n.pluginManager.inspect.mockClear()
      await runPlugins(remote, scriptedUi([INSTALL, answer]).ui)
      expect(n.pluginManager.inspect).not.toHaveBeenCalled()
    }
  })

  it('switches a single plugin', async () => {
    const { n, remote } = rig()
    n.pluginManager.listPlugins.mockResolvedValue({ ok: true, value: [
      { entryId: 'e1', moduleName: 'mod-a', enabled: true },
      { entryId: 'e2', moduleName: 'mod-b', enabled: false },
      { entryId: 'e3', moduleName: 'mod-c', enabled: true, readOnlyReason: 'profile' },
    ] })
    n.pluginManager.setPluginEnabled.mockResolvedValue({ ok: true, value: applied })
    await runPlugins(remote, scriptedUi([PLUGINS, 'e1']).ui)
    expect(n.pluginManager.setPluginEnabled).toHaveBeenCalledWith('e1', false)
    await runPlugins(remote, scriptedUi([PLUGINS, 'e2']).ui)
    expect(n.pluginManager.setPluginEnabled).toHaveBeenCalledWith('e2', true)
    const locked = scriptedUi([PLUGINS, 'e3'])
    await runPlugins(remote, locked.ui)
    expect(texts(locked.log, 'info')).toHaveLength(1)
    await runPlugins(remote, scriptedUi([PLUGINS, undefined]).ui)
    n.pluginManager.setPluginEnabled.mockResolvedValue({ ok: false, error: { code: 'x', message: 'refused' } } as never)
    const failed = scriptedUi([PLUGINS, 'e1'])
    await runPlugins(remote, failed.ui)
    expect(texts(failed.log, 'warn')[0]).toContain('refused')
    n.pluginManager.listPlugins.mockResolvedValue({ ok: false, error: { code: 'x', message: 'no list' } } as never)
    const unreadable = scriptedUi([PLUGINS])
    await runPlugins(remote, unreadable.ui)
    expect(texts(unreadable.log, 'warn')[0]).toContain('no list')
  })
})
