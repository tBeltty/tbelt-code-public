import { describe, expect, it } from 'vitest'
import { FsError } from '@deepseek-ai/dsh-fs'
import { applySearchReplaceBlocks } from '../src/apply.ts'

describe('applySearchReplaceBlocks', () => {
  it('applies a single block correctly', () => {
    const result = applySearchReplaceBlocks('const x = 1\nconst y = 2\n', [
      { search: 'const x = 1', replace: 'const x = 100' },
    ])
    expect(result.content).toBe('const x = 100\nconst y = 2\n')
    expect(result.fuzzyBlockIndexes).toEqual([])
  })

  it('applies multiple blocks in sequence, each against the previous result', () => {
    const content = 'alpha\nbeta\ngamma\n'
    const result = applySearchReplaceBlocks(content, [
      { search: 'alpha', replace: 'ALPHA' },
      { search: 'ALPHA\nbeta', replace: 'ALPHA\nBETA' },
      { search: 'gamma', replace: 'GAMMA' },
    ])
    expect(result.content).toBe('ALPHA\nBETA\nGAMMA\n')
    expect(result.fuzzyBlockIndexes).toEqual([])
  })

  it('throws FS_EDIT_NOT_FOUND when a block search text does not appear', () => {
    let caught: unknown
    try {
      applySearchReplaceBlocks('one\ntwo\nthree\n', [{ search: 'missing', replace: 'x' }])
    } catch (error) {
      caught = error
    }
    expect(caught).toBeInstanceOf(FsError)
    expect((caught as FsError).code).toBe('FS_EDIT_NOT_FOUND')
  })

  it('throws FS_AMBIGUOUS_EDIT with both line numbers when a block search text matches twice', () => {
    const content = 'dup\nfiller\ndup\n'
    let caught: unknown
    try {
      applySearchReplaceBlocks(content, [{ search: 'dup', replace: 'x' }])
    } catch (error) {
      caught = error
    }
    expect(caught).toBeInstanceOf(FsError)
    expect((caught as FsError).code).toBe('FS_AMBIGUOUS_EDIT')
    expect((caught as FsError).message).toContain('1')
    expect((caught as FsError).message).toContain('3')
  })

  it('does not mutate content already committed by earlier blocks when a later block fails', () => {
    const content = 'alpha\nbeta\n'
    expect(() =>
      applySearchReplaceBlocks(content, [
        { search: 'alpha', replace: 'ALPHA' },
        { search: 'nonexistent', replace: 'x' },
      ]),
    ).toThrow(FsError)
  })
})
