import { describe, expect, it } from 'vitest'
import {
  pastedTextExtension, pastedTextFile, pastedTextOf, pastedTextPreview,
} from '../src/client/input/pasted-text.ts'

describe('pastedTextExtension', () => {
  it('names a valid JSON object or array .json', () => {
    expect(pastedTextExtension('{"a": [1, 2]}')).toBe('json')
    expect(pastedTextExtension('  [1, 2, 3]\n')).toBe('json')
  })

  it('falls back to the line heuristics when braces do not parse as JSON', () => {
    expect(pastedTextExtension('{ not json }\nconst a = 1')).toBe('txt')
    expect(pastedTextExtension('[link](x) is not json')).toBe('md')
  })

  it('names mostly-code text .txt and prose or Markdown .md', () => {
    expect(pastedTextExtension('import fs from "fs"\nconst a = 1\nfunction f() {\n  return a\n}\n')).toBe('txt')
    expect(pastedTextExtension('# Title\n\n- one\n- two\n\nSome prose here.')).toBe('md')
    expect(pastedTextExtension('just a long log line\nanother log line\nand one more')).toBe('md')
    expect(pastedTextExtension('')).toBe('md')
  })
})

describe('pasted text files', () => {
  it('wraps text in a uniquely named file and remembers the source text', async () => {
    const first = pastedTextFile('hello')
    const second = pastedTextFile('{"a":1}')
    expect(first.name).toMatch(/^pasted-text-\d+\.md$/)
    expect(second.name).toMatch(/^pasted-text-\d+\.json$/)
    expect(first.name).not.toBe(second.name)
    expect(await first.text()).toBe('hello')
    expect(pastedTextOf(first)).toBe('hello')
    expect(pastedTextOf(new File(['hello'], 'hello.md'))).toBeUndefined()
  })
})

describe('pastedTextPreview', () => {
  it('keeps the first three non-empty lines and cuts long ones', () => {
    expect(pastedTextPreview('a  \r\n\r\nb\nc\nd')).toBe('a\nb\nc')
    expect(pastedTextPreview('z'.repeat(130))).toBe(`${'z'.repeat(120)}…`)
    expect(pastedTextPreview('')).toBe('')
  })
})
