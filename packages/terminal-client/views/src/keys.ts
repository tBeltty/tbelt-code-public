/**
 * Keyboard input: decodes the bytes a terminal sends in raw mode into the few
 * key events the composer and the approval prompt understand.
 * @module @deepseek-ai/dsh-terminal-views/keys
 */

/** Keys with a meaning in the terminal client. */
export type KeyName =
  | 'enter' | 'newline' | 'tab' | 'escape' | 'backspace' | 'delete'
  | 'left' | 'right' | 'up' | 'down' | 'home' | 'end' | 'word-left' | 'word-right'
  | 'kill-line' | 'kill-to-start' | 'delete-word' | 'clear-screen' | 'interrupt' | 'eof'

/** One decoded input event. */
export type Key =
  | { readonly type: 'key'; readonly name: KeyName }
  | { readonly type: 'text'; readonly text: string }
  | { readonly type: 'paste'; readonly text: string }

/** Sequence a terminal sends before pasted text once bracketed paste is enabled. */
export const PASTE_START = '\u001B[200~'
/** Sequence that ends pasted text. */
export const PASTE_END = '\u001B[201~'
/** Sequences that turn bracketed paste on and off. */
export const BRACKETED_PASTE_ON = '\u001B[?2004h'
export const BRACKETED_PASTE_OFF = '\u001B[?2004l'

const CONTROL_KEYS: Readonly<Record<string, KeyName>> = {
  '\r': 'enter',
  '\n': 'newline',
  '\t': 'tab',
  '\u007F': 'backspace',
  '\b': 'backspace',
  '\u0001': 'home',
  '\u0002': 'left',
  '\u0003': 'interrupt',
  '\u0004': 'eof',
  '\u0005': 'end',
  '\u0006': 'right',
  '\u000B': 'kill-line',
  '\u000C': 'clear-screen',
  '\u000E': 'down',
  '\u0010': 'up',
  '\u0015': 'kill-to-start',
  '\u0017': 'delete-word',
}

const CSI_LETTERS: Readonly<Record<string, KeyName>> = {
  A: 'up', B: 'down', C: 'right', D: 'left', H: 'home', F: 'end',
}

const CSI_TILDES: Readonly<Record<string, KeyName>> = {
  '1': 'home', '7': 'home', '3': 'delete', '4': 'end', '8': 'end',
}

/** Modifier parameters (xterm numbering) for Shift, Alt and Ctrl. */
const WORD_MODIFIERS: ReadonlySet<string> = new Set(['3', '5'])

/**
 * Meaning of one complete CSI sequence.
 * @param params - the parameter bytes, such as `1;5` .
 * @param final - the final byte.
 * @returns the key it stands for, or undefined for a sequence this client ignores.
 */
function csiKey(params: string, final: string): KeyName | undefined {
  const [first = '', second = ''] = params.split(';')
  if (final === 'u') {
    // Kitty and CSI-u keyboards send Enter as 13 with a modifier: Shift or Alt means a new line.
    if (first === '13') return second === '' || second === '1' ? 'enter' : 'newline'
    return first === '9' ? 'tab' : undefined
  }
  if (final === '~') {
    // xterm modifyOtherKeys: 27;<modifier>;13 is a modified Enter.
    if (first === '27' && params.endsWith(';13')) return 'newline'
    return CSI_TILDES[first]
  }
  const key = CSI_LETTERS[final]
  if (key === 'left' || key === 'right') {
    if (WORD_MODIFIERS.has(second)) return key === 'left' ? 'word-left' : 'word-right'
  }
  return key
}

/**
 * Decode one escape sequence that starts at `offset`.
 * @param input - the received data.
 * @param offset - index of the ESC byte.
 * @returns the consumed length and the key, when the sequence carries one.
 */
function decodeEscape(input: string, offset: number): { length: number; key?: Key } {
  const next = input[offset + 1]
  if (next === '[') {
    let end = offset + 2
    while (end < input.length && !/[@-~]/u.test(input.charAt(end))) end++
    const final = input.charAt(end)
    const name = final === '' ? undefined : csiKey(input.slice(offset + 2, end), final)
    return { length: end + 1 - offset, ...name === undefined ? {} : { key: { type: 'key', name } } }
  }
  if (next === 'O') {
    const name = CSI_LETTERS[input.charAt(offset + 2)]
    return { length: 3, ...name === undefined ? {} : { key: { type: 'key', name } } }
  }
  if (next === '\r' || next === '\n') return { length: 2, key: { type: 'key', name: 'newline' } }
  if (next === 'b') return { length: 2, key: { type: 'key', name: 'word-left' } }
  if (next === 'f') return { length: 2, key: { type: 'key', name: 'word-right' } }
  if (next === '\u007F') return { length: 2, key: { type: 'key', name: 'delete-word' } }
  return { length: 1, key: { type: 'key', name: 'escape' } }
}

/**
 * Decode terminal input into key events.
 * @param input - data received from standard input in one read; sequences are not split across reads.
 * @returns the events in order. Pasted text arrives as one `paste` event with line breaks normalized to `\n`.
 */
export function decodeKeys(input: string): Key[] {
  const keys: Key[] = []
  let text = ''
  const flush = (): void => {
    if (text !== '') keys.push({ type: 'text', text })
    text = ''
  }
  let offset = 0
  while (offset < input.length) {
    if (input.startsWith(PASTE_START, offset)) {
      flush()
      const start = offset + PASTE_START.length
      const stop = input.indexOf(PASTE_END, start)
      const end = stop === -1 ? input.length : stop
      keys.push({ type: 'paste', text: input.slice(start, end).replace(/\r\n?/gu, '\n') })
      offset = stop === -1 ? input.length : stop + PASTE_END.length
      continue
    }
    const char = input.charAt(offset)
    if (char === '\u001B') {
      flush()
      const { length, key } = decodeEscape(input, offset)
      if (key !== undefined) keys.push(key)
      offset += length
      continue
    }
    const name = CONTROL_KEYS[char]
    if (name !== undefined) {
      flush()
      keys.push({ type: 'key', name })
    } else if (char >= ' ' && char !== '\u007F') {
      text += char
    }
    offset++
  }
  flush()
  return keys
}
