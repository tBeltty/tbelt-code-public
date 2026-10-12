// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { DropOverlay } from '../src/DropOverlay.tsx'

afterEach(cleanup)

describe('DropOverlay', () => {
  it('portals the invitation with its title and limits desc to the body', () => {
    const view = render(
      <DropOverlay disabled={false} labels={{ title: 'Arrastra imágenes aquí para añadirlas', desc: 'Hasta 20, de 5MB cada una' }} />,
    )
    const overlay = view.getByRole('status')
    expect(overlay.parentElement).toBe(document.body)
    expect(overlay.textContent).toContain('Arrastra imágenes aquí para añadirlas')
    expect(overlay.textContent).toContain('Hasta 20, de 5MB cada una')
  })

  it('omits the desc line when none is resolved', () => {
    const view = render(<DropOverlay disabled={false} labels={{ title: 'Arrastra imágenes aquí para añadirlas' }} />)
    expect(view.getByRole('status').textContent).toBe('Arrastra imágenes aquí para añadirlas')
  })

  it('drops the desc and switches the illustration while disabled', () => {
    const enabled = render(
      <DropOverlay disabled={false} labels={{ title: 'Arrastra', desc: 'Límite' }} />,
    )
    const enabledSvg = enabled.getByRole('status').querySelector('svg')!.innerHTML
    enabled.unmount()
    const disabled = render(
      <DropOverlay disabled labels={{ title: 'Ahora no se pueden añadir imágenes', desc: 'Límite' }} />,
    )
    const overlay = disabled.getByRole('status')
    expect(overlay.textContent).toBe('Ahora no se pueden añadir imágenes')
    expect(overlay.querySelector('svg')!.innerHTML).not.toBe(enabledSvg)
  })
})
