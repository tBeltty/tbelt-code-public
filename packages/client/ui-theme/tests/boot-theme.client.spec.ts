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

describe('theme bootstrap row (dark-only, P6-T2)', () => {
  it('colors the body with dark head CSS and sets the dark body attribute', () => {
    mockSystemDark(false)
    const [head, body] = bootThemeInjections('dark')
    expect(head).toMatchObject({ kind: 'style' })
    expect(body).toMatchObject({ kind: 'script', placement: 'body' })
    if (head?.kind !== 'style') throw new Error('theme head bootstrap row is not a style')
    expect(head.text).toBe(':root{color-scheme:dark}body{background-color:#151517;--dsh-boot-bg:#151517}')
    expect(document.body.hasAttribute(DARK_ATTRIBUTE)).toBe(false)
    if (body?.kind !== 'script') throw new Error('theme body bootstrap row is not a script')
    runInNewContext(body.text, { document, matchMedia: globalThis.matchMedia })
    expect(document.documentElement.dataset.dsThemeSource).toBe('dark')
    expect(document.body.hasAttribute(DARK_ATTRIBUTE)).toBe(true)
  })

  it('ignores a `light` preference and a dark-preferring OS alike — always dark', () => {
    mockSystemDark(true)
    const [head] = bootThemeInjections('light')
    if (head?.kind !== 'style') throw new Error('theme head bootstrap row is not a style')
    expect(head.text).toBe(':root{color-scheme:dark}body{background-color:#151517;--dsh-boot-bg:#151517}')
    executeBootstrap('light')
    expect(document.body.hasAttribute(DARK_ATTRIBUTE)).toBe(true)
  })

  it.each([
    ['light', true],
    ['dark', true],
    ['system', true],
  ] as const)('preference=%s always resolves to the dark body palette', (preference, dark) => {
    executeBootstrap(preference)
    expect(document.body.hasAttribute(DARK_ATTRIBUTE)).toBe(dark)
  })

  it('emits no `prefers-color-scheme` media query in the head CSS', () => {
    const [head] = bootThemeInjections('system')
    if (head?.kind !== 'style') throw new Error('theme head bootstrap row is not a style')
    expect(head.text).not.toContain('prefers-color-scheme')
    expect(head.text).toBe(':root{color-scheme:dark}body{background-color:#151517;--dsh-boot-bg:#151517}')
  })

  it('defaults to dark regardless of matchMedia availability', () => {
    vi.stubGlobal('matchMedia', undefined)
    executeBootstrap()
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
