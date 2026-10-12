import { describe, expect, it } from 'vitest'
import { decimalMark, formatNumber, localeTag, pluralSuffix } from '../src/format.ts'

describe('localeTag', () => {
  it('keeps a well-formed tag and falls back to US English for anything else', () => {
    expect(localeTag('es-ES')).toBe('es-ES')
    expect(localeTag('en-us')).toBe('en-US')
    expect(localeTag('format.locale')).toBe('en-US')
    expect(localeTag('')).toBe('en-US')
  })
})

describe('formatNumber', () => {
  it('uses the decimal mark and digit grouping of the language', () => {
    expect(formatNumber('en-US', 1234.5, 2)).toBe('1,234.50')
    expect(formatNumber('es-ES', 1234.5, 2)).toBe('1234,50')
    expect(formatNumber('es-ES', 12345.5, 2)).toBe('12.345,50')
    expect(formatNumber('es-ES', 12.25, 0, 1)).toBe('12,3')
    expect(formatNumber('en-US', 7, 0, 1)).toBe('7')
  })

  it('reuses one format per language and digit range', () => {
    expect(formatNumber('es-ES', 1.5, 1)).toBe(formatNumber('es-ES', 1.5, 1))
    expect(formatNumber('not a tag', 1.5, 1)).toBe('1.5')
  })
})

describe('decimalMark', () => {
  it('names the mark between integer and fraction digits', () => {
    expect(decimalMark('en-US')).toBe('.')
    expect(decimalMark('es-ES')).toBe(',')
  })
})

describe('pluralSuffix', () => {
  it('chooses one only for the singular category', () => {
    expect(pluralSuffix('en-US', 1)).toBe('one')
    expect(pluralSuffix('en-US', 0)).toBe('other')
    expect(pluralSuffix('es-ES', 1)).toBe('one')
    expect(pluralSuffix('es-ES', 2)).toBe('other')
    expect(pluralSuffix('es-ES', 0)).toBe('other')
  })

  it('folds every other category into other, as the dictionaries share one plural form', () => {
    expect(pluralSuffix('fr-FR', 0)).toBe('one')
    expect(pluralSuffix('ar', 3)).toBe('other')
  })
})
