import { describe, expect, it } from 'vitest'
import { diffHunks, diffSummary, diffSummaryParts, diffTotals } from '../src/diff-lines.ts'

describe('diffTotals', () => {
  it('counts only changed lines, not shared context', () => {
    expect(diffTotals([{ path: 'a.ts', oldText: 'one\ntwo\nthree\n', newText: 'one\n2\nthree\nfour\n' }]))
      .toEqual({ added: 2, removed: 1 })
  })

  it('counts a created file as all added and a cleared file as all removed', () => {
    expect(diffTotals([{ path: 'new.ts', oldText: null, newText: 'a\nb\n' }])).toEqual({ added: 2, removed: 0 })
    expect(diffTotals([{ path: 'old.ts', oldText: 'a\nb\nc', newText: '' }])).toEqual({ added: 0, removed: 3 })
  })

  it('treats a trailing newline as a terminator and keeps interior blank lines', () => {
    expect(diffTotals([{ path: 'a', oldText: null, newText: 'a\n\nb\n' }]).added).toBe(3)
  })

  it('counts both sides as replaced when the edit search exceeds its bound', () => {
    const before = Array.from({ length: 400 }, (_, index) => `old ${String(index)}`).join('\n')
    const after = Array.from({ length: 400 }, (_, index) => `new ${String(index)}`).join('\n')
    expect(diffTotals([{ path: 'big', oldText: before, newText: after }])).toEqual({ added: 400, removed: 400 })
  })
})

describe('diffHunks', () => {
  it('returns patch lines prefixed by their role', () => {
    const [hunk] = diffHunks({ path: 'a', oldText: 'x\ny\n', newText: 'x\nz\n' })
    expect(hunk?.lines).toEqual([' x', '-y', '+z'])
  })
})

describe('diffSummary', () => {
  it('adds the number of distinct files to the counts', () => {
    expect(diffSummary([
      { path: 'a.ts', oldText: 'a', newText: 'b' },
      { path: 'a.ts', oldText: 'c', newText: 'd' },
      { path: 'b.ts', oldText: null, newText: 'e' },
    ])).toEqual({ added: 3, removed: 2, files: 2 })
  })
})

describe('diffSummaryParts', () => {
  it('draws added first in the added tone and removed in the removed tone', () => {
    expect(diffSummaryParts({ added: 12, removed: 3 })).toEqual([
      { tone: 'added', text: '+12' },
      { tone: 'removed', text: '-3' },
    ])
  })

  it('omits a zero count and returns nothing for a change without lines', () => {
    expect(diffSummaryParts({ added: 0, removed: 4 })).toEqual([{ tone: 'removed', text: '-4' }])
    expect(diffSummaryParts({ added: 5, removed: 0 })).toEqual([{ tone: 'added', text: '+5' }])
    expect(diffSummaryParts({ added: 0, removed: 0 })).toEqual([])
  })
})
