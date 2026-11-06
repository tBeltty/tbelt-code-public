/** Sidebar alignment of the Settings launcher row. */
import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'

const css = readFileSync(new URL('../src/client/AccountMenu.module.css', import.meta.url), 'utf8')

it('aligns the wide Settings row with the sidebar rows at a 32px total height', () => {
  const wide = css.match(/\.trigger:not\(\[data-collapsed='true'\]\)\s*\{([^}]+)\}/)?.[1]
  expect(wide).toContain('box-sizing: border-box;')
  expect(wide).toContain('height: 32px;')
  expect(wide).toContain('padding: 6px calc(var(--dsh-sidebar-row-padding) - var(--dsh-sidebar-paint-inset));')
  expect(wide).toContain('border-inline: var(--dsh-sidebar-paint-inset) solid transparent;')
  expect(wide).toContain('background-clip: padding-box;')
})

it('keeps the collapsed Settings button a 36px square', () => {
  expect(css).toMatch(/\.trigger\[data-collapsed='true'\]\s*\{[^}]*width: 36px;[^}]*height: 36px;/)
})
