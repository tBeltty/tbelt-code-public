import { describe, expect, it } from 'vitest'
import { en, formatDesktopMessage, resolveDesktopLocale, resolveDesktopStartupLocale, es } from '../src/locale.ts'

describe('desktop locale dictionaries', () => {
  it('ships the same key set in English and Spanish', () => {
    expect(Object.keys(es)).toEqual(Object.keys(en))
    expect(resolveDesktopLocale('es-ES').messages).toEqual(es)
    expect(resolveDesktopLocale('en-US').messages).toEqual(en)
    expect(resolveDesktopLocale('fr-FR').messages).toEqual(en)
  })

  it('formats named values without consuming unknown placeholders', () => {
    expect(formatDesktopMessage('{name}@{version} {missing}', { name: 'plugin', version: '1.2.3' }))
      .toBe('plugin@1.2.3 {missing}')
  })

  it('prefers an explicit supported choice, then the first supported system language', () => {
    expect(resolveDesktopStartupLocale('es', ['en-US']).id).toBe('es')
    expect(resolveDesktopStartupLocale('EN', ['es']).id).toBe('en')
    expect(resolveDesktopStartupLocale(null, ['ja-JP', 'fr-FR', 'es-MX']).id).toBe('es')
    expect(resolveDesktopStartupLocale(null, ['en-US', 'es']).id).toBe('en')
    expect(resolveDesktopStartupLocale('zh', ['es-ES']).id).toBe('es')
    expect(resolveDesktopStartupLocale(null, ['zh-CN']).id).toBe('en')
    expect(resolveDesktopStartupLocale(null, ['ja-JP']).id).toBe('en')
    expect(resolveDesktopStartupLocale(null, []).id).toBe('en')
    expect(resolveDesktopStartupLocale('ja', ['es']).id).toBe('es')
  })
})
