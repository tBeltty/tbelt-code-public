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

describe('agent files', () => {
  it('creates an agent from the new-agent item, checking its identifier first', async () => {
    const { n, remote } = rig()
    n.agentPresets.listFiles.mockResolvedValue({ ok: true, value: { files: [{ id: 'build' }] } })
    const invalid = scriptedUi(['new-agent', 'Bad Name'])
    await runAgents(remote, invalid.ui, 's1')
    expect(texts(invalid.log, 'warn')).toEqual([expect.stringContaining('lowercase')])
    const taken = scriptedUi(['new-agent', 'build'])
    await runAgents(remote, taken.ui, 's1')
    expect(texts(taken.log, 'warn')).toEqual([expect.stringContaining('already exists')])
    expect(n.agentPresets.writeFile).not.toHaveBeenCalled()
    const { ui, log } = scriptedUi(['new-agent', 'writer', 'Written text.'])
    await runAgents(remote, ui, 's1')
    expect(n.agentPresets.writeFile).toHaveBeenCalledWith('writer', 'Written text.')
    expect(texts(log, 'info').at(-1)).toBe('Saved writer.')
  })

  it('edits an agent file from its actions and saves the text the person wrote', async () => {
    const { n, remote } = rig()
    n.agentPresets.listFiles.mockResolvedValue({ ok: true, value: { files: [{ id: 'build' }] } })
    n.agentPresets.readFile.mockResolvedValue({ ok: true, value: { id: 'build', text: 'Old.' } })
    const { ui, log } = scriptedUi(['build', 'edit', 'Edited text.'])
    await runAgents(remote, ui, 's1')
    expect(log.filter(entry => entry.kind === 'pick')[1]!.items!.map(item => item.value)).toEqual(['session', 'default', 'show', 'edit', 'delete'])
    expect(log.find(entry => entry.kind === 'edit')).toMatchObject({ options: { initial: 'Old.' } })
    expect(n.agentPresets.writeFile).toHaveBeenCalledWith('build', 'Edited text.')
    expect(texts(log, 'info').at(-1)).toBe('Saved build.')
  })

  it('keeps the file when the edit is left, and reports a refused or unloaded save', async () => {
    const { n, remote } = rig()
    n.agentPresets.listFiles.mockResolvedValue({ ok: true, value: { files: [{ id: 'build' }] } })
    const left = scriptedUi(['build', 'edit'])
    await runAgents(remote, left.ui, 's1')
    expect(n.agentPresets.writeFile).not.toHaveBeenCalled()
    n.agentPresets.writeFile.mockResolvedValueOnce({ ok: false, error: { code: 'agent-preset/invalid', message: 'unknown front matter key "tools"' } } as never)
    const refused = scriptedUi(['build', 'edit', 'Bad.'])
    await runAgents(remote, refused.ui, 's1')
    expect(texts(refused.log, 'warn')).toEqual([expect.stringContaining('unknown front matter key "tools"')])
    n.agentPresets.writeFile.mockResolvedValueOnce({ ok: true, value: { id: 'build', error: 'base preset "x" is not declared' } } as never)
    const unloaded = scriptedUi(['build', 'edit', 'Based on x.'])
    await runAgents(remote, unloaded.ui, 's1')
    expect(texts(unloaded.log, 'warn')).toEqual([expect.stringContaining('does not load: base preset "x" is not declared')])
  })

  it('deletes an agent file only after the person confirms', async () => {
    const { n, remote } = rig()
    n.agentPresets.listFiles.mockResolvedValue({ ok: true, value: { files: [{ id: 'build' }] } })
    const kept = scriptedUi(['build', 'delete', 'no'])
    await runAgents(remote, kept.ui, 's1')
    expect(n.agentPresets.deleteFile).not.toHaveBeenCalled()
    const removed = scriptedUi(['build', 'delete', 'yes'])
    await runAgents(remote, removed.ui, 's1')
    expect(n.agentPresets.deleteFile).toHaveBeenCalledWith('build')
    expect(texts(removed.log, 'info').at(-1)).toBe('Deleted build.')
  })

  it('lists an agent file that did not load and acts on it from its own item', async () => {
    const { n, remote } = rig()
    n.agentPresets.listFiles.mockResolvedValue({ ok: true, value: { files: [{ id: 'broken', error: 'bad base' }] } })
    const { ui, log } = scriptedUi(['file:broken', 'delete', 'yes'])
    await runAgents(remote, ui, 's1')
    const top = log.filter(entry => entry.kind === 'pick')[0]!.items!
    expect(top.find(item => item.value === 'file:broken')).toMatchObject({ label: 'broken', detail: 'Not loaded: bad base' })
    expect(n.agentPresets.deleteFile).toHaveBeenCalledWith('broken')
  })

  it('warns about a failed file list and still offers the presets', async () => {
    const { n, remote } = rig()
    n.agentPresets.listFiles.mockResolvedValue({ ok: false, error: { code: 'x', message: 'folder unreadable' } } as never)
    const { ui, log } = scriptedUi([undefined])
    await runAgents(remote, ui, 's1')
    expect(texts(log, 'warn')).toEqual([expect.stringContaining('folder unreadable')])
    expect(log.filter(entry => entry.kind === 'pick')[0]!.items!.map(item => item.value)).toContain('build')
  })
})
