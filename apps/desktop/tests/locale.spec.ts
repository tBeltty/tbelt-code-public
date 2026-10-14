import { describe, expect, it } from 'vitest'
import { el, en, es, formatDesktopMessage, fr, resolveDesktopLocale, resolveDesktopStartupLocale } from '../src/locale.ts'

describe('desktop locale dictionaries', () => {
  it('ships the same key set in every dictionary', () => {
    for (const dictionary of [es, el, fr]) expect(Object.keys(dictionary)).toEqual(Object.keys(en))
  })

  it('keeps each message placeholder-for-placeholder identical to English', () => {
    const placeholders = (message: string): string[] => [...message.matchAll(/\{[^{}]+\}/gu)].map(match => match[0]).sort()
    for (const [name, dictionary] of Object.entries({ es, el, fr })) {
      for (const key of Object.keys(en) as (keyof typeof en)[]) {
        expect(placeholders(dictionary[key]), `${name}.${key}`).toEqual(placeholders(en[key]))
      }
    }
  })

  it('resolves Electron locales on their primary language subtag', () => {
    expect(resolveDesktopLocale('es-ES').messages).toEqual(es)
    expect(resolveDesktopLocale('es_MX').messages).toEqual(es)
    expect(resolveDesktopLocale('el-GR').messages).toEqual(el)
    expect(resolveDesktopLocale('fr-CA').messages).toEqual(fr)
    expect(resolveDesktopLocale('en-US').messages).toEqual(en)
    expect(resolveDesktopLocale('ja-JP').messages).toEqual(en)
  })

  it('formats named values without consuming unknown placeholders', () => {
    expect(formatDesktopMessage('{name}@{version} {missing}', { name: 'plugin', version: '1.2.3' }))
      .toBe('plugin@1.2.3 {missing}')
  })

  it('prefers an explicit supported choice, then the first supported system language', () => {
    expect(resolveDesktopStartupLocale('es', ['en-US']).id).toBe('es')
    expect(resolveDesktopStartupLocale('EN', ['es']).id).toBe('en')
    expect(resolveDesktopStartupLocale(null, ['ja-JP', 'es-MX', 'fr-FR']).id).toBe('es')
    expect(resolveDesktopStartupLocale(null, ['ja-JP', 'fr-FR', 'es-MX']).id).toBe('fr')
    expect(resolveDesktopStartupLocale('el', ['en-US']).id).toBe('el')
    expect(resolveDesktopStartupLocale('FR', ['es']).id).toBe('fr')
    expect(resolveDesktopStartupLocale(null, ['el-GR', 'en-US']).id).toBe('el')
    expect(resolveDesktopStartupLocale(null, ['en-US', 'es']).id).toBe('en')
    expect(resolveDesktopStartupLocale('zh', ['es-ES']).id).toBe('es')
    expect(resolveDesktopStartupLocale(null, ['zh-CN']).id).toBe('en')
    expect(resolveDesktopStartupLocale(null, ['ja-JP']).id).toBe('en')
    expect(resolveDesktopStartupLocale(null, []).id).toBe('en')
    expect(resolveDesktopStartupLocale('ja', ['es']).id).toBe('es')
  })
})
