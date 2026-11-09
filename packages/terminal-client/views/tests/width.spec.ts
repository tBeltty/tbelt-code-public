import { describe, expect, it } from 'vitest'
import { graphemeWidth, graphemes, textWidth, truncate, wrapRows } from '../src/width.ts'

describe('width', () => {
  it('splits text into grapheme clusters', () => {
    expect(graphemes('éa👨‍👩‍👧')).toEqual(['é', 'a', '👨‍👩‍👧'])
  })

  it('measures control, narrow, wide and emoji characters', () => {
    expect(graphemeWidth('\u0007')).toBe(0)
    expect(graphemeWidth('a')).toBe(1)
    expect(graphemeWidth('日')).toBe(2)
    expect(graphemeWidth('😀')).toBe(2)
    expect(textWidth('a日😀')).toBe(5)
  })

  it('wraps a line by cells and records where each row starts', () => {
    expect(wrapRows('abcdef', 4)).toEqual([{ text: 'abcd', start: 0 }, { text: 'ef', start: 4 }])
    expect(wrapRows('', 4)).toEqual([{ text: '', start: 0 }])
    expect(wrapRows('a日b', 2).map(row => row.text)).toEqual(['a', '日', 'b'])
    expect(wrapRows('abc', 0).map(row => row.text)).toEqual(['ab', 'c'])
  })

  it('truncates to the available cells', () => {
    expect(truncate('abcdef', 3)).toBe('abc')
    expect(truncate('日本語', 5)).toBe('日本')
    expect(truncate('ab', 5)).toBe('ab')
  })
})
