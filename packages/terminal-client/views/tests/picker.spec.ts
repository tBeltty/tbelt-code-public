import { describe, expect, it } from 'vitest'
import { createStyle, stripAnsi } from '../src/ansi.ts'
import { textWidth } from '../src/width.ts'
import { createMultiPicker, createPicker, PICKER_DONE, PICKER_ROWS, reducePicker, renderPicker, visibleItems } from '../src/picker.ts'
import type { PickerItem, PickerState } from '../src/picker.ts'
import type { Key, KeyName } from '../src/keys.ts'

const style = createStyle(false)
const key = (name: KeyName): Key => ({ type: 'key', name })
const text = (value: string): Key => ({ type: 'text', text: value })
const items: PickerItem[] = [
  { value: 'a', label: 'Fix the build', detail: 'abc · ~/app' },
  { value: 'b', label: 'Write docs', detail: 'def · ~/site', current: true },
  { value: 'c', label: 'Refactor', detail: 'ghi' },
]
const press = (state: PickerState, ...keys: Key[]): PickerState => keys.reduce((acc, next) => reducePicker(acc, next).state, state)

describe('picker reducer', () => {
  it('opens on the current item', () => {
    expect(createPicker('t', items).index).toBe(1)
    expect(createPicker('t', items.slice(0, 1)).index).toBe(0)
  })

  it('moves with wrap-around', () => {
    const open = createPicker('t', items)
    expect(press(open, key('down')).index).toBe(2)
    expect(press(open, key('down'), key('down')).index).toBe(0)
    expect(press(open, key('up'), key('up')).index).toBe(2)
    expect(press(open, key('tab')).index).toBe(2)
  })

  it('filters by every word in the label or detail and resets the highlight', () => {
    const open = createPicker('t', items)
    const filtered = press(open, text('~/app'), text(' fix'))
    expect(visibleItems(filtered).map(item => item.value)).toEqual(['a'])
    expect(filtered.index).toBe(0)
    expect(visibleItems(press(open, { type: 'paste', text: 'DOCS\nsite' })).map(item => item.value)).toEqual(['b'])
    expect(visibleItems(press(open, text('zzz')))).toEqual([])
    const bare = createPicker('t', [{ value: 'x', label: 'Only label' }])
    expect(visibleItems(press(bare, text('label')))).toHaveLength(1)
  })

  it('edits the query', () => {
    const open = press(createPicker('t', items), text('ab'), text('é'))
    expect(press(open, key('backspace')).query).toBe('ab')
    expect(press(open, key('kill-to-start')).query).toBe('')
    expect(press(open, key('left')).query).toBe('abé')
  })

  it('selects the highlighted item and ignores Enter with no match', () => {
    const open = createPicker('t', items)
    expect(reducePicker(open, key('enter')).effect).toEqual({ type: 'select', item: items[1] })
    expect(reducePicker(press(open, key('down')), key('newline')).effect).toEqual({ type: 'select', item: items[2] })
    const none = press(open, text('zzz'))
    expect(reducePicker(none, key('enter')).effect).toBeUndefined()
    expect(press(none, key('down')).index).toBe(0)
    expect(press(none, key('up')).index).toBe(0)
  })

  it('cancels on Escape, Ctrl+C and Ctrl+D', () => {
    const open = createPicker('t', items)
    for (const name of ['escape', 'interrupt', 'eof'] as const) {
      expect(reducePicker(open, key(name)).effect).toEqual({ type: 'cancel' })
    }
  })
})

describe('renderPicker', () => {
  it('draws the title, the query, the rows with marks and the keys', () => {
    const frame = renderPicker(style, createPicker('Choose', items), 60)
    expect(frame.lines[0]).toBe('Choose')
    expect(frame.lines[1]).toBe('› ')
    expect(frame.lines[2]).toBe('   Fix the build  abc · ~/app')
    expect(frame.lines[3]).toBe('❯* Write docs  def · ~/site')
    expect(frame.lines.at(-1)).toContain('Esc cancel')
    expect(frame.cursor).toEqual({ row: 1, column: 2 })
  })

  it('says nothing matches', () => {
    const frame = renderPicker(style, press(createPicker('t', items), text('zz')), 60)
    expect(frame.lines[2]).toBe('  Nothing matches.')
    expect(frame.cursor.column).toBe(4)
  })

  it('scrolls to keep the highlight in view and shows only the visible window', () => {
    const many = Array.from({ length: 20 }, (_, index): PickerItem => ({ value: String(index), label: `item ${String(index)}` }))
    const state = press(createPicker('t', many), ...Array.from({ length: 15 }, () => key('down')))
    const rows = renderPicker(style, state, 60).lines.slice(2, -1).map(stripAnsi)
    expect(rows).toHaveLength(PICKER_ROWS)
    expect(rows.some(row => row.startsWith('❯'))).toBe(true)
    expect(rows.join('\n')).toContain('item 15')
    expect(rows.join('\n')).not.toContain('item 0\n')
  })

  it('truncates rows to the width and drops the detail when it does not fit', () => {
    const narrow = renderPicker(style, createPicker('A very long title for a narrow terminal', items), 12)
    for (const line of narrow.lines) expect(textWidth(stripAnsi(line))).toBeLessThanOrEqual(12)
    expect(narrow.lines[2]).toBe('   Fix the ')
  })

  it('strips control characters from titles, labels and details', () => {
    const hostile = createPicker('t\u001B[2J', [{ value: 'x', label: 'l\u001B[31m', detail: 'd\u0007' }])
    for (const line of renderPicker(style, hostile, 40).lines) expect(line).not.toMatch(/[\u0007\u001B]/u)
  })
})

describe('multiple choice picker', () => {
  const open = () => createMultiPicker('t', items, { checked: ['b'], doneLabel: count => `Continue ${count}` })

  it('lists the confirming row first and starts on it', () => {
    const state = open()
    expect(state.index).toBe(0)
    expect(visibleItems(state)[0]).toEqual({ value: PICKER_DONE, label: 'Continue 1' })
    expect(createMultiPicker('t', items, { doneLabel: () => 'go' }).checks?.checked.size).toBe(0)
  })

  it('ticks and unticks with Enter and confirms in list order', () => {
    const toggled = press(open(), key('down'), key('enter'), key('down'), key('newline'))
    expect(toggled.checks?.checked.has('a')).toBe(true)
    expect(toggled.checks?.checked.has('b')).toBe(false)
    const confirm = reducePicker({ ...toggled, index: 0 }, key('enter'))
    expect(confirm.effect).toEqual({ type: 'confirm', values: ['a'] })
  })

  it('skips the confirming row when filtering and keeps it with no match', () => {
    const state = press(open(), text('docs'))
    expect(state.index).toBe(1)
    const none = press(open(), text('zzz'))
    expect(none.index).toBe(0)
    expect(visibleItems(none)).toHaveLength(1)
  })

  it('draws ticks and the multiple-choice key hint', () => {
    const lines = renderPicker(style, open(), 60).lines.map(stripAnsi)
    expect(lines.some(line => line.includes('x Write docs'))).toBe(true)
    expect(lines.some(line => line.includes('· Fix the build'))).toBe(true)
    expect(lines.some(line => line.includes('Continue 1'))).toBe(true)
    expect(lines.at(-1)).toContain('Enter tick')
  })

  it('cancels with Escape', () => {
    expect(reducePicker(open(), key('escape')).effect).toEqual({ type: 'cancel' })
  })
})
