// @vitest-environment jsdom
/** The theme bootstrap injection row and the resulting pre-plugin browser theme. */
import { runInNewContext } from 'node:vm'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { bootThemeInjections } from '../src/boot-theme.ts'
import type { FontSizes, ThemePreference } from '../src/theme-settings.ts'

const DARK_ATTRIBUTE = 'data-ds-dark-theme'

function mockSystemDark(matches: boolean): void {
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches }) as MediaQueryList))
}

function executeBootstrap(preference?: ThemePreference, fontSizes?: FontSizes): void {
  for (const row of bootThemeInjections(preference, fontSizes)) {
    if (row.kind === 'script') runInNewContext(row.text, { document, matchMedia: globalThis.matchMedia })
  }
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  delete document.documentElement.dataset.dsThemeSource
  document.body.removeAttribute(DARK_ATTRIBUTE)
  for (const name of ['--dsh-content-font-size', '--dsh-code-font-size', '--dsh-terminal-font-size']) document.body.style.removeProperty(name)
  for (const kind of ['text', 'code', 'terminal']) document.body.style.removeProperty(`--dsh-font-family-${kind}`)
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

  it('writes the durable font sizes and their defaults', () => {
    mockSystemDark(false)
    executeBootstrap('light', { text: 22, code: 15, terminal: 18 })
    expect(document.body.style.getPropertyValue('--dsh-content-font-size')).toBe('22px')
    expect(document.body.style.getPropertyValue('--dsh-code-font-size')).toBe('15px')
    expect(document.body.style.getPropertyValue('--dsh-terminal-font-size')).toBe('18px')
    executeBootstrap('light')
    expect(document.body.style.getPropertyValue('--dsh-content-font-size')).toBe('14px')
    expect(document.body.style.getPropertyValue('--dsh-code-font-size')).toBe('11px')
    expect(document.body.style.getPropertyValue('--dsh-terminal-font-size')).toBe('13px')
  })

  it('writes normalized durable font lists and leaves empty lists unset', () => {
    mockSystemDark(false)
    const [, body] = bootThemeInjections('light', undefined, { text: 'Inter', code: '', terminal: 'MesloLGS NF</script>, monospace' })
    if (body?.kind !== 'script') throw new Error('theme body bootstrap row is not a script')
    expect(body.text).not.toContain('<')
    runInNewContext(body.text, { document, matchMedia: globalThis.matchMedia })
    expect(document.body.style.getPropertyValue('--dsh-font-family-text')).toBe('"Inter"')
    expect(document.body.style.getPropertyValue('--dsh-font-family-code')).toBe('')
    expect(document.body.style.getPropertyValue('--dsh-font-family-terminal')).toBe('"MesloLGS NF/script", monospace')
  })
})
