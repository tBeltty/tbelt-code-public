import { describe, expect, it } from 'vitest'
import { durationText, numberField, oneLine, recordOf, relativeText, stringField } from '../src/lines.ts'

describe('oneLine', () => {
  it('joins lines, drops escape sequences and shortens long text', () => {
    expect(oneLine('  first\n\tsecond  \u001B[31mred\u001B[0m ')).toBe('first second red')
    expect(oneLine('x'.repeat(100), 10)).toHaveLength(10)
    expect(oneLine('x'.repeat(100)).length).toBeLessThanOrEqual(80)
  })
})

describe('durationText', () => {
  it('uses the two largest units', () => {
    expect([0, 850, 5000, 61_000, 3_723_000, -5].map(durationText)).toEqual(['0ms', '850ms', '5s', '1m 01s', '1h 02m', '0ms'])
  })
})

describe('relativeText', () => {
  it('says whether a moment is ahead or behind', () => {
    expect(relativeText(65_000, 0)).toBe('in 1m 05s')
    expect(relativeText(0, 5000)).toBe('5s ago')
  })
})

describe('wire fields', () => {
  it('reads records and their string and number fields, and nothing else', () => {
    expect(recordOf({ a: 1 })).toEqual({ a: 1 })
    expect([null, 3, 'x', [1]].map(recordOf)).toEqual([undefined, undefined, undefined, undefined])
    expect(stringField({ a: 'x' }, 'a')).toBe('x')
    expect(stringField({ a: 1 }, 'a')).toBeUndefined()
    expect(stringField(undefined, 'a')).toBeUndefined()
    expect(numberField({ a: 2 }, 'a')).toBe(2)
    expect(numberField({ a: Number.NaN }, 'a')).toBeUndefined()
    expect(numberField({ a: '2' }, 'a')).toBeUndefined()
  })
})
