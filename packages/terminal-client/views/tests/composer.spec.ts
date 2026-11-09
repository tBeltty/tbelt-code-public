import { describe, expect, it } from 'vitest'
import {
  EMPTY_COMPOSER, completeToken, composerWithHistory, reduceComposer, renderComposer, type ComposerState,
} from '../src/composer.ts'
import { decodeKeys } from '../src/keys.ts'

/** Feed raw terminal input through the reducer. */
function type(input: string, start: ComposerState = EMPTY_COMPOSER): { state: ComposerState; effects: unknown[] } {
  let state = start
  const effects: unknown[] = []
  for (const key of decodeKeys(input)) {
    const step = reduceComposer(state, key)
    state = step.state
    if (step.effect !== undefined) effects.push(step.effect)
  }
  return { state, effects }
}

const at = (text: string, cursor: number): ComposerState => ({ ...EMPTY_COMPOSER, text, cursor })

describe('reduceComposer editing', () => {
  it('inserts typed and pasted text', () => {
    expect(type('ab').state).toMatchObject({ text: 'ab', cursor: 2 })
    expect(type('\u001B[200~x\ny\u001B[201~').state.text).toBe('x\ny')
  })

  it('deletes by grapheme with backspace and delete', () => {
    expect(type('a👨‍👩‍👧\u007F').state.text).toBe('a')
    expect(type('\u007F').state.text).toBe('')
    expect(type('\u001B[3~', at('a👨‍👩‍👧', 1)).state.text).toBe('a')
    expect(type('\u001B[3~', at('ab', 2)).state.text).toBe('ab')
  })

  it('moves by grapheme, word and line', () => {
    expect(type('\u001B[D', at('aé', 3)).state.cursor).toBe(1)
    expect(type('\u001B[D', at('ab', 0)).state.cursor).toBe(0)
    expect(type('\u001B[C', at('éa', 0)).state.cursor).toBe(2)
    expect(type('\u001B[C', at('ab', 2)).state.cursor).toBe(2)
    expect(type('\u001Bb', at('one  two', 8)).state.cursor).toBe(5)
    expect(type('\u001Bb', at('one  two', 5)).state.cursor).toBe(0)
    expect(type('\u001Bf', at('one  two', 0)).state.cursor).toBe(3)
    expect(type('\u001Bf', at('one  two', 3)).state.cursor).toBe(8)
    expect(type('\u0001', at('ab\ncd', 4)).state.cursor).toBe(3)
    expect(type('\u0005', at('ab\ncd', 3)).state.cursor).toBe(5)
    expect(type('\u0005', at('ab\ncd', 0)).state.cursor).toBe(2)
  })

  it('kills text', () => {
    expect(type('\u000B', at('ab\ncd', 1)).state.text).toBe('a\ncd')
    expect(type('\u0015', at('ab\ncd', 4)).state.text).toBe('ab\nd')
    expect(type('\u0017', at('one two', 7)).state.text).toBe('one ')
  })

  it('inserts two spaces for Tab and ignores Escape', () => {
    expect(type('\t').state.text).toBe('  ')
    expect(type('\u001B').state).toEqual(EMPTY_COMPOSER)
  })

  it('adds a line with Alt+Enter and with a trailing backslash', () => {
    expect(type('a\u001B\rb').state.text).toBe('a\nb')
    expect(type('a\\\rb').state.text).toBe('a\nb')
  })
})

describe('reduceComposer submission', () => {
  it('submits the trimmed text, clears the editor and remembers it once', () => {
    const first = type('  hello  \r')
    expect(first.effects).toEqual([{ type: 'submit', text: 'hello' }])
    expect(first.state).toEqual({ ...EMPTY_COMPOSER, history: ['hello'] })
    expect(type('hello\r', first.state).state.history).toEqual(['hello'])
    expect(type('other\r', first.state).state.history).toEqual(['hello', 'other'])
  })

  it('ignores Enter on blank text', () => {
    expect(type('  \r').effects).toEqual([])
  })

  it('reports interrupt, clear-screen and eof', () => {
    expect(type('\u0003\u000C\u0004').effects).toEqual([{ type: 'interrupt' }, { type: 'clear-screen' }, { type: 'eof' }])
  })

  it('treats Ctrl+D on text as delete', () => {
    const { state, effects } = type('\u0004', at('ab', 0))
    expect(effects).toEqual([])
    expect(state.text).toBe('b')
  })
})

describe('reduceComposer up and down', () => {
  it('moves between lines keeping the column', () => {
    expect(type('\u001B[A', at('abcd\nef', 7)).state.cursor).toBe(2)
    expect(type('\u001B[A', at('ab\ncdef', 6)).state.cursor).toBe(2)
    expect(type('\u001B[B', at('ab\ncdef', 1)).state.cursor).toBe(4)
    expect(type('\u001B[B', at('abcd\nef', 3)).state.cursor).toBe(7)
  })

  it('browses sent messages from the first and last line', () => {
    const start = composerWithHistory(['one', 'two'])
    const draft = type('wip', start).state
    const up1 = type('\u001B[A', draft).state
    expect(up1).toMatchObject({ text: 'two', browsing: 1, draft: 'wip' })
    const up2 = type('\u001B[A', up1).state
    expect(up2).toMatchObject({ text: 'one', browsing: 0, draft: 'wip' })
    expect(type('\u001B[A', up2).state).toEqual(up2)
    const down1 = type('\u001B[B', up2).state
    expect(down1).toMatchObject({ text: 'two', browsing: 1 })
    expect(type('\u001B[B', down1).state).toMatchObject({ text: 'wip', browsing: undefined, draft: '' })
  })

  it('does nothing without history and ignores Down when not browsing', () => {
    expect(type('\u001B[A').state).toEqual(EMPTY_COMPOSER)
    expect(type('\u001B[B').state).toEqual(EMPTY_COMPOSER)
  })

  it('leaves browsing when the text is edited', () => {
    const up = type('\u001B[A', composerWithHistory(['one'])).state
    expect(type('x', up).state).toMatchObject({ text: 'onex', browsing: undefined })
  })
})

const dim = (text: string): string => `<${text}>`

describe('renderComposer', () => {
  const render = (state: ComposerState, columns = 20): ReturnType<typeof renderComposer> =>
    renderComposer(state, { columns, prompt: '› ', placeholder: 'Type here', dim })

  it('shows the placeholder while empty with the cursor after the prompt', () => {
    expect(render(EMPTY_COMPOSER)).toEqual({ lines: ['› <Type here>'], cursor: { row: 0, column: 2 } })
  })

  it('truncates a placeholder wider than the room', () => {
    expect(render(EMPTY_COMPOSER, 8).lines).toEqual(['› <Type h>'])
  })

  it('indents continuation lines and places the cursor', () => {
    expect(render(at('ab\ncd', 4))).toEqual({ lines: ['› ab', '  cd'], cursor: { row: 1, column: 3 } })
  })

  it('wraps long lines and puts a cursor at a wrap point on the next row', () => {
    const frame = render(at('abcdefgh', 4), 6)
    expect(frame.lines).toEqual(['› abcd', '  efgh'])
    expect(frame.cursor).toEqual({ row: 1, column: 2 })
    expect(render(at('abcdefgh', 5), 6).cursor).toEqual({ row: 1, column: 3 })
    expect(render(at('abcdefgh', 8), 6).cursor).toEqual({ row: 1, column: 6 })
  })
})

describe('Tab after an @ token', () => {
  it('still inserts two spaces anywhere else', () => {
    expect(type('\t').state.text).toBe('  ')
    expect(type('mail me at a@b.c\t').state.text).toBe('mail me at a@b.c  ')
  })

  it('asks the caller to complete the token that ends at the cursor', () => {
    const { state, effects } = type('read @src/ma\t')
    expect(state.text).toBe('read @src/ma')
    expect(effects).toEqual([{ type: 'complete', token: { prefix: '@src/ma', query: 'src/ma', quoted: false } }])
    expect(type('first\nread @"my no\t').effects).toEqual([{ type: 'complete', token: { prefix: '@"my no', query: 'my no', quoted: true } }])
  })

  it('puts a completion in place of the token and leaves the cursor after it', () => {
    const token = { prefix: '@sr', query: 'sr', quoted: false }
    const state = completeToken(at('read @sr now', 8), token, '@src/a.ts ')
    expect(state).toMatchObject({ text: 'read @src/a.ts  now', cursor: 15 })
  })

  it('leaves the text alone when the cursor no longer follows the token', () => {
    const token = { prefix: '@sr', query: 'sr', quoted: false }
    expect(completeToken(at('read @xx', 8), token, '@src/')).toEqual(at('read @xx', 8))
    expect(completeToken(at('@s', 2), { prefix: '@some-longer', query: 'some-longer', quoted: false }, 'x')).toEqual(at('@s', 2))
  })
})
