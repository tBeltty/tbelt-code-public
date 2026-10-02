/**
 * Real, non-mocked Tree-sitter parsing and symbol extraction against
 * purpose-built fixture files under `tests/fixtures/`, kept deterministic
 * against this repo's own growing source tree.
 */

import { describe, expect, it } from 'vitest'
import { join } from 'node:path'
import { extractFileSymbols } from '../src/extract.ts'
import { languageForPath, parseSource } from '../src/tree-sitter.ts'
import { extractSymbols } from '../src/symbols.ts'

const fixture = (name: string): string => join(import.meta.dirname, 'fixtures', name)

describe('extractFileSymbols', () => {
  it('matches the exact known symbol list for a class, function, interface, and import', async () => {
    const result = await extractFileSymbols(fixture('known-symbols.ts'))

    expect(result.diagnostic).toBeUndefined()
    expect(result.language).toBe('typescript')
    expect(result.symbols).toEqual([
      { kind: 'import', name: 'node:fs/promises', line: 1 },
      { kind: 'interface', name: 'Widget', line: 3 },
      { kind: 'class', name: 'WidgetFactory', line: 8 },
      { kind: 'function', name: 'describeWidget', line: 14 },
    ])
  })

  it('returns an empty symbol list with no diagnostic for a file with no recognized declarations', async () => {
    const result = await extractFileSymbols(fixture('no-symbols.ts'))

    expect(result.diagnostic).toBeUndefined()
    expect(result.symbols).toEqual([])
  })

  it('skips a file with an unsupported extension without parsing it', async () => {
    const result = await extractFileSymbols(fixture('unsupported.py'))

    expect(result.diagnostic).toBe('unsupported-language')
    expect(result.language).toBeUndefined()
    expect(result.symbols).toEqual([])
  })
})

describe('languageForPath', () => {
  it.each([
    ['a/b.ts', 'typescript'],
    ['a/b.mts', 'typescript'],
    ['a/b.cts', 'typescript'],
    ['a/b.tsx', 'tsx'],
    ['a/b.js', 'javascript'],
    ['a/b.mjs', 'javascript'],
    ['a/b.cjs', 'javascript'],
    ['a/b.jsx', 'javascript'],
    ['A/B.TS', 'typescript'],
  ] as const)('maps %s to %s', (path, expected) => {
    expect(languageForPath(path)).toBe(expected)
  })

  it('returns undefined for an unrecognized extension', () => {
    expect(languageForPath('a/b.py')).toBeUndefined()
    expect(languageForPath('a/b')).toBeUndefined()
  })
})

describe('parseSource / extractSymbols', () => {
  it('extracts a JavaScript file (no interfaces in the JS grammar)', async () => {
    const source = 'import { readFile } from \'node:fs\'\nexport class Thing {}\nexport function run() { return 1 }\nvoid readFile\n'
    const parsed = await parseSource('sample.js', source)

    expect('diagnostic' in parsed).toBe(false)
    if ('diagnostic' in parsed) throw new Error('unreachable')
    expect(parsed.language).toBe('javascript')
    expect(extractSymbols(parsed.tree)).toEqual([
      { kind: 'import', name: 'node:fs', line: 1 },
      { kind: 'class', name: 'Thing', line: 2 },
      { kind: 'function', name: 'run', line: 3 },
    ])
  })

  it('extracts a TSX file, recognizing the same declaration kinds as TypeScript', async () => {
    const source = 'export interface Props {\n  label: string\n}\nexport function Widget(props: Props) {\n  return <div>{props.label}</div>\n}\n'
    const parsed = await parseSource('sample.tsx', source)

    expect('diagnostic' in parsed).toBe(false)
    if ('diagnostic' in parsed) throw new Error('unreachable')
    expect(extractSymbols(parsed.tree).map(symbol => symbol.kind)).toEqual(['interface', 'function'])
  })

  it('skips a syntax error instead of extracting from a malformed tree', async () => {
    // Deliberately invalid TypeScript, passed inline rather than as a
    // `tests/fixtures/*.ts` file: this repo's `tsconfig.host.json` typechecks
    // every `packages/*/*/tests/**/*.ts` file, so a checked-in file this
    // broken would fail `pnpm run build:lib:host` before any test runs.
    const parsed = await parseSource('broken.ts', 'export class Broken {\n  method( {\n')

    expect(parsed).toEqual({ diagnostic: 'syntax-error' })
  })

  it('records an abstract class under the class kind', async () => {
    const parsed = await parseSource('sample.ts', 'export abstract class Base {}\n')

    if ('diagnostic' in parsed) throw new Error('unreachable')
    expect(extractSymbols(parsed.tree)).toEqual([{ kind: 'class', name: 'Base', line: 1 }])
  })
})
