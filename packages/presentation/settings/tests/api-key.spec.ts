import { describe, expect, it } from 'vitest'
import { apiKeyFailure } from '../src/index.ts'

describe('apiKeyFailure', () => {
  it('lets an empty input through, because empty means keep the stored key', () => {
    expect(apiKeyFailure('')).toBeUndefined()
  })

  it('rejects an input of only whitespace as blank', () => {
    expect(apiKeyFailure('   ')).toBe('keyBlank')
  })

  it('accepts a printable key with surrounding whitespace', () => {
    expect(apiKeyFailure('  sk-abc_123  ')).toBeUndefined()
    expect(apiKeyFailure('ABCD==')).toBeUndefined()
    expect(apiKeyFailure('"')).toBeUndefined()
  })

  it('rejects a pasted environment line, a quoted key and illegal characters', () => {
    expect(apiKeyFailure('EXAMPLE_KEY=value')).toBe('keyIllegalCharacters')
    expect(apiKeyFailure('"sk-1"')).toBe('keyIllegalCharacters')
    expect(apiKeyFailure('`sk-1`')).toBe('keyIllegalCharacters')
    expect(apiKeyFailure('\'sk-1\'')).toBe('keyIllegalCharacters')
    expect(apiKeyFailure('sk 1')).toBe('keyIllegalCharacters')
    expect(apiKeyFailure('clé')).toBe('keyIllegalCharacters')
  })
})
