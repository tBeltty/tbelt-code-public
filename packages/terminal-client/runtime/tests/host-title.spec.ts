import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HostTitle } from '../src/host-title.ts'

const SET = (title: string): string => `\u001B]0;${title}\u0007`

describe('HostTitle', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  const make = (marker = false) => {
    const writes: string[] = []
    return { writes, title: new HostTitle((chunk) => { writes.push(chunk) }, { marker, frameIntervalMs: 500 }) }
  }

  it('writes the title once and again only when it changes', () => {
    const { writes, title } = make()
    title.update('idle', 'app')
    title.update('idle', 'app')
    title.update('idle', 'renamed')
    expect(writes).toEqual([SET('\u2726 app'), SET('\u2726 renamed')])
  })

  it('animates the spinner while the agent works and stops when it rests', () => {
    const { writes, title } = make()
    title.update('working', 'app')
    title.update('working', 'app')
    vi.advanceTimersByTime(1000)
    expect(writes).toEqual([SET('\u2802 app'), SET('\u2810 app'), SET('\u2802 app')])
    title.update('idle', 'app')
    vi.advanceTimersByTime(5000)
    expect(writes.at(-1)).toBe(SET('\u2726 app'))
    expect(writes).toHaveLength(4)
  })

  it('starts the next turn from the first frame and carries the marker', () => {
    const { writes, title } = make(true)
    title.update('working', 'app')
    vi.advanceTimersByTime(500)
    title.update('waiting', 'app')
    title.update('working', 'app')
    expect(writes).toEqual([SET('\u2802 \u{1F40B} app'), SET('\u2810 \u{1F40B} app'), SET('! \u{1F40B} app'), SET('\u2802 \u{1F40B} app')])
  })

  it('hands the title back on release and leaves no timer running', () => {
    const { writes, title } = make()
    title.update('working', 'app')
    title.release()
    vi.advanceTimersByTime(5000)
    expect(writes).toEqual([SET('\u2802 app'), SET('')])
    expect(vi.getTimerCount()).toBe(0)
    title.release()
    expect(writes.at(-1)).toBe(SET(''))
  })

  it('writes a title again after release', () => {
    const { writes, title } = make()
    title.update('idle', 'app')
    title.release()
    title.update('idle', 'app')
    expect(writes).toEqual([SET('\u2726 app'), SET(''), SET('\u2726 app')])
  })
})
