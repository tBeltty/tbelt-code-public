// SecretKeyInput: write-only API-key control shared by every place a key is entered.

import { useEffect, useRef, useState } from 'react'
import { Button } from './Button.tsx'
import css from './SecretKeyInput.module.css'
import { StateDot } from './StateDot.tsx'

/** Copy the owning form supplies; the control ships no strings of its own. */
export interface SecretKeyInputLabels {
  /** Accessible name of the input. */
  input: string
  /** Placeholder while no key is stored. */
  placeholder: string
  /** Status text while a key is stored, e.g. "API key configured". */
  configured: string
  /** Button that opens the input to rotate the stored key. */
  replace: string
  /** Button that closes the input again, discarding the typed draft. */
  cancel: string
}

/** Props of {@link SecretKeyInput}. */
export interface SecretKeyInputProps {
  /** Input id, so an external `<label htmlFor>` can name the control. */
  id?: string | undefined
  /** Typed draft; empty means "write nothing". */
  value: string
  /** Stage a new draft. */
  onChange: (value: string) => void
  /** Whether the Host reports a stored key. The key itself never reaches the page. */
  configured: boolean
  /** Copy for the control. */
  labels: SecretKeyInputLabels
  /** Message shown instead of the control when the key is supplied by the launch environment. */
  lockedLabel?: string | undefined
  /** Whether the current draft fails validation. */
  invalid?: boolean | undefined
  /** Whether a key is mandatory, which applies to the input only. */
  required?: boolean | undefined
  /** Focus the input on mount. */
  autoFocus?: boolean | undefined
  /** Whether editing is disabled. */
  disabled?: boolean | undefined
}

/**
 * Render a stored key as a status row with a Replace button, or the password
 * input when no key is stored, the user pressed Replace, or a draft exists.
 * A blank draft writes nothing, so pressing Replace and then Cancel leaves the
 * stored key untouched. The input collapses again when the draft is cleared
 * from outside, which is how a saved form returns to the status row.
 * @param props - draft, stored state, and copy.
 * @returns the status row, the locked notice, or the input.
 */
export function SecretKeyInput(props: SecretKeyInputProps) {
  const { configured, value, labels } = props
  const [replacing, setReplacing] = useState(false)
  const typed = useRef(false)
  const previous = useRef(value)
  useEffect(() => {
    // A draft emptied by the parent (not by the user's own edit) means the
    // form was saved or reset, so the row goes back to the configured state.
    if (previous.current.length > 0 && value.length === 0 && !typed.current) setReplacing(false)
    previous.current = value
    typed.current = false
  }, [value])

  if (props.lockedLabel !== undefined) {
    return (
      <div className={css.row} data-state="locked">
        <StateDot state="done" />
        <span className={css.status}>{props.lockedLabel}</span>
      </div>
    )
  }
  if (configured && !replacing && value.length === 0) {
    return (
      <div className={css.row} data-state="configured">
        <StateDot state="done" />
        <span className={css.status} role="status">{labels.configured}</span>
        <Button size="sm" variant="outline" disabled={props.disabled} onClick={() => { setReplacing(true) }}>
          {labels.replace}
        </Button>
      </div>
    )
  }
  return (
    <div className={css.row} data-state="editing">
      <input
        id={props.id}
        className={css.input}
        type="password"
        autoComplete="new-password"
        value={value}
        placeholder={labels.placeholder}
        aria-label={labels.input}
        aria-invalid={props.invalid === true}
        required={props.required === true}
        autoFocus={props.autoFocus === true || replacing}
        disabled={props.disabled}
        onChange={(event) => {
          typed.current = true
          props.onChange(event.target.value)
        }}
      />
      {configured
        ? (
          <Button
            size="sm"
            variant="ghost"
            disabled={props.disabled}
            onClick={() => {
              typed.current = true
              props.onChange('')
              setReplacing(false)
            }}
          >
            {labels.cancel}
          </Button>
        )
        : null}
    </div>
  )
}
