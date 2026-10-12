// @vitest-environment jsdom
/** The theme bootstrap injection row and the resulting pre-plugin browser theme. */
import { runInNewContext } from 'node:vm'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { bootThemeInjections } from '../src/boot-theme.ts'
import type { ThemePreference } from '../src/theme-settings.ts'

const DARK_ATTRIBUTE = 'data-ds-dark-theme'

function mockSystemDark(matches: boolean): void {
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches }) as MediaQueryList))
}

function executeBootstrap(preference?: ThemePreference, fontSize?: number): void {
  for (const row of bootThemeInjections(preference, fontSize)) {
    if (row.kind === 'script') runInNewContext(row.text, { document, matchMedia: globalThis.matchMedia })
  }
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  delete document.documentElement.dataset.dsThemeSource
  document.body.removeAttribute(DARK_ATTRIBUTE)
  document.body.style.removeProperty('--dsh-content-font-size')
})

const DARK_CANVAS = ':root{color-scheme:dark}body{background-color:#101010;--dsh-boot-bg:#101010}'
const LIGHT_CANVAS = ':root{color-scheme:light}body{background-color:#fafafa;--dsh-boot-bg:#fafafa}'

function headText(preference: ThemePreference): string {
  const [head] = bootThemeInjections(preference)
  if (head?.kind !== 'style') throw new Error('theme head bootstrap row is not a style')
  return head.text
}

describe('theme bootstrap row', () => {
  it('emits a style row and a body script row', () => {
    const [head, body] = bootThemeInjections('dark')
    expect(head).toMatchObject({ kind: 'style' })
    expect(body).toMatchObject({ kind: 'script', placement: 'body' })
  })

  it('colors the canvas from a fixed preference regardless of the OS scheme', () => {
    expect(headText('dark')).toBe(DARK_CANVAS)
    expect(headText('light')).toBe(LIGHT_CANVAS)
  })

  it('starts the `system` canvas dark and switches it under a light OS scheme', () => {
    expect(headText('system')).toBe(`${DARK_CANVAS}@media (prefers-color-scheme: light){${LIGHT_CANVAS}}`)
  })

  it.each([
    ['light', true, false],
    ['light', false, false],
    ['dark', true, true],
    ['dark', false, true],
    ['system', true, true],
    ['system', false, false],
  ] as const)('preference=%s with OS dark=%s sets the dark body attribute to %s', (preference, osDark, dark) => {
    mockSystemDark(osDark)
    executeBootstrap(preference)
    expect(document.documentElement.dataset.dsThemeSource).toBe(preference)
    expect(document.body.hasAttribute(DARK_ATTRIBUTE)).toBe(dark)
  })

  it('defaults to dark and resolves `system` as dark without matchMedia', () => {
    vi.stubGlobal('matchMedia', undefined)
    executeBootstrap()
    expect(document.body.hasAttribute(DARK_ATTRIBUTE)).toBe(true)
    document.body.removeAttribute(DARK_ATTRIBUTE)
    executeBootstrap('system')
    expect(document.body.hasAttribute(DARK_ATTRIBUTE)).toBe(true)
  })

  it('writes the durable content font size and defaults it to 14px', () => {
    mockSystemDark(false)
    executeBootstrap('light', 22)
    expect(document.body.style.getPropertyValue('--dsh-content-font-size')).toBe('22px')
    executeBootstrap('light')
    expect(document.body.style.getPropertyValue('--dsh-content-font-size')).toBe('14px')
  })
})
