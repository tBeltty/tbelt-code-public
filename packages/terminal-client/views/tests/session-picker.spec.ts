import { describe, expect, it } from 'vitest'
import { ageText, sessionItems } from '../src/session-picker.ts'
import type { SessionChoice } from '../src/session-picker.ts'

const NOW = 10 * 24 * 3_600_000
const row = (id: string, extra: Partial<SessionChoice> = {}): SessionChoice =>
  ({ id, blank: false, updatedAt: NOW - 60_000, ...extra })

describe('ageText', () => {
  it('says how long ago', () => {
    expect(ageText(NOW - 5_000, NOW)).toBe('just now')
    expect(ageText(NOW + 5_000, NOW)).toBe('just now')
    expect(ageText(NOW - 5 * 60_000, NOW)).toBe('5m ago')
    expect(ageText(NOW - 3 * 3_600_000, NOW)).toBe('3h ago')
    expect(ageText(NOW - 2 * 24 * 3_600_000, NOW)).toBe('2d ago')
  })
})

describe('sessionItems', () => {
  it('lists newest first with short ids, directories and ages', () => {
    const items = sessionItems([
      row('session-aaaa1111bbbb', { title: ' Fix the build ', cwd: '/home/me/app', updatedAt: NOW - 3_600_000 }),
      row('session-cccc2222dddd', { updatedAt: NOW - 120_000 }),
    ], { currentId: 'session-cccc2222dddd', home: '/home/me', now: NOW })
    expect(items).toEqual([
      { value: 'session-cccc2222dddd', label: 'Untitled session', detail: 'cccc2222 · 2m ago', current: true },
      { value: 'session-aaaa1111bbbb', label: 'Fix the build', detail: 'aaaa1111 · ~/app · 1h ago', current: false },
    ])
  })

  it('hides subagent sessions and blank ones except the open session', () => {
    const items = sessionItems([
      row('a', { origin: 'subagent' }),
      row('b', { blank: true }),
      row('c', { blank: true }),
      row('d', { title: '   ' }),
    ], { currentId: 'c', now: NOW })
    expect(items.map(item => item.value).sort()).toEqual(['c', 'd'])
    expect(items.every(item => item.label === 'Untitled session')).toBe(true)
  })
})
