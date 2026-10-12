import { afterEach, describe, expect, it } from 'vitest'
import { COPY_ES } from '../src/copy-es.ts'
import { getCopyLocale, setCopyLocale, t } from '../src/copy.ts'
import type { CopyKey } from '../src/copy.ts'
import { LANGUAGE_AUTOMATIC, languageItems, languageName } from '../src/language.ts'
import { resolveCopyLocale } from '../src/locale.ts'

afterEach(() => { setCopyLocale('en') })

/** Placeholder names of one message, sorted. */
function placeholders(text: string): string[] {
  return [...text.matchAll(/\{(\w+)\}/gu)].map(match => match[1]!).sort()
}

describe('copy language', () => {
  it('answers in English until a language is chosen', () => {
    expect(getCopyLocale()).toBe('en')
    expect(t('attach.none')).toBe('Nothing is attached.')
  })

  it('answers in Spanish once chosen and back in English afterwards', () => {
    setCopyLocale('es')
    expect(getCopyLocale()).toBe('es')
    expect(t('attach.none')).toBe('No hay nada adjunto.')
    expect(t('rename.done', { title: 'API' })).toBe('Sesión renombrada a "API".')
    setCopyLocale('en')
    expect(t('attach.none')).toBe('Nothing is attached.')
  })

  it('gives every Spanish message the placeholders of its English one', () => {
    const english = (key: CopyKey): string => { setCopyLocale('en'); return t(key, new Proxy({}, { get: (_target, name) => `{${String(name)}}` })) }
    for (const key of Object.keys(COPY_ES) as CopyKey[]) {
      expect(placeholders(COPY_ES[key]), key).toEqual(placeholders(english(key)))
    }
  })

  it('keeps command names and keys of the help lines in Spanish', () => {
    setCopyLocale('es')
    for (const key of Object.keys(COPY_ES).filter(candidate => candidate.startsWith('help.') && COPY_ES[candidate as CopyKey].startsWith('/')) as CopyKey[]) {
      setCopyLocale('en')
      const command = t(key).split(/\s/u, 1)[0]
      setCopyLocale('es')
      expect(t(key).split(/\s/u, 1)[0], key).toBe(command)
    }
  })
})

describe('resolveCopyLocale', () => {
  it('prefers the saved language over the environment', () => {
    expect(resolveCopyLocale('es', { LANG: 'en_US.UTF-8' })).toBe('es')
    expect(resolveCopyLocale('en', { LANG: 'es_ES.UTF-8' })).toBe('en')
  })

  it('reads the environment when nothing is saved or the saved id is not offered', () => {
    expect(resolveCopyLocale(undefined, { LANG: 'es_MX.UTF-8' })).toBe('es')
    expect(resolveCopyLocale('fr', { LANG: 'es_MX.UTF-8' })).toBe('es')
    expect(resolveCopyLocale(undefined, { LANG: 'en_GB.UTF-8' })).toBe('en')
  })

  it('lets the strongest set variable decide', () => {
    expect(resolveCopyLocale(undefined, { LC_ALL: 'es_ES.UTF-8', LANG: 'en_US.UTF-8' })).toBe('es')
    expect(resolveCopyLocale(undefined, { LC_ALL: '', LC_MESSAGES: 'es_ES', LANG: 'en_US.UTF-8' })).toBe('es')
    expect(resolveCopyLocale(undefined, { LC_ALL: 'en_US.UTF-8', LANG: 'es_ES.UTF-8' })).toBe('en')
  })

  it('reads the first supported entry of a LANGUAGE list and the language of a modifier', () => {
    expect(resolveCopyLocale(undefined, { LANGUAGE: 'es:en' })).toBe('es')
    expect(resolveCopyLocale(undefined, { LANGUAGE: 'fr:es' })).toBe('en')
    expect(resolveCopyLocale(undefined, { LANG: 'es@euro' })).toBe('es')
    expect(resolveCopyLocale(undefined, { LANG: 'es-ES' })).toBe('es')
    expect(resolveCopyLocale(undefined, { LANG: 'ES_es.utf8' })).toBe('es')
  })

  it('falls back to English for the C locale, other languages and an empty environment', () => {
    expect(resolveCopyLocale(undefined, { LANG: 'C' })).toBe('en')
    expect(resolveCopyLocale(undefined, { LANG: 'POSIX' })).toBe('en')
    expect(resolveCopyLocale(undefined, { LANG: 'fr_FR.UTF-8' })).toBe('en')
    expect(resolveCopyLocale(undefined, { LANG: ':' })).toBe('en')
    expect(resolveCopyLocale(undefined, {})).toBe('en')
  })
})

describe('language list', () => {
  it('offers Automatic and both languages by their own names, marking the saved choice', () => {
    expect(languageItems(undefined)).toEqual([
      { value: LANGUAGE_AUTOMATIC, label: 'Automatic', detail: 'follow the language of the terminal', current: true },
      { value: 'en', label: 'English', current: false },
      { value: 'es', label: 'Español', current: false },
    ])
    expect(languageItems('es').map(item => item.current)).toEqual([false, false, true])
    setCopyLocale('es')
    expect(languageItems('en').map(item => item.label)).toEqual(['Automático', 'English', 'Español'])
  })

  it('names a language in its own words whatever the active one', () => {
    setCopyLocale('es')
    expect(languageName('en')).toBe('English')
    expect(languageName('es')).toBe('Español')
  })
})
