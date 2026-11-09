import { describe, expect, it } from 'vitest'
import { PASTE_END, PASTE_START, decodeKeys } from '../src/keys.ts'

const names = (input: string): unknown[] => decodeKeys(input).map(key => (key.type === 'key' ? key.name : key))

describe('decodeKeys', () => {
  it('groups printable characters into one text event', () => {
    expect(names('hi there')).toEqual([{ type: 'text', text: 'hi there' }])
  })

  it('decodes control keys', () => {
    expect(names('\r\n\t\u007F\b\u0001\u0002\u0003\u0004\u0005\u0006\u000B\u000C\u000E\u0010\u0015\u0017'))
      .toEqual(['enter', 'newline', 'tab', 'backspace', 'backspace', 'home', 'left', 'interrupt', 'eof', 'end', 'right',
        'kill-line', 'clear-screen', 'down', 'up', 'kill-to-start', 'delete-word'])
  })

  it('drops unknown control bytes and keeps text around keys', () => {
    expect(names('a\u0007b\r')).toEqual([{ type: 'text', text: 'ab' }, 'enter'])
  })

  it('decodes CSI and SS3 cursor keys', () => {
    expect(names('\u001B[A\u001B[B\u001B[C\u001B[D\u001B[H\u001B[F\u001BOA\u001BOH')).toEqual(['up', 'down', 'right', 'left', 'home', 'end', 'up', 'home'])
    expect(names('\u001B[1~\u001B[7~\u001B[3~\u001B[4~\u001B[8~')).toEqual(['home', 'home', 'delete', 'end', 'end'])
  })

  it('decodes word movement with Alt or Ctrl', () => {
    expect(names('\u001B[1;3D\u001B[1;5C\u001B[1;2D\u001Bb\u001Bf')).toEqual(['word-left', 'word-right', 'left', 'word-left', 'word-right'])
    expect(names('\u001B[1;3A')).toEqual(['up'])
  })

  it('decodes modified Enter forms', () => {
    expect(names('\u001B[13u\u001B[13;1u\u001B[13;2u\u001B[27;2;13~\u001B\r\u001B\n')).toEqual(['enter', 'enter', 'newline', 'newline', 'newline', 'newline'])
    expect(names('\u001B[9u\u001B[65u')).toEqual(['tab'])
  })

  it('maps Alt+Backspace to delete-word and a lone Escape to escape', () => {
    expect(names('\u001B\u007F')).toEqual(['delete-word'])
    expect(names('\u001B')).toEqual(['escape'])
    expect(names('\u001Bx')).toEqual(['escape', { type: 'text', text: 'x' }])
  })

  it('ignores unknown sequences and tolerates truncated ones', () => {
    expect(names('\u001B[99Z\u001BOZ')).toEqual([])
    expect(names('\u001B[1;')).toEqual([])
  })

  it('decodes bracketed paste with normalized line breaks', () => {
    expect(names(`a${PASTE_START}x\r\ny\rz${PASTE_END}b`)).toEqual([
      { type: 'text', text: 'a' }, { type: 'paste', text: 'x\ny\nz' }, { type: 'text', text: 'b' },
    ])
    expect(names(`${PASTE_START}open`)).toEqual([{ type: 'paste', text: 'open' }])
  })
})
