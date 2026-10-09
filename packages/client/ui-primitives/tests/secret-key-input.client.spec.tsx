// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SecretKeyInput } from '../src/SecretKeyInput.tsx'

afterEach(cleanup)

const labels = {
  input: 'API key',
  placeholder: 'Enter your API key',
  configured: 'API key configured',
  replace: 'Replace API',
  cancel: 'Keep current key',
}

/** Holds the draft the way an owning form does, so the control sees real prop changes. */
function Harness(props: { configured: boolean; lockedLabel?: string; onChange?: (value: string) => void }) {
  const [value, setValue] = useState('')
  return (
    <>
      <SecretKeyInput
        value={value}
        onChange={(next) => { setValue(next); props.onChange?.(next) }}
        configured={props.configured}
        lockedLabel={props.lockedLabel}
        labels={labels}
      />
      <button type="button" onClick={() => { setValue('') }}>save</button>
    </>
  )
}

describe('SecretKeyInput', () => {
  it('shows only the input when no key is stored', () => {
    render(<Harness configured={false} />)

    expect(screen.getByLabelText('API key')).toHaveProperty('type', 'password')
    expect(screen.queryByRole('button', { name: labels.replace })).toBeNull()
    expect(screen.queryByRole('button', { name: labels.cancel })).toBeNull()
  })

  it('shows a stored key as a status row and opens the input on Replace', () => {
    render(<Harness configured />)
    expect(screen.getByText(labels.configured)).toBeTruthy()
    expect(screen.queryByLabelText('API key')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: labels.replace }))

    expect(screen.getByLabelText('API key')).toHaveProperty('value', '')
  })

  it('keeps the stored key when Replace is cancelled', () => {
    const onChange = vi.fn()
    render(<Harness configured onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: labels.replace }))
    fireEvent.change(screen.getByLabelText('API key'), { target: { value: 'sk-new' } })

    fireEvent.click(screen.getByRole('button', { name: labels.cancel }))

    expect(onChange).toHaveBeenLastCalledWith('')
    expect(screen.getByText(labels.configured)).toBeTruthy()
  })

  it('returns to the status row when the owner clears the draft after a save', () => {
    render(<Harness configured />)
    fireEvent.click(screen.getByRole('button', { name: labels.replace }))
    fireEvent.change(screen.getByLabelText('API key'), { target: { value: 'sk-new' } })

    fireEvent.click(screen.getByRole('button', { name: 'save' }))

    expect(screen.getByText(labels.configured)).toBeTruthy()
    expect(screen.queryByLabelText('API key')).toBeNull()
  })

  it('stays on the input while the user empties it by hand', () => {
    render(<Harness configured />)
    fireEvent.click(screen.getByRole('button', { name: labels.replace }))
    const input = screen.getByLabelText('API key')
    fireEvent.change(input, { target: { value: 'a' } })

    fireEvent.change(input, { target: { value: '' } })

    expect(screen.getByLabelText('API key')).toBeTruthy()
  })

  it('shows the locked notice instead of any control', () => {
    render(<Harness configured lockedLabel="Provided by the launch environment" />)

    expect(screen.getByText('Provided by the launch environment')).toBeTruthy()
    expect(screen.queryByLabelText('API key')).toBeNull()
    expect(screen.queryByRole('button', { name: labels.replace })).toBeNull()
  })
})
