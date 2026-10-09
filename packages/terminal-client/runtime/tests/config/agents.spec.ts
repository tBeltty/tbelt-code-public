import { describe, expect, it } from 'vitest'
import { runAgents } from '../../src/config/agents.ts'
import type { RemotePort } from '../../src/ports.ts'
import { fakeNamespaces, scriptedUi } from '../fakes.ts'

const presets = [
  { id: 'build', name: 'Builder', description: 'Writes code', isDefault: true },
  { id: 'plain', isDefault: false },
  { id: 'bad', isDefault: false, broken: 'missing model' },
]

function rig() {
  const n = fakeNamespaces()
  n.agentPresets.list.mockResolvedValue({ ok: true, value: { presets } })
  return { n, remote: { ...n, session: {}, $on: () => () => {} } as unknown as RemotePort }
}
const texts = (log: { kind: string; text: string }[], kind: string) => log.filter(entry => entry.kind === kind).map(entry => entry.text)

describe('agent presets', () => {
  it('stops when the roster cannot be read or is empty', async () => {
    const failing = rig()
    failing.n.agentPresets.list.mockResolvedValue({ ok: false, error: { code: 'x', message: 'down' } } as never)
    const a = scriptedUi([])
    await runAgents(failing.remote, a.ui, 's1')
    expect(texts(a.log, 'warn')[0]).toContain('down')
    const empty = rig()
    empty.n.agentPresets.list.mockResolvedValue({ ok: true, value: { presets: [] } })
    const b = scriptedUi([])
    await runAgents(empty.remote, b.ui, 's1')
    expect(texts(b.log, 'info')).toHaveLength(1)
  })

  it('leaves when no preset or no action is chosen', async () => {
    const { remote } = rig()
    await runAgents(remote, scriptedUi([undefined]).ui, 's1')
    const { ui, log } = scriptedUi(['build', undefined])
    await runAgents(remote, ui, 's1')
    expect(log.filter(entry => entry.kind === 'pick')[1]!.items!.map(item => item.value)).toEqual(['session', 'default', 'show'])
  })

  it('shows the definition of a preset and reports a read failure', async () => {
    const { n, remote } = rig()
    n.agentPresets.read.mockResolvedValue({ ok: true, value: { content: 'prompt text\n\n' } })
    const { ui, log } = scriptedUi(['bad', 'show'])
    await runAgents(remote, ui, 's1')
    expect(log.filter(entry => entry.kind === 'pick')[1]!.items!.map(item => item.value)).toEqual(['show'])
    expect(texts(log, 'info').at(-1)).toBe('prompt text')
    n.agentPresets.read.mockResolvedValue({ ok: false, error: { code: 'x', message: 'gone' } } as never)
    const second = scriptedUi(['build', 'show'])
    await runAgents(remote, second.ui, 's1')
    expect(texts(second.log, 'warn')[0]).toContain('gone')
  })

  it('selects a preset for the session and explains a locked session or a failure', async () => {
    const { n, remote } = rig()
    const ok = scriptedUi(['build', 'session'])
    await runAgents(remote, ok.ui, 's1')
    expect(n.agentPresets.select).toHaveBeenCalledWith('s1', 'build')
    expect(texts(ok.log, 'info').at(-1)).toContain('Builder')
    n.agentPresets.select.mockResolvedValue({ ok: false, error: { code: 'agent-preset/locked', message: 'x' } } as never)
    const locked = scriptedUi(['build', 'session'])
    await runAgents(remote, locked.ui, 's1')
    expect(texts(locked.log, 'warn')).toHaveLength(1)
    n.agentPresets.select.mockResolvedValue({ ok: false, error: { code: 'other', message: 'refused' } } as never)
    const refused = scriptedUi(['build', 'session'])
    await runAgents(remote, refused.ui, 's1')
    expect(texts(refused.log, 'warn')[0]).toContain('refused')
    n.agentPresets.select.mockRejectedValue(new Error('offline'))
    const thrown = scriptedUi(['plain', 'session'])
    await runAgents(remote, thrown.ui, 's1')
    expect(texts(thrown.log, 'warn')[0]).toContain('offline')
    n.agentPresets.select.mockRejectedValue('boom')
    const text = scriptedUi(['plain', 'session'])
    await runAgents(remote, text.ui, 's1')
    expect(texts(text.log, 'warn')[0]).toContain('boom')
  })

  it('sets the default for new sessions', async () => {
    const { n, remote } = rig()
    const { ui, log } = scriptedUi(['plain', 'default'])
    await runAgents(remote, ui, 's1')
    expect(n.settings.update).toHaveBeenCalledWith('agent-preset-registry', { selectedDefault: 'plain' }, undefined)
    expect(texts(log, 'info').at(-1)).toContain('plain')
    n.settings.update.mockResolvedValue({ ok: false, error: { code: 'x', message: 'readonly' } } as never)
    const failed = scriptedUi(['plain', 'default'])
    await runAgents(remote, failed.ui, 's1')
    expect(texts(failed.log, 'warn')[0]).toContain('readonly')
  })
})
