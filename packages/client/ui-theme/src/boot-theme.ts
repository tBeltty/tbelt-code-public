/**
 * Theme bootstrap row for the browser's pre-plugin interval. Each index
 * render embeds the current durable built-in preference, font sizes, and
 * font-family lists. Head CSS colors the document canvas before script
 * execution; the body script installs the palette selector and font variables
 * that the client presenters adopt.
 */

import type { IndexInjection } from '@deepseek-ai/dsh-host-webserver'
import {
  DEFAULT_FONT_SIZES, DEFAULT_PREFERENCE, FONT_ROLES, FONT_SIZE_SPECS, fontFamilyVariable, normalizeFontFamily,
  type FontFamilies, type FontSizes, type ThemePreference,
} from './theme-settings.ts'

const DARK_BACKGROUND = '#101010'
const LIGHT_BACKGROUND = '#fafafa'
const SYSTEM_DARK_QUERY = '(prefers-color-scheme: dark)'

function canvasCss(scheme: 'light' | 'dark'): string {
  const background = scheme === 'dark' ? DARK_BACKGROUND : LIGHT_BACKGROUND
  return `:root{color-scheme:${scheme}}body{background-color:${background};--dsh-boot-bg:${background}}`
}

/**
 * CSS that colors the document canvas before any script executes. `light` and
 * `dark` fix the canvas; `system` starts from the dark canvas and switches to
 * the light one under a light OS scheme, so neither scheme flashes the other.
 */
function bootThemeStyle(preference: ThemePreference): string {
  if (preference === 'light') return canvasCss('light')
  if (preference === 'dark') return canvasCss('dark')
  return `${canvasCss('dark')}@media (prefers-color-scheme: light){${canvasCss('light')}}`
}

/**
 * Build the body script that installs the palette selector and font variables.
 * `system` reads `prefers-color-scheme` and falls back to dark when
 * `matchMedia` is unavailable.
 */
function bootThemeBodyScript(preference: ThemePreference, fontSizes: FontSizes, fontFamilies: FontFamilies): string {
  const sizes = FONT_ROLES.map(role =>
    `\n  document.body.style.setProperty(${JSON.stringify(FONT_SIZE_SPECS[role].variable)}, ${JSON.stringify(`${fontSizes[role]}px`)})`).join('')
  const families = FONT_ROLES.flatMap((kind) => {
    const list = normalizeFontFamily(fontFamilies[kind])
    return list === '' ? [] : [`\n  document.body.style.setProperty(${JSON.stringify(fontFamilyVariable(kind))}, ${JSON.stringify(list)})`]
  }).join('')
  return `(() => {
  const preference = ${JSON.stringify(preference)}
  const dark = preference === 'system'
    ? typeof matchMedia !== 'function' || matchMedia(${JSON.stringify(SYSTEM_DARK_QUERY)}).matches
    : preference === 'dark'
  document.documentElement.dataset.dsThemeSource = preference
  document.body.toggleAttribute('data-ds-dark-theme', dark)${sizes}${families}
})()`
}

/**
 * Theme bootstrap rows: head CSS colors the document canvas before
 * first paint, then the body script installs the palette selector and font
 * size and font families before the shell mount and module script.
 * @param preference - Current Host-backed built-in preference; picks the
 * boot palette and is published as `data-ds-theme-source`.
 * @param fontSizes - Current Host-backed font sizes in px by role.
 * @param fontFamilies - Current Host-backed font lists; each is normalized before embedding.
 * @returns head and body script rows in execution order.
 */
export function bootThemeInjections(
  preference: ThemePreference = DEFAULT_PREFERENCE,
  fontSizes: FontSizes = DEFAULT_FONT_SIZES,
  fontFamilies: FontFamilies = { text: '', code: '', terminal: '' },
): IndexInjection[] {
  return [
    { kind: 'style', text: bootThemeStyle(preference) },
    { kind: 'script', placement: 'body', text: bootThemeBodyScript(preference, fontSizes, fontFamilies) },
  ]
}
