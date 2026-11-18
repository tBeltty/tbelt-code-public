/** The page stylesheet reads only theme tokens ui-theme defines, so no value silently falls back. */

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')
const page = read('../src/client/WebSearchCard.module.css')
/** The global sheets that define `--dsw-*` tokens: the design palette and the base scale. */
const theme = ['design-platform.css', 'base.css'].map(name => read(`../../ui-theme/src/styles/${name}`)).join('\n')

describe('WebSearchCard stylesheet', () => {
  it('references only defined theme tokens', () => {
    const used = [...new Set([...page.matchAll(/var\((--dsw-[\w-]+)/g)].map(match => match[1]!))]
    expect(used.length).toBeGreaterThan(0)
    expect(used.filter(token => !theme.includes(`${token}:`))).toEqual([])
  })
})
