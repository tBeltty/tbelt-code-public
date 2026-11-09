import { describe, expect, it } from 'vitest'
import { createStyle, stripAnsi, supportsColor } from '../src/ansi.ts'

describe('createStyle', () => {
  it('wraps text in SGR codes when color is on', () => {
    const style = createStyle(true)
    expect(style.bold('a')).toBe('\u001B[1ma\u001B[22m')
    expect(style.dim('a')).toBe('\u001B[2ma\u001B[22m')
    expect(style.red('a')).toBe('\u001B[31ma\u001B[39m')
    expect(style.green('a')).toBe('\u001B[32ma\u001B[39m')
    expect(style.yellow('a')).toBe('\u001B[33ma\u001B[39m')
    expect(style.cyan('a')).toBe('\u001B[36ma\u001B[39m')
  })

  it('returns text unchanged when color is off or the text is empty', () => {
    expect(createStyle(false).red('a')).toBe('a')
    expect(createStyle(true).red('')).toBe('')
  })
})

describe('supportsColor', () => {
  it('follows NO_COLOR, FORCE_COLOR and the terminal', () => {
    expect(supportsColor({ NO_COLOR: '1', FORCE_COLOR: '1' }, true)).toBe(false)
    expect(supportsColor({ FORCE_COLOR: '1' }, false)).toBe(true)
    expect(supportsColor({ FORCE_COLOR: '0' }, true)).toBe(false)
    expect(supportsColor({ FORCE_COLOR: 'false' }, true)).toBe(false)
    expect(supportsColor({ NO_COLOR: '', FORCE_COLOR: '' }, true)).toBe(true)
    expect(supportsColor({}, false)).toBe(false)
    expect(supportsColor({ TERM: 'dumb' }, true)).toBe(false)
    expect(supportsColor({ TERM: 'xterm' }, true)).toBe(true)
  })
})

describe('stripAnsi', () => {
  it('removes CSI and OSC sequences', () => {
    expect(stripAnsi('\u001B[31mred\u001B[0m \u001B]0;title\u0007ok \u001B]8;;x\u001B\\link')).toBe('red ok link')
  })
})
