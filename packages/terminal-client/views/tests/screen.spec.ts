import { describe, expect, it } from 'vitest'
import { Screen } from '../src/screen.ts'

const frame = (lines: string[], row: number, column: number) => ({ lines, cursor: { row, column } })

function setup(): { screen: Screen; out: string[] } {
  const out: string[] = []
  return { screen: new Screen({ write: chunk => out.push(chunk) }), out }
}

describe('Screen', () => {
  it('draws the composer and leaves the cursor in it', () => {
    const { screen, out } = setup()
    screen.show(frame(['› a', '  b'], 0, 3))
    expect(out.join('')).toBe('› a\r\n  b\u001B[1A\r\u001B[3C')
  })

  it('draws a cursor on the last row at column zero without movement', () => {
    const { screen, out } = setup()
    screen.show(frame(['x'], 0, 0))
    expect(out.join('')).toBe('x\r')
  })

  it('erases the composer before printing and redraws it below', () => {
    const { screen, out } = setup()
    screen.show(frame(['› a', '  b'], 1, 3))
    out.length = 0
    screen.print('line\n')
    expect(out.join('')).toBe('\r\u001B[1A\u001B[Jline\n› a\r\n  b\r\u001B[3C')
  })

  it('erases without moving up when the cursor is on the first row', () => {
    const { screen, out } = setup()
    screen.show(frame(['› a'], 0, 3))
    out.length = 0
    screen.show(undefined)
    expect(out.join('')).toBe('\r\u001B[J')
  })

  it('prints plain text when no composer is shown and ignores empty text', () => {
    const { screen, out } = setup()
    screen.print('')
    screen.print('hi\n')
    expect(out).toEqual(['hi\n'])
  })

  it('clears the screen and redraws', () => {
    const { screen, out } = setup()
    screen.show(frame(['› '], 0, 2))
    out.length = 0
    screen.clear()
    expect(out.join('')).toBe('\u001B[2J\u001B[3J\u001B[H› \r\u001B[2C')
  })

  it('releases the composer', () => {
    const { screen, out } = setup()
    screen.show(frame(['› '], 0, 2))
    screen.release()
    out.length = 0
    screen.print('after\n')
    expect(out).toEqual(['after\n'])
  })
})
