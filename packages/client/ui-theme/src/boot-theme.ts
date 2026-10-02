/**
 * Theme bootstrap row for the browser's pre-plugin interval. Each index
 * render embeds the current durable built-in preference and content font size.
 * Head CSS colors the document canvas before script execution; the body script
 * installs the palette selector and font size that the client presenters adopt.
 */

import type { IndexInjection } from '@deepseek-ai/dsh-host-webserver'
import { DEFAULT_FONT_SIZE, DEFAULT_PREFERENCE, type ThemePreference } from './theme-settings.ts'

const DARK_BACKGROUND = '#151517'

/**
 * CSS that colors the document canvas before any script executes.
 * Dark-only (P6-T2): the stored preference and `prefers-color-scheme` no
 * longer branch the boot canvas — it is always the dark background, so
 * there is never a light flash regardless of preference or OS scheme.
 */
function bootThemeStyle(): string {
  return `:root{color-scheme:dark}body{background-color:${DARK_BACKGROUND};--dsh-boot-bg:${DARK_BACKGROUND}}`
}

/**
 * Build the body script that installs the palette selector and content size.
 * Dark-only (P6-T2): the palette selector is unconditionally set; preference
 * no longer participates in the resolution.
 */
function bootThemeBodyScript(preference: ThemePreference, fontSize: number): string {
  return `(() => {
  const preference = ${JSON.stringify(preference)}
  document.documentElement.dataset.dsThemeSource = preference
  document.body.toggleAttribute('data-ds-dark-theme', true)
  document.body.style.setProperty('--dsh-content-font-size', ${JSON.stringify(`${fontSize}px`)})
})()`
}

/**
 * Theme bootstrap rows: head CSS colors the document canvas before
 * first paint, then the body script installs the palette selector and font
 * size before the shell mount and module script.
 * @param preference - Current Host-backed built-in preference. Dark-only
 * (P6-T2): it no longer picks the palette; it is only published as
 * `data-ds-theme-source` for presenters that report the stored choice.
 * @param fontSize - Current Host-backed content font size in px.
 * @returns head and body script rows in execution order.
 */
export function bootThemeInjections(
  preference: ThemePreference = DEFAULT_PREFERENCE,
  fontSize: number = DEFAULT_FONT_SIZE,
): IndexInjection[] {
  return [
    { kind: 'style', text: bootThemeStyle() },
    { kind: 'script', placement: 'body', text: bootThemeBodyScript(preference, fontSize) },
  ]
}
