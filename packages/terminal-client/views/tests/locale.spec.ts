import { afterEach, describe, expect, it } from 'vitest'
import { COPY_EL } from '../src/copy-el.ts'
import { COPY_ES } from '../src/copy-es.ts'
import { COPY_FR } from '../src/copy-fr.ts'
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

  it('answers in Greek and French once chosen', () => {
    setCopyLocale('el')
    expect(t('attach.none')).toBe('Δεν υπάρχει τίποτα συνημμένο.')
    setCopyLocale('fr')
    expect(t('attach.none')).toBe('Rien n’est joint.')
    expect(t('open.noMatch', { id: 'ab' })).toBe('Aucune session ne correspond à «\u00a0ab\u00a0».')
  })

  const translated = { es: COPY_ES, el: COPY_EL, fr: COPY_FR } as const

  it.each(Object.keys(translated) as (keyof typeof translated)[])('gives every %s message the placeholders of its English one', (locale) => {
    const dictionary = translated[locale]
    const english = (key: CopyKey): string => { setCopyLocale('en'); return t(key, new Proxy({}, { get: (_target, name) => `{${String(name)}}` })) }
    for (const key of Object.keys(dictionary) as CopyKey[]) {
      expect(placeholders(dictionary[key]), `${locale} ${key}`).toEqual(placeholders(english(key)))
    }
  })

  it.each(Object.keys(translated) as (keyof typeof translated)[])('keeps command names of the %s help lines', (locale) => {
    const dictionary = translated[locale]
    for (const key of Object.keys(dictionary).filter(candidate => candidate.startsWith('help.') && dictionary[candidate as CopyKey].startsWith('/')) as CopyKey[]) {
      setCopyLocale('en')
      const english = t(key)
      setCopyLocale(locale)
      const text = t(key)
      expect(text.split(/\s/u, 1)[0], key).toBe(english.split(/\s/u, 1)[0])
    }
  })
})

describe('resolveCopyLocale', () => {
  it('reads Greek and French from the saved language and the environment', () => {
    expect(resolveCopyLocale('el', { LANG: 'en_US.UTF-8' })).toBe('el')
    expect(resolveCopyLocale(undefined, { LANG: 'el_GR.UTF-8' })).toBe('el')
    expect(resolveCopyLocale(undefined, { LANG: 'fr_CA.UTF-8' })).toBe('fr')
  })

  it('prefers the saved language over the environment', () => {
    expect(resolveCopyLocale('es', { LANG: 'en_US.UTF-8' })).toBe('es')
    expect(resolveCopyLocale('en', { LANG: 'es_ES.UTF-8' })).toBe('en')
  })

  it('reads the environment when nothing is saved or the saved id is not offered', () => {
    expect(resolveCopyLocale(undefined, { LANG: 'es_MX.UTF-8' })).toBe('es')
    expect(resolveCopyLocale('ja', { LANG: 'es_MX.UTF-8' })).toBe('es')
    expect(resolveCopyLocale(undefined, { LANG: 'en_GB.UTF-8' })).toBe('en')
  })

  it('lets the strongest set variable decide', () => {
    expect(resolveCopyLocale(undefined, { LC_ALL: 'es_ES.UTF-8', LANG: 'en_US.UTF-8' })).toBe('es')
    expect(resolveCopyLocale(undefined, { LC_ALL: '', LC_MESSAGES: 'es_ES', LANG: 'en_US.UTF-8' })).toBe('es')
    expect(resolveCopyLocale(undefined, { LC_ALL: 'en_US.UTF-8', LANG: 'es_ES.UTF-8' })).toBe('en')
  })

  it('reads the first supported entry of a LANGUAGE list and the language of a modifier', () => {
    expect(resolveCopyLocale(undefined, { LANGUAGE: 'es:en' })).toBe('es')
    expect(resolveCopyLocale(undefined, { LANGUAGE: 'ja:es' })).toBe('en')
    expect(resolveCopyLocale(undefined, { LANGUAGE: 'fr:en' })).toBe('fr')
    expect(resolveCopyLocale(undefined, { LANG: 'es@euro' })).toBe('es')
    expect(resolveCopyLocale(undefined, { LANG: 'es-ES' })).toBe('es')
    expect(resolveCopyLocale(undefined, { LANG: 'ES_es.utf8' })).toBe('es')
  })

  it('falls back to English for the C locale, other languages and an empty environment', () => {
    expect(resolveCopyLocale(undefined, { LANG: 'C' })).toBe('en')
    expect(resolveCopyLocale(undefined, { LANG: 'POSIX' })).toBe('en')
    expect(resolveCopyLocale(undefined, { LANG: 'ja_JP.UTF-8' })).toBe('en')
    expect(resolveCopyLocale(undefined, { LANG: ':' })).toBe('en')
    expect(resolveCopyLocale(undefined, {})).toBe('en')
  })
})

describe('language list', () => {
  it('offers Automatic and every language by its own name, marking the saved choice', () => {
    expect(languageItems(undefined)).toEqual([
      { value: LANGUAGE_AUTOMATIC, label: 'Automatic', detail: 'follow the language of the terminal', current: true },
      { value: 'en', label: 'English', current: false },
      { value: 'es', label: 'Español', current: false },
      { value: 'el', label: 'Ελληνικά', current: false },
      { value: 'fr', label: 'Français', current: false },
    ])
    expect(languageItems('es').map(item => item.current)).toEqual([false, false, true, false, false])
    setCopyLocale('es')
    expect(languageItems('en').map(item => item.label)).toEqual(['Automático', 'English', 'Español', 'Ελληνικά', 'Français'])
  })

  it('names a language in its own words whatever the active one', () => {
    setCopyLocale('es')
    expect(languageName('en')).toBe('English')
    expect(languageName('es')).toBe('Español')
    expect(languageName('el')).toBe('Ελληνικά')
    expect(languageName('fr')).toBe('Français')
  })
})
