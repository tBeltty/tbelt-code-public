/**
 * Toast stacking as CSS text: jsdom has no layout, so these read the z-index
 * declarations that keep the banner above every dialog layer.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

function zIndexes(path: string): number[] {
  const css = readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8')
  return [...css.matchAll(/z-index:\s*(\d+)/g)].map(match => Number(match[1]))
}

const DIALOG_LAYERS = [
  '../src/Modal.module.css',
  '../src/ImageLightbox.module.css',
  '../../ui-settings-general/src/client/SettingsRoot.module.css',
  '../../ui-settings-account/src/client/PlatformOverlay.module.css',
]

describe('Toast.module.css stacking', () => {
  it('stacks above every dialog layer', () => {
    const [toast] = zIndexes('../src/Toast.module.css')
    for (const layer of DIALOG_LAYERS) {
      expect(toast, layer).toBeGreaterThan(Math.max(...zIndexes(layer)))
    }
  })

  it('moves to the top edge while a modal dialog is open', () => {
    const css = readFileSync(fileURLToPath(new URL('../src/Toast.module.css', import.meta.url)), 'utf8')
    expect(css).toMatch(/:global\(body\):has\(\[aria-modal='true'\]\) \.toast \{\s*top: 12px;/)
  })
})
