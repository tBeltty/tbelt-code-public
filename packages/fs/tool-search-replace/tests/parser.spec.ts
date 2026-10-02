import { describe, expect, it } from 'vitest'
import { parseSearchReplaceBlocks, SearchReplaceParseError } from '../src/parser.ts'

function block(search: string, replace: string): string {
  return `<<<<<<< SEARCH\n${search}\n=======\n${replace}\n>>>>>>> REPLACE`
}

describe('parseSearchReplaceBlocks', () => {
  it('parses a single block', () => {
    const diff = block('foo', 'bar')
    expect(parseSearchReplaceBlocks(diff)).toEqual([{ search: 'foo', replace: 'bar' }])
  })

  it('parses multiple concatenated blocks in order', () => {
    const diff = `${block('foo', 'bar')}\n${block('baz', 'qux')}`
    expect(parseSearchReplaceBlocks(diff)).toEqual([
      { search: 'foo', replace: 'bar' },
      { search: 'baz', replace: 'qux' },
    ])
  })

  it('preserves multi-line search and replace text', () => {
    const diff = block('line one\nline two', 'new line one\nnew line two')
    expect(parseSearchReplaceBlocks(diff)).toEqual([
      { search: 'line one\nline two', replace: 'new line one\nnew line two' },
    ])
  })

  it('throws SearchReplaceParseError when the ======= divider is missing', () => {
    const diff = '<<<<<<< SEARCH\nfoo\nbar\n>>>>>>> REPLACE'
    expect(() => parseSearchReplaceBlocks(diff)).toThrow(SearchReplaceParseError)
  })

  it('throws SearchReplaceParseError when the closing REPLACE marker is missing', () => {
    const diff = '<<<<<<< SEARCH\nfoo\n=======\nbar'
    expect(() => parseSearchReplaceBlocks(diff)).toThrow(SearchReplaceParseError)
  })

  it('throws SearchReplaceParseError when no blocks are present', () => {
    expect(() => parseSearchReplaceBlocks('just some text, no markers')).toThrow(SearchReplaceParseError)
  })
})
