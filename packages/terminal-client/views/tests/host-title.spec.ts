import { describe, expect, it } from 'vitest'
import { hostTitle, ORCA_TITLE_MARKER, titleSequence, WORKING_FRAMES } from '../src/host-title.ts'

const facts = { activity: 'idle', frame: 0, label: 'app', marker: false } as const

describe('hostTitle', () => {
  it('rests with the star Orca reads as idle and names the session', () => {
    expect(hostTitle(facts)).toBe('\u2726 app')
  })

  it('shows a braille frame while a turn runs, and cycles through the frames', () => {
    const [first, second] = WORKING_FRAMES as [string, string]
    expect(hostTitle({ ...facts, activity: 'working', frame: 0 })).toBe(`${first} app`)
    expect(hostTitle({ ...facts, activity: 'working', frame: 1 })).toBe(`${second} app`)
    expect(hostTitle({ ...facts, activity: 'working', frame: 2 })).toBe(`${first} app`)
    expect(first).toMatch(/[\u2800-\u28FF]/u)
  })

  it('marks a question that waits for the person', () => {
    expect(hostTitle({ ...facts, activity: 'waiting' })).toBe('! app')
  })

  it('puts the Orca marker between the prefix and the label', () => {
    expect(hostTitle({ ...facts, marker: true })).toBe(`\u2726 ${ORCA_TITLE_MARKER} app`)
    expect(hostTitle({ ...facts, marker: true, label: '' })).toBe(`\u2726 ${ORCA_TITLE_MARKER}`)
  })

  it('removes control characters from the label and cuts it to 80 characters', () => {
    expect(hostTitle({ ...facts, label: 'fix\u0007 the\u001B]0;x\nbuild' })).toBe('\u2726 fix the ]0;x build')
    expect(hostTitle({ ...facts, label: 'x'.repeat(200) })).toBe(`\u2726 ${'x'.repeat(80)}`)
    expect(hostTitle({ ...facts, label: '👩‍💻'.repeat(100) })).toBe(`\u2726 ${'👩‍💻'.repeat(80)}`)
    expect(hostTitle({ ...facts, label: '日本語'.repeat(40) })).toBe(`\u2726 ${'日本語'.repeat(26)}日本`)
  })
})

describe('titleSequence', () => {
  it('sets the title with OSC 0 ended by BEL', () => {
    expect(titleSequence('hello')).toBe('\u001B]0;hello\u0007')
  })

  it('hands the title back with an empty string and never lets the text end the sequence', () => {
    expect(titleSequence('')).toBe('\u001B]0;\u0007')
    expect(titleSequence('a\u0007b\u001B\\c')).toBe('\u001B]0;a b \\c\u0007')
  })
})
