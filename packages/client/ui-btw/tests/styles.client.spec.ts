/**
 * Dialog stylesheet contract, asserted against the CSS text on disk.
 *
 * A `--dsw-*` name the theme never declares fails silently: the sheet parses,
 * the classes attach, and the declaration is dropped at computed-value time.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const sheet = readFileSync(fileURLToPath(new URL('../src/client/BtwDialog.module.css', import.meta.url)), 'utf8')
const tokens = readdirSync(fileURLToPath(new URL('../../ui-theme/src/styles/', import.meta.url)))
  .filter(name => name.endsWith('.css'))
  .map(name => readFileSync(fileURLToPath(new URL(`../../ui-theme/src/styles/${name}`, import.meta.url)), 'utf8'))
  .join('\n')

describe('BtwDialog theme styles', () => {
  it('names only theme variables the token sheet defines', () => {
    const named = [...sheet.matchAll(/var\((--(?:dsw|dsh|ds)-[a-z0-9-]+)/g)].map(match => match[1])
    expect(named.length).toBeGreaterThan(3)
    const undeclared = [...new Set(named)].filter(token => !tokens.includes(`  ${String(token)}:`))
    expect(undeclared).toEqual([])
  })

  it('never falls back to a literal colour', () => {
    expect(sheet).not.toMatch(/var\(--dsw-[a-z0-9-]+\s*,\s*(?:#|rgb|rgba|hsl|hsla)/)
  })

  it('closes every block, so no rule is swallowed by the one above it', () => {
    const bare = sheet.replace(/\/\*[\s\S]*?\*\//g, '')
    expect((bare.match(/\}/g) ?? []).length).toBe((bare.match(/\{/g) ?? []).length)
  })

  it('caps the scrolling thread so the footer stays on screen', () => {
    expect(sheet).toMatch(/\.thread \{[^}]*max-height:[^}]*overflow-y:\s*auto/)
  })
})
