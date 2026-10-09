import { describe, expect, it, vi } from 'vitest'
import { runConfigScreen } from '../../src/config/index.ts'
import type { ConfigScreen } from '../../src/config/index.ts'
import { fakeRemote, scriptedUi } from '../fakes.ts'

describe('runConfigScreen', () => {
  it('opens each screen by reading what that screen lists', async () => {
    const { remote } = fakeRemote()
    const command = vi.fn(() => Promise.resolve({ ok: true as const, value: { matched: true } }))
    const reads: [ConfigScreen, ReturnType<typeof vi.fn>][] = [
      ['providers', remote.llm.listProviders as ReturnType<typeof vi.fn>],
      ['web-search', remote.web.searchProviders as ReturnType<typeof vi.fn>],
      ['settings', remote.settings.describe as ReturnType<typeof vi.fn>],
      ['plugins', remote.pluginManager.listBundles as ReturnType<typeof vi.fn>],
      ['agents', remote.agentPresets.list as ReturnType<typeof vi.fn>],
      ['permissions', remote.permissionPresets.catalog as ReturnType<typeof vi.fn>],
      ['default-model', remote.session.modelCatalog as ReturnType<typeof vi.fn>],
    ]
    for (const [screen, read] of reads) {
      read.mockClear()
      await runConfigScreen(screen, remote, scriptedUi([]).ui, { sessionId: 's1', command })
      expect(read).toHaveBeenCalledOnce()
    }
  })

  it('gives the agents screen the session and the permissions screen its command', async () => {
    const { remote } = fakeRemote()
    ;(remote.agentPresets.list as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, value: { presets: [{ id: 'build', isDefault: false }] } })
    ;(remote.permissionPresets.catalog as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true, value: { options: [{ value: 'default', name: 'Default' }], defaultOptions: [], defaultPreset: 'default' },
    })
    const command = vi.fn(() => Promise.resolve({ ok: true as const, value: { matched: true } }))
    await runConfigScreen('agents', remote, scriptedUi(['build', 'session']).ui, { sessionId: 's1', command })
    expect(remote.agentPresets.select).toHaveBeenCalledWith('s1', 'build')
    await runConfigScreen('permissions', remote, scriptedUi(['default']).ui, { sessionId: 's1', command })
    expect(command).toHaveBeenCalledWith('/permission default')
  })
})
