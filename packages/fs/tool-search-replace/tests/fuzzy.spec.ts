import { describe, expect, it } from 'vitest'
import { FsError } from '@deepseek-ai/dsh-fs'
import { applySearchReplaceBlocks } from '../src/apply.ts'

describe('applySearchReplaceBlocks fuzzy fallback', () => {
  it('matches uniquely via whitespace-tolerant fallback and applies when indentation differs', () => {
    const content = 'function f() {\n    const x = 1\n    return x\n}\n'
    const result = applySearchReplaceBlocks(content, [
      { search: 'const x = 1\nreturn x', replace: 'const x = 2\nreturn x' },
    ])
    // The matched raw window (including its original indentation) is replaced
    // wholesale by the block's replace text verbatim — fuzzy matching only
    // affects how the window is *found*, not how the replacement is written.
    expect(result.content).toBe('function f() {\nconst x = 2\nreturn x\n}\n')
    expect(result.fuzzyBlockIndexes).toEqual([1])
  })

  it('throws FS_AMBIGUOUS_EDIT when a block matches two different windows fuzzily', () => {
    // Neither line contains "const y = 1" as an exact substring (extra internal
    // whitespace on both), so both windows are reachable only via the fuzzy
    // fallback, and both normalize to the same text — an ambiguous fuzzy match.
    const content = 'if (a) {\n  const   y = 1\n}\nif (b) {\n    const y  =    1\n}\n'
    let caught: unknown
    try {
      applySearchReplaceBlocks(content, [{ search: 'const y = 1', replace: 'const y = 2' }])
    } catch (error) {
      caught = error
    }
    expect(caught).toBeInstanceOf(FsError)
    expect((caught as FsError).code).toBe('FS_AMBIGUOUS_EDIT')
  })

  it('throws FS_EDIT_NOT_FOUND when a block matches nothing even fuzzily', () => {
    const content = 'one\ntwo\nthree\n'
    let caught: unknown
    try {
      applySearchReplaceBlocks(content, [{ search: 'nonexistent line', replace: 'x' }])
    } catch (error) {
      caught = error
    }
    expect(caught).toBeInstanceOf(FsError)
    expect((caught as FsError).code).toBe('FS_EDIT_NOT_FOUND')
  })
})
