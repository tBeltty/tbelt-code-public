import { describe, expect, it } from 'vitest'
import { createStyle, stripAnsi } from '../src/ansi.ts'
import { createPrompt, reducePrompt, renderPrompt } from '../src/prompt.ts'
import type { PromptState } from '../src/prompt.ts'
import type { Key, KeyName } from '../src/keys.ts'

const style = createStyle(false)
const key = (name: KeyName): Key => ({ type: 'key', name })
const text = (value: string): Key => ({ type: 'text', text: value })
const type = (state: PromptState, ...keys: Key[]): PromptState => keys.reduce((acc, next) => reducePrompt(acc, next).state, state)

describe('prompt reducer', () => {
  it('starts with the given text and the cursor after it, on one line', () => {
    const open = createPrompt('Key', { initial: 'a\nb', hint: 'h', secret: true })
    expect(open.input.text).toBe('a b')
    expect(open.input.cursor).toBe(3)
    expect(open.secret).toBe(true)
    expect(createPrompt('Key').secret).toBe(false)
  })

  it('edits the answer and sends it trimmed', () => {
    const open = type(createPrompt('Name'), text(' hi '), { type: 'paste', text: 'a\r\nb' })
    expect(open.input.text).toBe(' hi ab')
    expect(reducePrompt(open, key('enter')).effect).toEqual({ type: 'submit', text: 'hi ab' })
    expect(reducePrompt(createPrompt('Name'), key('enter')).effect).toEqual({ type: 'submit', text: '' })
  })

  it('leaves on Escape, Ctrl+C and Ctrl+D on an empty line', () => {
    for (const name of ['escape', 'interrupt', 'eof'] as const) {
      expect(reducePrompt(createPrompt('x'), key(name)).effect).toEqual({ type: 'cancel' })
    }
    const typed = type(createPrompt('x'), text('ab'))
    expect(reducePrompt(typed, key('eof')).effect).toBeUndefined()
  })

  it('ignores keys that only a multi-line composer uses', () => {
    const open = createPrompt('x', { initial: 'ab' })
    for (const name of ['up', 'down', 'tab', 'newline', 'clear-screen'] as const) {
      expect(reducePrompt(open, key(name))).toEqual({ state: open })
    }
  })
})

describe('prompt rendering', () => {
  it('draws the label, the hint, the answer and the keys', () => {
    const frame = renderPrompt(style, createPrompt('API key', { hint: 'Empty keeps it', initial: 'abc' }), 40)
    expect(frame.lines.map(stripAnsi)).toEqual(['API key', 'Empty keeps it', '› abc', '  Enter confirm · Esc cancel'])
    expect(frame.cursor).toEqual({ row: 2, column: 5 })
  })

  it('masks a secret and leaves out a missing hint', () => {
    const frame = renderPrompt(style, createPrompt('API key', { initial: 'sk-1', secret: true }), 40)
    expect(frame.lines.map(stripAnsi).join('\n')).toContain('› ****')
    expect(frame.lines.map(stripAnsi).join('\n')).not.toContain('sk-1')
    expect(frame.lines).toHaveLength(3 + 0)
  })
})
