import { describe, expect, it } from 'vitest'
import { todoProgress } from '../src/index.ts'

describe('todoProgress', () => {
  it('counts done items and names the first active one', () => {
    expect(todoProgress([
      { content: 'a', status: 'completed' },
      { content: 'b', status: 'in_progress' },
      { content: 'c', status: 'pending' },
    ])).toEqual({ done: 1, total: 3, activeContent: 'b', activeExtra: 0 })
  })

  it('reports how many more tasks run in parallel', () => {
    expect(todoProgress([
      { content: 'a', status: 'in_progress' },
      { content: 'b', status: 'in_progress' },
      { content: 'c', status: 'in_progress' },
    ])).toEqual({ done: 0, total: 3, activeContent: 'a', activeExtra: 2 })
  })

  it('keeps the counts when the first active item has no usable name', () => {
    expect(todoProgress([{ status: 'in_progress' }, { content: 'x', status: 'in_progress' }]))
      .toEqual({ done: 0, total: 2, activeContent: null, activeExtra: 0 })
    expect(todoProgress([{ content: '  ', status: 'in_progress' }]).activeContent).toBeNull()
    expect(todoProgress([{ content: 42, status: 'in_progress' }]).activeContent).toBeNull()
  })

  it('has no active item when everything is done', () => {
    expect(todoProgress([{ content: 'a', status: 'completed' }]))
      .toEqual({ done: 1, total: 1, activeContent: null, activeExtra: 0 })
  })
})
