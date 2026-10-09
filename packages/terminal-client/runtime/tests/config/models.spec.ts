import { describe, expect, it } from 'vitest'
import { runDefaultModel } from '../../src/config/models.ts'
import { modelItems } from '@deepseek-ai/dsh-terminal-views'
import type { RemotePort } from '../../src/ports.ts'
import { CATALOG, fakeNamespaces, fakeSessionRemote, scriptedUi } from '../fakes.ts'

function rig() {
  const session = fakeSessionRemote()
  return { session, remote: { ...fakeNamespaces(), session, $on: () => () => {} } as unknown as RemotePort }
}
const texts = (log: { kind: string; text: string }[], kind: string) => log.filter(entry => entry.kind === kind).map(entry => entry.text)

describe('default model screen', () => {
  it('stops when the catalog cannot be read or has no model', async () => {
    const { session, remote } = rig()
    session.modelCatalog.mockResolvedValue({ ok: false, error: { code: 'x', message: 'down' } })
    const a = scriptedUi([])
    await runDefaultModel(remote, a.ui)
    expect(texts(a.log, 'warn')[0]).toContain('down')
    session.modelCatalog.mockResolvedValue({ ok: true, value: { default: undefined, groups: [] } })
    const b = scriptedUi([])
    await runDefaultModel(remote, b.ui)
    expect(texts(b.log, 'warn')).toHaveLength(1)
  })

  it('sets the chosen model as default for new sessions and reports a refusal', async () => {
    const { session, remote } = rig()
    const value = modelItems(CATALOG).find(item => item.label === 'Model Two')!.value
    const { ui, log } = scriptedUi([value])
    await runDefaultModel(remote, ui)
    expect(session.setDefaultModel).toHaveBeenCalledWith({ provider: 'p1', model: 'm2' })
    expect(texts(log, 'info')[0]).toContain('Model Two'.slice(0, 0))
    session.setDefaultModel.mockResolvedValue({ ok: false, error: { code: 'x', message: 'readonly' } })
    const refused = scriptedUi([value])
    await runDefaultModel(remote, refused.ui)
    expect(texts(refused.log, 'warn')[0]).toContain('readonly')
    const left = scriptedUi([undefined])
    await runDefaultModel(remote, left.ui)
    expect(left.remaining()).toBe(0)
  })
})
