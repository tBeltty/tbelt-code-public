import { afterEach, describe, expect, it } from 'vitest'
import { getCopyLocale, setCopyLocale } from '@deepseek-ai/dsh-terminal-views'
import { loadSavedLanguage, runLanguage, savedLanguage } from '../../src/config/language.ts'
import type { RemotePort } from '../../src/ports.ts'
import { fakeNamespaces, scriptedUi } from '../fakes.ts'

afterEach(() => { setCopyLocale('en') })

function rig(namespaces: object[] = [{ ns: 'locale', schema: {}, value: {}, secrets: [], revision: 2 }]) {
  const n = fakeNamespaces()
  n.settings.describe.mockResolvedValue({ ok: true, value: { writable: true, namespaces: namespaces as never } })
  return { n, remote: { ...n, session: {}, $on: () => () => {} } as unknown as RemotePort }
}
const texts = (log: { kind: string; text: string }[], kind: string) => log.filter(entry => entry.kind === kind).map(entry => entry.text)

describe('savedLanguage', () => {
  it('reads the preference from the locale namespace value', () => {
    expect(savedLanguage({ ns: 'locale', schema: {}, value: { preference: 'es' }, secrets: [], revision: 1 })).toBe('es')
    expect(savedLanguage({ ns: 'locale', schema: {}, value: {}, secrets: [], revision: 1 })).toBeUndefined()
    expect(savedLanguage({ ns: 'locale', schema: {}, value: null, secrets: [], revision: 1 })).toBeUndefined()
    expect(savedLanguage(undefined)).toBeUndefined()
  })
})

describe('loadSavedLanguage', () => {
  it('returns the saved language, or nothing when the Host cannot say', async () => {
    expect(await loadSavedLanguage(rig([{ ns: 'locale', schema: {}, value: { preference: 'es' }, secrets: [], revision: 1 }]).remote)).toBe('es')
    expect(await loadSavedLanguage(rig([]).remote)).toBeUndefined()
    const refused = rig()
    refused.n.settings.describe.mockResolvedValue({ ok: false, error: { code: 'x', message: 'no' } } as never)
    expect(await loadSavedLanguage(refused.remote)).toBeUndefined()
    const down = rig()
    down.n.settings.describe.mockRejectedValue(new Error('closed'))
    expect(await loadSavedLanguage(down.remote)).toBeUndefined()
  })
})

describe('language screen', () => {
  it('stops when settings cannot be read, hold no language or nothing is chosen', async () => {
    const unreadable = rig()
    unreadable.n.settings.describe.mockResolvedValue({ ok: false, error: { code: 'x', message: 'down' } } as never)
    const a = scriptedUi([])
    await runLanguage(unreadable.remote, a.ui, {})
    expect(texts(a.log, 'warn')[0]).toContain('down')
    const none = scriptedUi([])
    await runLanguage(rig([]).remote, none.ui, {})
    expect(texts(none.log, 'warn')).toEqual(['This installation cannot save a language.'])
    const { remote, n } = rig()
    await runLanguage(remote, scriptedUi([undefined]).ui, {})
    expect(n.settings.mutate).not.toHaveBeenCalled()
  })

  it('saves a language and switches the wording at once', async () => {
    const { remote, n } = rig()
    const { ui, log } = scriptedUi(['es'])
    await runLanguage(remote, ui, { LANG: 'en_US.UTF-8' })
    expect(n.settings.mutate).toHaveBeenCalledWith('locale', [{ op: 'set', path: ['preference'], value: 'es' }], 2)
    expect(getCopyLocale()).toBe('es')
    expect(texts(log, 'info')).toEqual(['El idioma ahora es Español.'])
  })

  it('removes the saved language and follows the environment', async () => {
    const { remote, n } = rig([{ ns: 'locale', schema: {}, value: { preference: 'en' }, secrets: [], revision: 5 }])
    const { ui, log } = scriptedUi(['@auto'])
    await runLanguage(remote, ui, { LANG: 'es_ES.UTF-8' })
    expect(n.settings.mutate).toHaveBeenCalledWith('locale', [{ op: 'unset', path: ['preference'] }], 5)
    expect(getCopyLocale()).toBe('es')
    expect(texts(log, 'info')).toEqual(['El idioma ahora sigue el de la terminal.'])
  })

  it('keeps the wording when the write is refused', async () => {
    const { remote, n } = rig()
    n.settings.mutate.mockResolvedValue({ ok: false, error: { code: 'x', message: 'bad' } } as never)
    const { ui, log } = scriptedUi(['es'])
    await runLanguage(remote, ui, {})
    expect(getCopyLocale()).toBe('en')
    expect(texts(log, 'info')).toEqual([])
  })
})
